"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { TransferModal } from "@/components/TransferModal";
import { IssueCardModal } from "@/components/IssueCardModal";
import { AddSymbolModal } from "@/components/AddSymbolModal";
import { buildPortfolioSeries, type SymbolBars } from "@/lib/portfolio-series";
import { getTodaySessionBounds } from "@/lib/market-sessions";
import { makeLiveDot } from "@/components/ui/LiveDot";
import type { StockInfo } from "@/lib/useStockData";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Activity, Copy, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { cn } from "@/lib/utils";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";
const AMBER = "#F59E0B";
const SPARK_WIDTH = 96;
const SPARK_HEIGHT = 32;

const PERIODS = [
  // 1D = rolling 24h: pull 2 days with extended-hours bars, filter to last 86 400s,
  // and append a live "now" bar so the curve walks all the way to the present.
  { key: "1D",  range: "2d",  interval: "5m",  extendedHours: true,  windowSeconds: 86_400 },
  { key: "1W",  range: "5d",  interval: "30m", extendedHours: false, windowSeconds: 0 },
  { key: "1M",  range: "1mo", interval: "1d",  extendedHours: false, windowSeconds: 0 },
  { key: "3M",  range: "3mo", interval: "1d",  extendedHours: false, windowSeconds: 0 },
  { key: "YTD", range: "ytd", interval: "1d",  extendedHours: false, windowSeconds: 0 },
  { key: "1Y",  range: "1y",  interval: "1d",  extendedHours: false, windowSeconds: 0 },
  { key: "ALL", range: "max", interval: "1mo", extendedHours: false, windowSeconds: 0 },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];
const intradayKeys: PeriodKey[] = ["1D", "1W"];

type ChartPoint = {
  time: string;
  t: number;
  /** Realized portfolio value at this timestamp; null after "now" so the
   *  solid line only paints the past. */
  value: number | null;
  /** Mirror of the current value, populated only from "now" forward, so the
   *  dotted projection can render without colliding with `value`. */
  projection: number | null;
};

type MarketState = { label: string; color: string };

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

function Sparkline({ data, positive }: { data: { price: number }[]; positive: boolean }) {
  if (data.length < 2) {
    return <div style={{ width: SPARK_WIDTH, height: SPARK_HEIGHT }} />;
  }
  return (
    <LineChart
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      data={data}
      margin={{ top: 2, bottom: 2, left: 0, right: 0 }}
    >
      <YAxis hide domain={['dataMin', 'dataMax']} />
      <Line
        type="monotone"
        dataKey="price"
        stroke={positive ? PROFIT : LOSS}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [marketState, setMarketState] = useState<MarketState>(() => getMarketState(new Date()));
  const [period, setPeriod] = useState<PeriodKey>("1D");
  const [fetchedBars, setFetchedBars] = useState<{ symbol: string; bars: { t: number; price: number }[] }[] | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  // Modals triggered from the onboarding checklist on the home page.
  const [depositOpen, setDepositOpen] = useState(false);
  const [issueCardOpen, setIssueCardOpen] = useState(false);
  const [addSymbolOpen, setAddSymbolOpen] = useState(false);

  const {
    stocks,
    transactions,
    isLive,
    isReady,
    usingMockData,
    totalPortfolioValue,
    totalGain,
    totalGainPercent,
    dayChange,
    dayChangePercent,
    cashBalance,
    totalWealth,
    firstName,
    lastName,
    card,
    refresh,
  } = useGlobalStockData();

  useEffect(() => {
    setMounted(true);
    const tick = () => setMarketState(getMarketState(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch bars for the active period. Does NOT depend on `stocks` (the array
  // reference changes on every WS tick); we key on the joined symbol list so
  // the fetch only re-fires when the watchlist actually changes.
  useEffect(() => {
    let cancelled = false;
    const cfg = PERIODS.find(p => p.key === period)!;
    const symbolList = stocks.map(s => s.symbol);
    if (symbolList.length === 0) {
      setFetchedBars([]);
      return;
    }

    const load = async () => {
      setChartLoading(true);
      try {
        const responses = await Promise.all(symbolList.map(async (symbol) => {
          try {
            const params = new URLSearchParams({ symbol, range: cfg.range, interval: cfg.interval });
            if (cfg.extendedHours) params.set('includePrePost', 'true');
            const res = await fetch(`/api/history?${params}`);
            if (!res.ok) return { symbol, bars: [] as { t: number; price: number }[] };
            const data: { points?: { t: number; price: number }[] } = await res.json();
            return { symbol, bars: data.points ?? [] };
          } catch {
            return { symbol, bars: [] as { t: number; price: number }[] };
          }
        }));
        if (cancelled) return;
        setFetchedBars(responses);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, stocks.map(s => s.symbol).join(',')]);

  // Derive the chart series from fetched bars + live prices + transactions.
  // This re-runs on every WS tick because `stocks` changes; that's how the 1D
  // chart's tail "now" bar tracks the live price in real time.
  const chartData = useMemo<ChartPoint[] | null>(() => {
    if (fetchedBars === null) return null;
    const cfg = PERIODS.find(p => p.key === period)!;
    const isIntraday = intradayKeys.includes(period);
    const nowT = Math.floor(Date.now() / 1000);

    // For 1D we anchor the X-axis to today's pre-market open → after-hours
    // close. Older bars get filtered out and the chart fills the rest of
    // the day with a flat dotted projection at the current value.
    const todayBounds = period === '1D' ? getTodaySessionBounds() : null;
    const cutoff = todayBounds
      ? todayBounds.preOpen
      : cfg.windowSeconds > 0 ? nowT - cfg.windowSeconds : 0;

    const symbolBars: SymbolBars[] = fetchedBars
      .map(r => {
        let bars = cutoff > 0 ? r.bars.filter(b => b.t >= cutoff) : r.bars;
        if (period === '1D') {
          // Append a synthetic "now" bar with the latest live price so the
          // series carries the user's current portfolio value as its tail.
          const stock = stocks.find(s => s.symbol === r.symbol);
          if (stock && stock.price > 0) {
            const lastT = bars.length > 0 ? bars[bars.length - 1].t : 0;
            if (lastT < nowT) bars = [...bars, { t: nowT, price: stock.price }];
          }
        }
        return { symbol: r.symbol, bars };
      })
      .filter(r => r.bars.length > 0);

    if (symbolBars.length === 0) return [];

    const series = buildPortfolioSeries(symbolBars, transactions);
    const points: ChartPoint[] = series.map(p => ({
      time: isIntraday
        ? new Date(p.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date(p.t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      t: p.t,
      value: p.value,
      projection: null,
    }));

    // For 1D, append a flat dotted projection from "now" to after-hours
    // close. The boundary point carries both `value` and `projection` so
    // the two <Area> series visually meet without a gap.
    if (todayBounds && points.length > 0) {
      const lastReal = points[points.length - 1];
      lastReal.projection = lastReal.value;
      const intervalSec = 5 * 60;
      const startProjection = lastReal.t + intervalSec;
      const endProjection = todayBounds.postClose;
      if (startProjection <= endProjection) {
        const flatValue = lastReal.value ?? 0;
        for (let t = startProjection; t <= endProjection; t += intervalSec) {
          points.push({
            time: new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            t,
            value: null,
            projection: flatValue,
          });
        }
      }
    }
    return points;
  }, [fetchedBars, stocks, transactions, period]);

  const chartReady = !chartLoading && chartData != null && chartData.length >= 2;
  // Index of the last point that carries a real (non-null) `value`. For 1D
  // this is the "now" boundary; for other periods it's the final point.
  const lastRealIndex = useMemo(() => {
    if (!chartData) return -1;
    for (let i = chartData.length - 1; i >= 0; i--) {
      if (chartData[i].value != null) return i;
    }
    return -1;
  }, [chartData]);
  const chartAccent = useMemo(() => {
    if (!chartReady || !chartData || lastRealIndex < 0) return totalGain >= 0 ? PROFIT : LOSS;
    const first = chartData.find(p => p.value != null)?.value ?? 0;
    const last = chartData[lastRealIndex].value ?? first;
    return last >= first ? PROFIT : LOSS;
  }, [chartData, chartReady, lastRealIndex, totalGain]);

  if (!mounted) {
    return (
      <div className="flex flex-col flex-1 min-h-screen bg-background items-center justify-center w-full">
        <Activity className="h-10 w-10 animate-pulse" style={{ color: PROFIT }} />
      </div>
    );
  }

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
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest" style={{ color: marketState.color }}>
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

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <OnboardingChecklist
          onAddSymbol={() => setAddSymbolOpen(true)}
          onDeposit={() => setDepositOpen(true)}
          onIssueCard={() => setIssueCardOpen(true)}
        />

        <section>
          <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Portfolio</p>
          {isReady ? (
            <>
              <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold font-mono tracking-tight mt-2 leading-none break-words">
                ${totalWealth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h1>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-4">
                <p className="text-base font-semibold font-mono" style={{ color: totalGain >= 0 ? PROFIT : LOSS }}>
                  {totalGain >= 0 ? "+" : ""}${totalGain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({totalGainPercent.toFixed(2)}%)
                  <span className="ml-2 text-muted-foreground font-medium">All time</span>
                </p>
                <p className="text-base font-semibold font-mono" style={{ color: dayChange >= 0 ? PROFIT : LOSS }}>
                  {dayChange >= 0 ? "+" : ""}${dayChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({dayChangePercent.toFixed(2)}%)
                  <span className="ml-2 text-muted-foreground font-medium">Today</span>
                </p>
              </div>
              <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm font-mono text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="ml-2 uppercase text-[10px] font-bold tracking-widest">Cash</span>
                </p>
                <p>
                  <span className="font-semibold text-foreground">${totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="ml-2 uppercase text-[10px] font-bold tracking-widest">Investments</span>
                </p>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="h-20 md:h-28 w-72 md:w-[28rem] mt-2" />
              <Skeleton className="h-5 w-80 mt-5" />
            </>
          )}
        </section>

        <section className="space-y-3">
          <div className="h-[260px] sm:h-[360px] -mx-4 sm:-mx-6 md:mx-0" style={{ touchAction: 'pan-y' }}>
            {chartReady ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={chartData!} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="homeChartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartAccent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartAccent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <XAxis hide dataKey="time" />
                  <Tooltip
                    cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3', strokeOpacity: 0.6 }}
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '6px 10px',
                    }}
                    labelStyle={{ color: 'var(--muted-foreground)', fontSize: '11px' }}
                    itemStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                    formatter={(v, name) => {
                      if (typeof v !== 'number') return null;
                      return [`$${v.toFixed(2)}`, name === 'projection' ? 'Projected' : 'Value'];
                    }}
                  />
                  {/* Solid past — the realized portfolio value up to "now". */}
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={chartAccent}
                    strokeWidth={2}
                    fill="url(#homeChartGradient)"
                    isAnimationActive={false}
                    connectNulls={false}
                    dot={makeLiveDot({ lastIndex: lastRealIndex, color: chartAccent, visible: isLive && period === '1D' })}
                    activeDot={{ r: 4, fill: chartAccent, stroke: 'var(--background)', strokeWidth: 2 }}
                  />
                  {/* Dotted future — flat at the current value out to today's
                       after-hours close (1D only; other periods leave this
                       series empty so it renders nothing). */}
                  <Area
                    type="monotone"
                    dataKey="projection"
                    stroke={chartAccent}
                    strokeWidth={1.5}
                    strokeDasharray="3 5"
                    strokeOpacity={0.55}
                    fill="transparent"
                    isAnimationActive={false}
                    connectNulls={false}
                    activeDot={false}
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

        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Positions</h2>
          {stocks.some(s => s.shares > 0) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stocks.filter(s => s.shares > 0).map(stock => (
                <PositionCard key={stock.symbol} stock={stock} isReady={isReady} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center text-sm text-muted-foreground">
              No active positions yet. Buy shares of a stock to open your first position.
            </div>
          )}
        </section>

        {stocks.some(s => s.shares === 0) && (
          <section className="md:hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Watchlist</h2>
              <button
                type="button"
                onClick={() => setAddSymbolOpen(true)}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                + Add
              </button>
            </div>
            <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
              {stocks.filter(s => s.shares === 0).map(stock => (
                <WatchlistRow key={stock.symbol} stock={stock} isReady={isReady} />
              ))}
            </div>
          </section>
        )}
      </main>

      <TransferModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        mode="deposit"
        cashBalance={cashBalance}
        refresh={refresh}
      />
      <IssueCardModal
        open={issueCardOpen}
        onClose={() => setIssueCardOpen(false)}
        firstName={firstName}
        lastName={lastName}
        hasActiveCard={!!card && card.status !== 'cancelled'}
        refresh={refresh}
      />
      <AddSymbolModal
        open={addSymbolOpen}
        onClose={() => setAddSymbolOpen(false)}
        refresh={refresh}
      />
    </div>
  );
}

function PositionCard({ stock, isReady }: { stock: StockInfo; isReady: boolean }) {
  const router = useRouter();
  const positive = stock.change >= 0;
  const value = stock.price * stock.shares;
  const positionGain = value - stock.costBasisTotal;

  const items: ContextMenuItem[] = [
    { kind: 'header', label: stock.symbol },
    {
      kind: 'item',
      label: 'Open chart',
      icon: <ExternalLink />,
      onClick: () => router.push(`/stock/${stock.symbol}`),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: `Buy ${stock.symbol}`,
      icon: <TrendingUp />,
      onClick: () => router.push(`/stock/${stock.symbol}?action=buy`),
    },
    {
      kind: 'item',
      label: `Sell ${stock.symbol}`,
      icon: <TrendingDown />,
      disabled: stock.shares <= 0,
      onClick: () => router.push(`/stock/${stock.symbol}?action=sell`),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Copy symbol',
      icon: <Copy />,
      onClick: () => {
        void navigator.clipboard.writeText(stock.symbol).then(() => {
          toast.success(`Copied ${stock.symbol}`);
        });
      },
    },
  ];

  const { onContextMenu, menu } = useContextMenu(items);

  return (
    <Link
      href={`/stock/${stock.symbol}`}
      onContextMenu={onContextMenu}
      className="rounded-lg border border-border/40 p-4 hover:border-border hover:bg-foreground/[0.02] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight">{stock.symbol}</p>
          <p className="text-xs text-muted-foreground truncate">{stock.name}</p>
        </div>
        <Sparkline data={stock.history} positive={positive} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          {isReady ? (
            <p className="font-mono font-bold text-xl">
              ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          ) : (
            <Skeleton className="h-6 w-20" />
          )}
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-1">
            {stock.shares} shares
          </p>
        </div>
        {isReady ? (
          <div className="text-right">
            <p className="text-sm font-bold font-mono" style={{ color: positive ? PROFIT : LOSS }}>
              {positive ? "+" : ""}{stock.changePercent.toFixed(2)}%
            </p>
            <p className="text-[10px] font-medium font-mono mt-0.5" style={{ color: positionGain >= 0 ? PROFIT : LOSS }}>
              {positionGain >= 0 ? "+" : ""}${positionGain.toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>
        )}
      </div>
      {menu}
    </Link>
  );
}

function WatchlistRow({ stock, isReady }: { stock: StockInfo; isReady: boolean }) {
  const positive = stock.change >= 0;
  return (
    <Link
      href={`/stock/${stock.symbol}`}
      className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-foreground/[0.02] transition-colors"
    >
      <div className="flex flex-col min-w-0 shrink-0">
        <span className="text-sm font-bold tracking-tight">{stock.symbol}</span>
        {isReady ? (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            ${stock.price.toFixed(2)}
          </span>
        ) : (
          <Skeleton className="h-3 w-12 mt-1" />
        )}
      </div>
      <Sparkline data={stock.history} positive={positive} />
      <div className="text-right shrink-0 min-w-[3.5rem]">
        {isReady ? (
          <span
            className="text-xs font-bold font-mono tabular-nums"
            style={{ color: positive ? PROFIT : LOSS }}
          >
            {positive ? "+" : ""}{stock.changePercent.toFixed(2)}%
          </span>
        ) : (
          <Skeleton className="h-3 w-10" />
        )}
      </div>
    </Link>
  );
}
