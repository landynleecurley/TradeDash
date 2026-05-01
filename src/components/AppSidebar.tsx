"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { AddSymbolModal } from "@/components/AddSymbolModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { removeWatchlist } from "@/lib/actions";
import { useContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AnimatedNumber,
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/components/ui/AnimatedNumber";
import {
  Activity, Copy, ExternalLink, LogOut, Plus,
  Trash2, TrendingDown, TrendingUp, X,
} from "lucide-react";
import { LineChart, Line, YAxis } from "recharts";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";
const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 28;

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

export function AppSidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ symbol: string; shares: number } | null>(null);
  const {
    stocks,
    isReady,
    totalWealth,
    totalGain,
    totalGainPercent,
    dayChange,
    dayChangePercent,
    cashBalance,
    refresh,
  } = useGlobalStockData();

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeSymbol = pathname?.match(/^\/stock\/([^/]+)/)?.[1]?.toUpperCase();

  if (!mounted) {
    return (
      <Sidebar>
        <SidebarHeader className="p-4 border-b border-border/40">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Activity className="h-5 w-5" style={{ color: PROFIT }} />
            TradeDash
          </div>
        </SidebarHeader>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-border/40">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
          <Activity className="h-5 w-5" style={{ color: PROFIT }} />
          TradeDash
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest">
            Summary
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-3 pb-3">
            <div className="px-2 py-2">
              {isReady ? (
                <>
                  <AnimatedNumber
                    value={totalWealth}
                    formatter={formatCurrency()}
                    className="text-2xl font-bold font-mono tracking-tight tabular-nums block"
                  />
                  <p
                    className="text-xs font-semibold mt-1.5 font-mono tabular-nums"
                    style={{ color: totalGain >= 0 ? PROFIT : LOSS }}
                  >
                    <AnimatedNumber value={totalGain} formatter={formatSignedCurrency()} />
                    {" ("}
                    <AnimatedNumber value={totalGainPercent} formatter={formatSignedPercent()} />
                    {")"}
                    <span className="text-muted-foreground font-medium ml-1">All time</span>
                  </p>
                  <p
                    className="text-xs font-semibold mt-0.5 font-mono tabular-nums"
                    style={{ color: dayChange >= 0 ? PROFIT : LOSS }}
                  >
                    <AnimatedNumber value={dayChange} formatter={formatSignedCurrency()} />
                    {" ("}
                    <AnimatedNumber value={dayChangePercent} formatter={formatSignedPercent()} />
                    {")"}
                    <span className="text-muted-foreground font-medium ml-1">Today</span>
                  </p>
                  <p className="text-xs font-mono mt-2 pt-2 border-t border-border/40 text-muted-foreground tabular-nums">
                    <AnimatedNumber
                      value={cashBalance}
                      formatter={formatCurrency()}
                      className="font-semibold text-foreground"
                    />
                    <span className="ml-1">Cash</span>
                  </p>
                </>
              ) : (
                <>
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-3 w-40 mt-2" />
                  <Skeleton className="h-3 w-36 mt-1" />
                </>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <div className="flex items-center justify-between pr-2">
            <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-widest">
              Watchlist
            </SidebarGroupLabel>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="p-1 rounded text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
              aria-label="Add symbol"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <SidebarGroupContent>
            {stocks.length === 0 && isReady && (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Empty. <button type="button" onClick={() => setAddOpen(true)} className="font-semibold text-foreground hover:underline">Add a symbol</button>.
              </p>
            )}
            <SidebarMenu>
              {stocks.map((stock) => (
                <WatchlistRow
                  key={stock.symbol}
                  stock={stock}
                  isReady={isReady}
                  isActive={activeSymbol === stock.symbol}
                  onRemove={() => {
                    if (stock.shares > 0) {
                      setPendingRemoval({ symbol: stock.symbol, shares: stock.shares });
                    } else {
                      void removeWatchlist({ symbol: stock.symbol }).then(async (res) => {
                        if (res.ok) {
                          await refresh();
                          toast.success(`${stock.symbol} removed from watchlist`);
                        } else {
                          toast.error(res.error);
                        }
                      });
                    }
                  }}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border/40 p-2">
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </SidebarFooter>
      <AddSymbolModal open={addOpen} onClose={() => setAddOpen(false)} refresh={refresh} />
      <ConfirmModal
        open={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        onConfirm={async () => {
          if (!pendingRemoval) return;
          const res = await removeWatchlist({ symbol: pendingRemoval.symbol });
          if (res.ok) {
            await refresh();
            toast.success(`${pendingRemoval.symbol} removed from watchlist`);
          } else {
            toast.error(res.error);
          }
        }}
        title={`Remove ${pendingRemoval?.symbol ?? ''} from watchlist?`}
        message={
          pendingRemoval
            ? `You still hold ${pendingRemoval.shares} shares of ${pendingRemoval.symbol}. Removing it from your watchlist hides the symbol from the sidebar but keeps your position. You can re-add ${pendingRemoval.symbol} via the search bar any time.`
            : ''
        }
        confirmLabel="Remove"
        destructive
      />
    </Sidebar>
  );
}

type WatchlistRowProps = {
  stock: ReturnType<typeof useGlobalStockData>['stocks'][number];
  isReady: boolean;
  isActive: boolean;
  onRemove: () => void;
};

function WatchlistRow({ stock, isReady, isActive, onRemove }: WatchlistRowProps) {
  const router = useRouter();
  const positive = stock.change >= 0;

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
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Remove from watchlist',
      icon: <Trash2 />,
      onClick: onRemove,
      destructive: true,
    },
  ];

  const { onContextMenu, menu } = useContextMenu(items);

  return (
    <SidebarMenuItem className="group/row relative" onContextMenu={onContextMenu}>
      <SidebarMenuButton
        render={<Link href={`/stock/${stock.symbol}`} />}
        isActive={isActive}
        className="h-auto py-2 px-3 mx-1 rounded-md hover:bg-foreground/5 data-[active=true]:bg-foreground/10 transition-colors"
      >
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex flex-col min-w-0 shrink-0">
            <span className="text-sm font-bold tracking-tight">{stock.symbol}</span>
            {isReady ? (
              <AnimatedNumber
                value={stock.price}
                formatter={formatCurrency()}
                duration={250}
                className="font-mono text-xs text-muted-foreground tabular-nums"
              />
            ) : (
              <Skeleton className="h-3 w-12 mt-1" />
            )}
          </div>
          <Sparkline data={stock.history} positive={positive} />
          <div className="flex flex-col items-end shrink-0 min-w-[3.5rem]">
            {isReady ? (
              <AnimatedNumber
                value={stock.changePercent}
                formatter={formatSignedPercent()}
                duration={250}
                className="text-xs font-bold font-mono tabular-nums"
                style={{ color: positive ? PROFIT : LOSS }}
              />
            ) : (
              <Skeleton className="h-3 w-10" />
            )}
          </div>
        </div>
      </SidebarMenuButton>
      {/* Inline X button for visible-on-hover quick removal — context menu
          is the long-form alternative for mouse users. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center bg-background/80 backdrop-blur-sm text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500 opacity-0 group-hover/row:opacity-100 transition-opacity"
        aria-label={`Remove ${stock.symbol} from watchlist`}
      >
        <X className="h-3 w-3" />
      </button>
      {menu}
    </SidebarMenuItem>
  );
}

