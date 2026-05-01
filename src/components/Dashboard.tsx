"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AnimatedNumber,
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/components/ui/AnimatedNumber";
import { TradeModal } from "@/components/TradeModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PriceAlertModal } from "@/components/PriceAlertModal";
import { addWatchlist, removeWatchlist, deletePriceAlert } from "@/lib/actions";
import { getTodaySessionBounds, sessionAt, SESSION_LABEL, formatTimeOfDay } from "@/lib/market-sessions";
import { makeLiveDot } from "@/components/ui/LiveDot";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from "recharts";
import { Activity, ExternalLink, Bell, ArrowUp, ArrowDown, Check, X as XIcon, Crown } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { cn } from "@/lib/utils";

type StockInfo = {
  symbol: string;
  profile: {
    name: string | null;
    industry: string | null;
    country: string | null;
    exchange: string | null;
    ipo: string | null;
    logo: string | null;
    weburl: string | null;
    currency: string | null;
    marketCap: number | null;
    sharesOutstanding: number | null;
  } | null;
  quote: {
    price: number | null;
    high: number | null;
    low: number | null;
    open: number | null;
    previousClose: number | null;
  } | null;
  metrics: {
    peTTM: number | null;
    epsTTM: number | null;
    dividendYield: number | null;
    avgVolume10d: number | null;
    high52Week: number | null;
    low52Week: number | null;
    beta: number | null;
  };
};

type NewsArticle = {
  id: number;
  headline: string;
  source: string;
  url: string;
  image: string | null;
  summary: string;
  datetime: number;
};

function compactDollars(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString();
}

function dollarsExact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function relativeTime(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";
const AMBER = "#F59E0B";

const PERIODS = [
  { key: "1D",  range: "1d",  interval: "5m"  },
  { key: "1W",  range: "5d",  interval: "30m" },
  { key: "1M",  range: "1mo", interval: "1d"  },
  { key: "3M",  range: "3mo", interval: "1d"  },
  { key: "YTD", range: "ytd", interval: "1d"  },
  { key: "1Y",  range: "1y",  interval: "1d"  },
  { key: "ALL", range: "max", interval: "1mo" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

const intradayKeys: PeriodKey[] = ["1D", "1W"];

type ChartPoint = { time: string; price: number; t: number };

type MarketState = {
  label: string;
  color: string;
};

function getMarketState(now: Date): MarketState {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  let hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  if (hour === 24) hour = 0;
  const minutes = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') return { label: 'Closed', color: 'var(--muted-foreground)' };
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return { label: 'Pre-Market', color: AMBER };
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return { label: 'Market Open', color: PROFIT };
  if (minutes >= 16 * 60 && minutes < 20 * 60) return { label: 'After-Hours', color: AMBER };
  return { label: 'Closed', color: 'var(--muted-foreground)' };
}

export function Dashboard({ symbol }: { symbol: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [marketState, setMarketState] = useState<MarketState>(() => getMarketState(new Date()));
  const [period, setPeriod] = useState<PeriodKey>("1D");
  const [chartData, setChartData] = useState<ChartPoint[] | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[] | null>(null);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const { stocks, isLive, isReady, usingMockData, cashBalance, dayPnLBySymbol, refresh } = useGlobalStockData();
  // No fallback to stocks[0]: with a per-user watchlist this can be empty,
  // which would mask "you don't own this symbol" as "you do." Keep undefined
  // and handle it explicitly below.
  const selectedStock = stocks.find(s => s.symbol === symbol);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tick = () => setMarketState(getMarketState(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Honor `?action=buy|sell` (e.g., from the right-click Buy/Sell items in
  // the sidebar/position cards). Auto-open the trade modal once the stock
  // is loaded, then strip the query so a refresh doesn't reopen it.
  useEffect(() => {
    if (!isReady || !selectedStock) return;
    const action = searchParams.get('action');
    if (action !== 'buy' && action !== 'sell') return;
    if (action === 'sell' && selectedStock.shares <= 0) return;
    setTradeMode(action);
    router.replace(pathname, { scroll: false });
  }, [isReady, selectedStock, searchParams, pathname, router]);

  // Fetch historical bars when the period changes (or symbol changes while
  // viewing a non-1D period). 1D pulls from selectedStock.history, which is
  // already populated by useStockData on mount and kept current via the WS stream.
  useEffect(() => {
    if (period === '1D' || !selectedStock?.symbol) {
      setChartData(null);
      return;
    }
    let cancelled = false;
    const cfg = PERIODS.find(p => p.key === period)!;
    const isIntraday = intradayKeys.includes(period);

    const load = async () => {
      try {
        setChartLoading(true);
        const res = await fetch(`/api/history?symbol=${encodeURIComponent(selectedStock.symbol)}&range=${cfg.range}&interval=${cfg.interval}`);
        if (!res.ok) throw new Error(`history ${res.status}`);
        const data: { points?: { t: number; price: number }[] } = await res.json();
        if (cancelled || !data.points) return;
        const points: ChartPoint[] = data.points.map(p => ({
          time: isIntraday
            ? new Date(p.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date(p.t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          price: p.price,
          t: p.t,
        }));
        setChartData(points);
      } catch (err) {
        console.error('history fetch failed', err);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    setChartData(null);
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedStock?.symbol, period]);

  // Pull company profile, key metrics, and news in parallel whenever the
  // symbol changes. Both routes are server-cached so flicking between
  // already-visited tickers stays snappy.
  useEffect(() => {
    if (!selectedStock?.symbol) return;
    let cancelled = false;
    setStockInfo(null);
    setNewsArticles(null);
    (async () => {
      try {
        const [infoRes, newsRes] = await Promise.all([
          fetch(`/api/stock-info?symbol=${encodeURIComponent(selectedStock.symbol)}`),
          fetch(`/api/stock-news?symbol=${encodeURIComponent(selectedStock.symbol)}`),
        ]);
        if (cancelled) return;
        if (infoRes.ok) setStockInfo(await infoRes.json());
        if (newsRes.ok) {
          const data: { articles?: NewsArticle[] } = await newsRes.json();
          setNewsArticles(data.articles ?? []);
        }
      } catch (err) {
        console.error('stock info fetch failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedStock?.symbol]);

  // Defensive while still above the early-return — keeps hook order stable.
  const positive = (selectedStock?.change ?? 0) >= 0;
  const accent = positive ? PROFIT : LOSS;

  // 1D draws from the live WS-fed history; other periods use the fetched bars.
  const activeChartData: ChartPoint[] | null = period === '1D'
    ? (selectedStock && selectedStock.history.length >= 2 ? selectedStock.history : null)
    : chartData;

  // Color the chart line/gradient based on the period's net move (first vs. last point),
  // not today's session direction.
  const chartAccent = useMemo(() => {
    if (!activeChartData || activeChartData.length < 2) return accent;
    return activeChartData[activeChartData.length - 1].price >= activeChartData[0].price ? PROFIT : LOSS;
  }, [activeChartData, accent]);

  if (!mounted) {
    return (
      <div className="flex flex-col flex-1 min-h-screen bg-background items-center justify-center w-full">
        <Activity className="h-10 w-10 animate-pulse" style={{ color: PROFIT }} />
      </div>
    );
  }

  // After mount: if the watchlist hasn't loaded yet, show the same loading state.
  // Once loaded, if the URL symbol isn't on the watchlist, prompt to add it
  // rather than crashing on a missing record.
  if (!isReady) {
    return (
      <div className="flex flex-col flex-1 min-h-screen bg-background items-center justify-center w-full">
        <Activity className="h-10 w-10 animate-pulse" style={{ color: PROFIT }} />
      </div>
    );
  }

  if (!selectedStock) {
    return (
      <div className="flex flex-col flex-1 w-full bg-background">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
          <SearchBar className="w-full max-w-sm shrink" />
          <TopNav className="hidden lg:flex shrink-0" />
        </header>
        <main className="flex-1 w-full max-w-md mx-auto px-4 sm:px-6 py-16 flex flex-col items-center text-center gap-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Not in your watchlist</p>
          <h1 className="text-3xl font-bold tracking-tight">{symbol}</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Add this symbol to your watchlist to see live price data and start trading it.
          </p>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              onClick={async () => {
                if (adding) return;
                setAdding(true);
                try {
                  const res = await addWatchlist({ symbol });
                  if (res.ok) {
                    await refresh();
                    toast.success(`${symbol} added to watchlist`);
                  } else {
                    toast.error(res.error);
                  }
                } finally {
                  setAdding(false);
                }
              }}
              disabled={adding}
              style={{ backgroundColor: PROFIT, color: "#000" }}
              className="font-bold uppercase tracking-widest"
            >
              {adding ? "Adding…" : "Add to watchlist"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/")}>
              Back home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Session band ranges only apply to the intraday 1D view.
  const sessionBands = period === '1D' && activeChartData && activeChartData.length >= 2
    ? (() => {
        const bounds = getTodaySessionBounds();
        if (!bounds.isWeekday) return null;
        const minT = activeChartData[0].t;
        const maxT = activeChartData[activeChartData.length - 1].t;
        // Clip each band to the chart's visible domain so a partial morning
        // session doesn't paint a band that extends past the data.
        const clip = (a: number, b: number): [number, number] | null => {
          const lo = Math.max(a, minT);
          const hi = Math.min(b, maxT);
          return lo < hi ? [lo, hi] : null;
        };
        return {
          pre: clip(bounds.preOpen, bounds.regularOpen),
          regular: clip(bounds.regularOpen, bounds.regularClose),
          after: clip(bounds.regularClose, bounds.postClose),
          openLine: bounds.regularOpen >= minT && bounds.regularOpen <= maxT ? bounds.regularOpen : null,
          closeLine: bounds.regularClose >= minT && bounds.regularClose <= maxT ? bounds.regularClose : null,
        };
      })()
    : null;

  const positionValue = selectedStock.price * selectedStock.shares;
  const positionGain = positionValue - selectedStock.costBasisTotal;
  const positionGainPercent = selectedStock.costBasisTotal === 0
    ? 0
    : (positionGain / selectedStock.costBasisTotal) * 100;
  const dayDollar = dayPnLBySymbol[selectedStock.symbol]?.dollar ?? 0;
  const chartReady = period === '1D'
    ? activeChartData != null && activeChartData.length >= 2
    : !chartLoading && activeChartData != null && activeChartData.length >= 2;

  const doRemove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      const res = await removeWatchlist({ symbol: selectedStock.symbol });
      if (res.ok) {
        await refresh();
        toast.success(`${selectedStock.symbol} removed from watchlist`);
        router.replace('/');
      } else {
        toast.error(res.error);
      }
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <div className="ml-auto flex items-center gap-4">
          <NotificationsBell />
          {usingMockData && (
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mock</span>
          )}
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: marketState.color }} />
            <span
              className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest"
              style={{ color: marketState.color }}
            >
              {marketState.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn("h-2 w-2 rounded-full", isLive ? "animate-pulse" : "bg-muted-foreground/40")}
              style={isLive ? { backgroundColor: PROFIT } : undefined}
            />
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {isLive ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section>
          <p className="text-sm font-medium text-muted-foreground tracking-wide">{selectedStock.name}</p>
          {isReady ? (
            <>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold font-mono tracking-tight mt-1 tabular-nums">
                <AnimatedNumber value={selectedStock.price} formatter={formatCurrency()} duration={300} />
              </h1>
              <p className="text-sm font-semibold mt-2 font-mono tabular-nums" style={{ color: accent }}>
                <AnimatedNumber value={selectedStock.change} formatter={formatSignedCurrency()} duration={300} />
                {" ("}
                <AnimatedNumber value={selectedStock.changePercent} formatter={formatSignedPercent()} duration={300} />
                {")"}
                <span className="ml-2 text-muted-foreground font-medium">Today</span>
              </p>
            </>
          ) : (
            <>
              <Skeleton className="h-14 w-56 mt-2" />
              <Skeleton className="h-4 w-44 mt-3" />
            </>
          )}
        </section>

        <section className="space-y-3">
          <div className="h-[260px] sm:h-[360px] -mx-4 sm:-mx-6 md:mx-0" style={{ touchAction: 'pan-y' }}>
            {chartReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={activeChartData!} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartAccent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartAccent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  {/* Numeric X-axis on `t` so ReferenceArea/ReferenceLine can
                       speak in unix seconds for session boundaries. */}
                  <XAxis
                    hide
                    dataKey="t"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    scale="time"
                  />

                  {/* 1D-only session shading. Pre/after-hours get a tinted
                       band; the regular-hours range stays unshaded so it
                       reads as the "main" session. */}
                  {sessionBands?.pre && (
                    <ReferenceArea
                      x1={sessionBands.pre[0]}
                      x2={sessionBands.pre[1]}
                      fill={AMBER}
                      fillOpacity={0.05}
                      ifOverflow="hidden"
                      label={{ value: 'PRE', position: 'insideTopLeft', fontSize: 9, fill: AMBER, fillOpacity: 0.7 }}
                    />
                  )}
                  {sessionBands?.after && (
                    <ReferenceArea
                      x1={sessionBands.after[0]}
                      x2={sessionBands.after[1]}
                      fill={AMBER}
                      fillOpacity={0.05}
                      ifOverflow="hidden"
                      label={{ value: 'AFTER', position: 'insideTopRight', fontSize: 9, fill: AMBER, fillOpacity: 0.7 }}
                    />
                  )}
                  {sessionBands?.openLine != null && (
                    <ReferenceLine x={sessionBands.openLine} stroke="var(--border)" strokeDasharray="2 4" />
                  )}
                  {sessionBands?.closeLine != null && (
                    <ReferenceLine x={sessionBands.closeLine} stroke="var(--border)" strokeDasharray="2 4" />
                  )}

                  <Tooltip
                    cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3', strokeOpacity: 0.6 }}
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '8px 10px',
                    }}
                    labelStyle={{ color: 'var(--muted-foreground)', fontSize: '11px' }}
                    itemStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                    labelFormatter={(label, payload) => {
                      const t = typeof label === 'number' ? label : payload?.[0]?.payload?.t;
                      if (typeof t !== 'number') return '';
                      // Show "HH:MM · Pre-Market" on intraday so the user
                      // can see which session a hover lands in.
                      if (period === '1D') {
                        return `${formatTimeOfDay(t)} · ${SESSION_LABEL[sessionAt(t)]}`;
                      }
                      return new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                    }}
                    formatter={(v) => [`$${typeof v === 'number' ? v.toFixed(2) : v}`, 'Price']}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={chartAccent}
                    strokeWidth={2}
                    fill="url(#chartGradient)"
                    isAnimationActive={false}
                    dot={makeLiveDot({
                      lastIndex: activeChartData!.length - 1,
                      color: chartAccent,
                      visible: isLive && period === '1D',
                    })}
                    activeDot={{ r: 4, fill: chartAccent, stroke: 'var(--background)', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full px-6 md:px-0">
                <Skeleton className="h-full w-full rounded-md" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {PERIODS.map(({ key }) => {
              const active = key === period;
              return (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-full transition-colors uppercase tracking-wide",
                    active ? "bg-foreground/10" : "text-muted-foreground hover:bg-foreground/5",
                  )}
                  style={active ? { color: chartAccent } : undefined}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => setTradeMode("buy")}
              disabled={!isReady || selectedStock.price <= 0}
              className="flex-1 h-12 text-sm font-bold uppercase tracking-widest"
              style={{ backgroundColor: PROFIT, color: "#000" }}
            >
              Buy
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTradeMode("sell")}
              disabled={!isReady || selectedStock.shares <= 0 || selectedStock.price <= 0}
              className="flex-1 h-12 text-sm font-bold uppercase tracking-widest"
            >
              Sell
            </Button>
          </div>
          {isReady && (
            <button
              type="button"
              onClick={() => {
                if (removing) return;
                if (selectedStock.shares > 0) {
                  setRemoveConfirmOpen(true);
                  return;
                }
                void doRemove();
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors"
              disabled={removing}
            >
              {removing ? "Removing…" : "Remove from watchlist"}
            </button>
          )}
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-lg overflow-hidden border border-border/40">
          <Stat
            label="Position Value"
            value={isReady ? `$${positionValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null}
          />
          <Stat
            label="Cost Basis"
            value={`$${selectedStock.costBasisTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
          <Stat
            label="Today"
            value={isReady ? `${dayDollar >= 0 ? "+" : "-"}$${Math.abs(dayDollar).toFixed(2)}` : null}
            color={isReady ? (dayDollar >= 0 ? PROFIT : LOSS) : undefined}
          />
          <Stat
            label="Total Gain"
            value={isReady ? `${positionGain >= 0 ? "+" : "-"}$${Math.abs(positionGain).toFixed(2)}` : null}
            sub={isReady ? `${positionGain >= 0 ? "+" : ""}${positionGainPercent.toFixed(2)}%` : undefined}
            color={isReady ? (positionGain >= 0 ? PROFIT : LOSS) : undefined}
          />
        </section>

        <PriceAlertsSection
          symbol={selectedStock.symbol}
          symbolName={selectedStock.name}
          currentPrice={selectedStock.price}
        />

        {/* About */}
        <section className="space-y-4 pt-4 border-t border-border/40">
          <header className="flex items-center gap-3">
            {stockInfo?.profile?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={stockInfo.profile.logo}
                alt=""
                className="h-12 w-12 rounded-lg bg-foreground/5 object-contain p-1"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-foreground/5 flex items-center justify-center text-sm font-bold text-muted-foreground">
                {selectedStock.symbol.slice(0, 2)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-tight truncate">
                About {stockInfo?.profile?.name ?? selectedStock.name}
              </h2>
              {stockInfo?.profile?.weburl && (
                <a
                  href={stockInfo.profile.weburl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  {new URL(stockInfo.profile.weburl).hostname.replace(/^www\./, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </header>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            <AboutCell label="Industry" value={stockInfo?.profile?.industry ?? null} />
            <AboutCell label="Country" value={stockInfo?.profile?.country ?? null} />
            <AboutCell
              label="IPO date"
              value={stockInfo?.profile?.ipo
                ? new Date(stockInfo.profile.ipo).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                : null}
            />
            <AboutCell label="Exchange" value={stockInfo?.profile?.exchange ?? null} />
          </div>
        </section>

        {/* Key statistics */}
        <section className="space-y-4 pt-4 border-t border-border/40">
          <header>
            <h2 className="text-lg font-bold tracking-tight">Key statistics</h2>
            <p className="text-xs text-muted-foreground mt-1">Live quote · key ratios from Finnhub.</p>
          </header>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
            <AboutCell label="Market cap" value={compactDollars(stockInfo?.profile?.marketCap ?? null)} />
            <AboutCell
              label="Price-Earnings ratio"
              value={stockInfo?.metrics.peTTM != null ? stockInfo.metrics.peTTM.toFixed(2) : '—'}
            />
            <AboutCell
              label="Dividend yield"
              value={stockInfo?.metrics.dividendYield != null
                ? `${stockInfo.metrics.dividendYield.toFixed(2)}%`
                : '—'}
            />
            <AboutCell
              label="Average volume"
              value={compactCount(stockInfo?.metrics.avgVolume10d ?? null)}
            />
            <AboutCell label="High today" value={dollarsExact(stockInfo?.quote?.high ?? null)} />
            <AboutCell label="Low today" value={dollarsExact(stockInfo?.quote?.low ?? null)} />
            <AboutCell label="Open price" value={dollarsExact(stockInfo?.quote?.open ?? null)} />
            <AboutCell label="Previous close" value={dollarsExact(stockInfo?.quote?.previousClose ?? null)} />
            <AboutCell label="52 Week high" value={dollarsExact(stockInfo?.metrics.high52Week ?? null)} />
            <AboutCell label="52 Week low" value={dollarsExact(stockInfo?.metrics.low52Week ?? null)} />
            <AboutCell
              label="EPS (TTM)"
              value={stockInfo?.metrics.epsTTM != null ? `$${stockInfo.metrics.epsTTM.toFixed(2)}` : '—'}
            />
            <AboutCell
              label="Beta"
              value={stockInfo?.metrics.beta != null ? stockInfo.metrics.beta.toFixed(2) : '—'}
            />
          </div>
        </section>

        {/* News */}
        <section className="space-y-4 pt-4 border-t border-border/40">
          <header>
            <h2 className="text-lg font-bold tracking-tight">News</h2>
          </header>
          {newsArticles === null ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          ) : newsArticles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent articles for {selectedStock.symbol}.</p>
          ) : (
            <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
              {newsArticles.slice(0, 5).map(article => (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 p-4 hover:bg-foreground/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {article.source} · {relativeTime(article.datetime)}
                    </p>
                    <p className="text-sm font-bold tracking-tight mt-1 line-clamp-2">{article.headline}</p>
                    {article.summary && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{article.summary}</p>
                    )}
                  </div>
                  {article.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.image}
                      alt=""
                      loading="lazy"
                      className="h-16 w-16 rounded-md object-cover bg-foreground/5 shrink-0"
                    />
                  )}
                </a>
              ))}
            </div>
          )}
        </section>
      </main>

      <TradeModal
        open={tradeMode !== null}
        onClose={() => setTradeMode(null)}
        mode={tradeMode ?? "buy"}
        stock={selectedStock}
        cashBalance={cashBalance}
        refresh={refresh}
      />

      <ConfirmModal
        open={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={doRemove}
        title={`Remove ${selectedStock.symbol} from watchlist?`}
        message={`You still hold ${selectedStock.shares} shares of ${selectedStock.symbol} (worth $${(selectedStock.price * selectedStock.shares).toFixed(2)}). Removing it from your watchlist hides the symbol from the sidebar but keeps your position. You can re-add ${selectedStock.symbol} via the search bar any time.`}
        confirmLabel="Remove"
        destructive
      />
    </div>
  );
}

function PriceAlertsSection({
  symbol, symbolName, currentPrice,
}: {
  symbol: string;
  symbolName: string;
  currentPrice: number;
}) {
  const { priceAlerts, isGoldActive, refresh } = useGlobalStockData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const forSymbol = priceAlerts.filter(a => a.symbol === symbol);
  const active = forSymbol.filter(a => !a.triggeredAt);
  const recentlyFired = forSymbol
    .filter(a => a.triggeredAt)
    .slice(0, 3);

  const removeAlert = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const res = await deletePriceAlert(id);
      if (res.ok) {
        await refresh();
        toast.success('Alert removed');
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Price alerts
            {!isGoldActive && (
              <span
                className="ml-2 inline-flex items-center gap-1 normal-case font-bold tracking-[0.2em] px-1.5 py-0.5 rounded text-[9px]"
                style={{ backgroundColor: '#E8B53020', color: '#E8B530' }}
              >
                <Crown className="h-2.5 w-2.5" />
                Gold
              </span>
            )}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5"
        >
          <Bell className="h-3.5 w-3.5" />
          Set alert
        </Button>
      </header>

      {active.length === 0 && recentlyFired.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
          {isGoldActive
            ? `No alerts for ${symbol} yet. We'll ping you the moment it crosses your threshold.`
            : 'Smart price alerts are a Gold benefit. Click Set alert to learn more.'}
        </div>
      ) : (
        <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
          {active.map(a => {
            const accent = a.direction === 'above' ? PROFIT : LOSS;
            const distance = currentPrice > 0
              ? ((a.threshold - currentPrice) / currentPrice) * 100
              : 0;
            return (
              <div key={a.id} className="flex items-center gap-3 p-3">
                <span
                  className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
                >
                  {a.direction === 'above' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-tight">
                    {a.direction === 'above' ? 'Crosses above' : 'Falls below'}
                    <span className="font-mono ml-1.5">${a.threshold.toFixed(2)}</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5 tabular-nums">
                    {currentPrice > 0
                      ? <>{distance >= 0 ? '+' : ''}{distance.toFixed(2)}% vs. now · armed</>
                      : <>Armed · waiting for live price</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAlert(a.id)}
                  disabled={busy === a.id}
                  aria-label="Remove alert"
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 disabled:opacity-40"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {recentlyFired.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-3 opacity-70">
              <span
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-foreground/5 text-muted-foreground"
              >
                <Check className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight line-through decoration-muted-foreground/50">
                  {a.direction === 'above' ? 'Crossed above' : 'Fell below'}
                  <span className="font-mono ml-1.5">${a.threshold.toFixed(2)}</span>
                </p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  Fired at ${a.triggeredPrice?.toFixed(2)} ·{' '}
                  {a.triggeredAt ? new Date(a.triggeredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeAlert(a.id)}
                disabled={busy === a.id}
                aria-label="Remove alert"
                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-40"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {symbolName ? null : null}

      <PriceAlertModal
        open={open}
        onClose={() => setOpen(false)}
        symbol={symbol}
        symbolName={symbolName}
        currentPrice={currentPrice}
        isGoldActive={isGoldActive}
        refresh={refresh}
      />
    </section>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string | null; sub?: string; color?: string }) {
  return (
    <div className="bg-background p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      {value ? (
        <p className="font-mono font-bold mt-2 text-base" style={color ? { color } : undefined}>
          {value}
          {sub && <span className="ml-2 text-xs opacity-80">{sub}</span>}
        </p>
      ) : (
        <Skeleton className="h-5 w-24 mt-2" />
      )}
    </div>
  );
}

function AboutCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {value == null ? (
        <Skeleton className="h-4 w-20 mt-1.5" />
      ) : (
        <p className="text-sm font-semibold tracking-tight mt-1">{value}</p>
      )}
    </div>
  );
}
