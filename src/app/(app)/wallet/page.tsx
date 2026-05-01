"use client";

import { useState, useMemo } from "react";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { toast } from "sonner";
import { TransferModal } from "@/components/TransferModal";
import { DebitCard } from "@/components/DebitCard";
import { IssueCardModal } from "@/components/IssueCardModal";
import { ReportCardModal } from "@/components/ReportCardModal";
import { CardLimitModal } from "@/components/CardLimitModal";
import { PinModal } from "@/components/PinModal";
import { SpendModal } from "@/components/SpendModal";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { OrderPhysicalCardModal } from "@/components/OrderPhysicalCardModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { AnimatedNumber, formatCurrency } from "@/components/ui/AnimatedNumber";
import { setCardStatus } from "@/lib/actions";
import {
  ArrowDownToLine, ArrowUpFromLine, Plus, Minus, Snowflake, CreditCard,
  ShieldAlert, ShoppingBag, Gauge, Lock, Package, Crown,
} from "lucide-react";
import type { Tx } from "@/lib/portfolio-series";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";
const AMBER = "#F59E0B";

function formatDateGroup(unix: number) {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric',
  });
}

// Walk all transactions in chronological order to attach a running cash balance
// to each one (deposit/withdraw/buy/sell/card_spend all touch cash).
function attachRunningBalance(transactions: Tx[]): Map<Tx, number> {
  const sorted = [...transactions].sort((a, b) => a.t - b.t);
  const balanceByTx = new Map<Tx, number>();
  let running = 0;
  for (const tx of sorted) {
    if (tx.type === 'DEPOSIT' || tx.type === 'SELL') running += tx.amount;
    else running -= tx.amount;
    balanceByTx.set(tx, running);
  }
  return balanceByTx;
}

export default function WalletPage() {
  const [transferMode, setTransferMode] = useState<"deposit" | "withdraw" | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [physicalOpen, setPhysicalOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<Tx | null>(null);
  const {
    cashBalance, transactions, card, isReady, isGoldActive, refresh,
    firstName, lastName,
  } = useGlobalStockData();

  const transfers = useMemo(
    () => transactions.filter(t => t.type === 'DEPOSIT' || t.type === 'WITHDRAW').reverse(),
    [transactions],
  );
  const cardTxs = useMemo(
    () => transactions.filter(t => t.type === 'CARD_SPEND').reverse(),
    [transactions],
  );

  const balanceByTx = useMemo(() => attachRunningBalance(transactions), [transactions]);

  // Lifetime + this-month stats. "Out" rolls together every cash outflow
  // (WITHDRAW + CARD_SPEND + MEMBERSHIP). BUYs are intentionally excluded —
  // those redirect cash into positions rather than leaving the wallet.
  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
    const monthLabel = new Date().toLocaleDateString([], { month: 'long', year: 'numeric' });

    let totalIn = 0;
    let totalOut = 0;
    let monthIn = 0;
    let monthOut = 0;
    let totalSpent = 0;
    for (const tx of transactions) {
      const inMonth = tx.t >= monthStartUnix;
      if (tx.type === 'DEPOSIT') {
        totalIn += tx.amount;
        if (inMonth) monthIn += tx.amount;
      } else if (tx.type === 'WITHDRAW' || tx.type === 'CARD_SPEND' || tx.type === 'MEMBERSHIP') {
        totalOut += tx.amount;
        if (inMonth) monthOut += tx.amount;
        if (tx.type === 'CARD_SPEND') totalSpent += tx.amount;
      }
    }
    return { totalIn, totalOut, monthIn, monthOut, totalSpent, monthLabel };
  }, [transactions]);

  // Today's CARD_SPEND used by the daily-limit progress UI.
  const spentTodayUSD = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartUnix = Math.floor(dayStart.getTime() / 1000);
    return transactions.reduce((acc, tx) => {
      return tx.type === 'CARD_SPEND' && tx.t >= dayStartUnix ? acc + tx.amount : acc;
    }, 0);
  }, [transactions]);

  const transferGroups = useMemo(() => {
    const map = new Map<string, typeof transfers>();
    for (const tx of transfers) {
      const key = formatDateGroup(tx.t);
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [transfers]);

  const cardTxGroups = useMemo(() => {
    const map = new Map<string, typeof cardTxs>();
    for (const tx of cardTxs) {
      const key = formatDateGroup(tx.t);
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [cardTxs]);

  const cardActive = card?.status === 'active';
  const cardFrozen = card?.status === 'frozen';
  const cashSubtext = cardFrozen
    ? "Available to invest or withdraw — card is frozen, virtual spending paused."
    : cardActive
      ? "Available to invest, withdraw, or spend with your card."
      : "Available to invest or withdraw.";

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SidebarTrigger className="hover:opacity-75 transition-opacity shrink-0" />
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <NotificationsBell className="ml-auto" />
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-8 space-y-10">
        <section>
          <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Cash Balance</p>
          {isReady ? (
            <h1 className="text-6xl md:text-7xl font-bold font-mono tracking-tight mt-2 leading-none tabular-nums">
              <AnimatedNumber value={cashBalance} formatter={formatCurrency()} duration={500} />
            </h1>
          ) : (
            <Skeleton className="h-16 md:h-20 w-72 mt-2" />
          )}
          <p className="text-sm text-muted-foreground font-medium mt-3">{cashSubtext}</p>
        </section>

        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Debit Card
          </h2>
          {!isReady ? (
            <Skeleton className="w-full max-w-sm aspect-[1.586/1] rounded-2xl" />
          ) : card ? (
            <div className="space-y-4">
              <DebitCard card={card} gold={isGoldActive} />

              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <StatusPill status={card.status} />
                  <span className="text-muted-foreground font-medium">
                    {cardFrozen
                      ? <>Spending paused</>
                      : <>Spending limit{" "}
                          <span className="font-mono font-bold text-foreground">
                            ${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="opacity-50 mx-2">·</span>
                          {card.dailyLimit !== null
                            ? <>Daily{" "}
                                <span className="font-mono font-bold text-foreground">
                                  ${spentTodayUSD.toFixed(2)} / ${card.dailyLimit.toFixed(2)}
                                </span>
                              </>
                            : <>No daily limit</>}
                        </>
                    }
                  </span>
                  {card.hasPin && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      PIN set
                    </span>
                  )}
                </div>
                {!cardFrozen && card.dailyLimit !== null && card.dailyLimit > 0 && (
                  <div className="h-1 w-full max-w-sm rounded-full bg-foreground/10 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${Math.min(100, (spentTodayUSD / card.dailyLimit) * 100)}%`,
                        backgroundColor: spentTodayUSD >= card.dailyLimit ? LOSS : PROFIT,
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={cardBusy || cardFrozen || cashBalance <= 0}
                  onClick={() => setSpendOpen(true)}
                  className="gap-2 font-bold uppercase tracking-widest"
                  style={!cardFrozen && cashBalance > 0 ? { backgroundColor: PROFIT, color: "#000" } : undefined}
                  title={
                    cardFrozen
                      ? 'Unfreeze the card to spend.'
                      : cashBalance <= 0
                        ? 'Add funds to your wallet to start spending.'
                        : undefined
                  }
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Spend
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cardBusy}
                  onClick={async () => {
                    if (cardBusy) return;
                    setCardBusy(true);
                    const next = card.status === 'frozen' ? 'active' : 'frozen';
                    try {
                      const res = await setCardStatus(next);
                      if (res.ok) {
                        await refresh();
                        toast.success(next === 'frozen' ? "Card frozen" : "Card unfrozen");
                      } else {
                        toast.error(res.error);
                      }
                    } finally {
                      setCardBusy(false);
                    }
                  }}
                  className="gap-2"
                >
                  <Snowflake className="h-3.5 w-3.5" />
                  {card.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cardBusy}
                  onClick={() => setLimitOpen(true)}
                  className="gap-2"
                >
                  <Gauge className="h-3.5 w-3.5" />
                  {card.dailyLimit !== null ? 'Limit' : 'Set limit'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cardBusy}
                  onClick={() => setPinOpen(true)}
                  className="gap-2"
                >
                  <Lock className="h-3.5 w-3.5" />
                  {card.hasPin ? 'Change PIN' : 'Set PIN'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cardBusy}
                  onClick={() => setReportOpen(true)}
                  className="gap-2 text-rose-500 hover:text-rose-500"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Report lost / stolen
                </Button>
              </div>

              {!cardFrozen && cashBalance <= 0 && (
                <p className="text-xs text-muted-foreground">
                  Add funds to your wallet to start spending with this card.
                </p>
              )}

              {/* Physical card status / upsell */}
              {card.cardType === 'virtual' ? (
                <button
                  type="button"
                  onClick={() => setPhysicalOpen(true)}
                  className="w-full text-left rounded-lg border border-border/50 hover:border-border bg-foreground/[0.02] hover:bg-foreground/[0.04] p-4 flex items-center gap-3 transition-colors"
                >
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `var(--brand-1a)`, color: PROFIT }}
                  >
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold tracking-tight">Order a physical card</p>
                      {isGoldActive ? (
                        <span
                          className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: '#E8B53020', color: '#E8B530' }}
                        >
                          <Crown className="h-2.5 w-2.5" />
                          Free with Gold
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">
                          Metal · $149
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isGoldActive
                        ? 'Free standard plastic card or upgrade to brushed metal.'
                        : 'Brushed stainless metal card · or join Gold for a free standard card.'}
                    </p>
                  </div>
                </button>
              ) : (
                <div
                  className="rounded-lg border p-4 flex items-center gap-3"
                  style={{
                    borderColor: card.cardType === 'metal' ? `${AMBER}40` : `var(--brand-40)`,
                    backgroundColor: card.cardType === 'metal' ? `${AMBER}08` : `var(--brand-08)`,
                  }}
                >
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: card.cardType === 'metal' ? `${AMBER}1a` : `var(--brand-1a)`,
                      color: card.cardType === 'metal' ? AMBER : PROFIT,
                    }}
                  >
                    <Package className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold tracking-tight">
                      {card.shippedAt
                        ? `Your ${card.cardType === 'metal' ? 'metal' : 'standard'} card has shipped`
                        : `${card.cardType === 'metal' ? 'Metal' : 'Standard'} card is on its way`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {card.shippedAt
                        ? `Shipped ${new Date(card.shippedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · arrives in 5–7 business days`
                        : card.orderedAt
                          ? `Ordered ${new Date(card.orderedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ships in 1–2 days`
                          : 'Tracking will appear here once it ships.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 p-8 flex flex-col items-center text-center gap-3">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-xs">
                You don&apos;t have a debit card yet. Issue one to spend your cash balance virtually.
              </p>
              <Button
                type="button"
                disabled={cardBusy}
                onClick={() => setIssueOpen(true)}
                className="font-bold uppercase tracking-widest"
                style={{ backgroundColor: PROFIT, color: "#000" }}
              >
                Issue debit card
              </Button>
            </div>
          )}
        </section>

        <section className="flex gap-3">
          <Button
            type="button"
            onClick={() => setTransferMode("deposit")}
            disabled={!isReady}
            className="flex-1 h-12 text-sm font-bold uppercase tracking-widest gap-2"
            style={{ backgroundColor: PROFIT, color: "#000" }}
          >
            <Plus className="h-4 w-4" />
            Deposit
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTransferMode("withdraw")}
            disabled={!isReady || cashBalance <= 0}
            className="flex-1 h-12 text-sm font-bold uppercase tracking-widest gap-2"
          >
            <Minus className="h-4 w-4" />
            Withdraw
          </Button>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-lg overflow-hidden border border-border/40">
          <Stat label={`${stats.monthLabel} In`}  value={isReady ? `+$${stats.monthIn.toFixed(2)}` : null} color={PROFIT} />
          <Stat label={`${stats.monthLabel} Out`} value={isReady ? `-$${stats.monthOut.toFixed(2)}` : null} color={stats.monthOut > 0 ? LOSS : undefined} />
          <Stat label="Lifetime In"  value={isReady ? `$${stats.totalIn.toFixed(2)}` : null} />
          <Stat label="Lifetime Out" value={isReady ? `$${stats.totalOut.toFixed(2)}` : null} />
        </section>

        {/* Transfers (deposit/withdraw) */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Transfers
          </h2>
          {!isReady ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          ) : transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deposits or withdrawals yet. Tap <span className="font-semibold text-foreground">Deposit</span> to fund your account.
            </p>
          ) : (
            <div className="space-y-6">
              {transferGroups.map(([day, txs]) => (
                <div key={day} className="space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{day}</h3>
                  <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
                    {txs.map(tx => {
                      const isDeposit = tx.type === 'DEPOSIT';
                      const color = isDeposit ? PROFIT : LOSS;
                      const balanceAfter = balanceByTx.get(tx) ?? 0;
                      return (
                        <button
                          key={tx.id ?? `${tx.t}-${tx.amount}-${tx.type}`}
                          type="button"
                          onClick={() => setDetailTx(tx)}
                          className="w-full flex items-center justify-between p-4 hover:bg-foreground/[0.02] transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                              style={{ color, backgroundColor: `${color}1a` }}
                            >
                              {isDeposit ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold tracking-tight">
                                {isDeposit ? "Deposit" : "Withdrawal"}
                              </p>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mt-0.5">
                                {new Date(tx.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0 ml-3">
                            <p className="font-mono font-bold text-sm" style={{ color }}>
                              {isDeposit ? '+' : '-'}${tx.amount.toFixed(2)}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              Bal ${balanceAfter.toFixed(2)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Card transactions (CARD_SPEND) */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Card Transactions
          </h2>
          {!isReady ? (
            <Skeleton className="h-16 w-full rounded-md" />
          ) : cardTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No card spending yet. Tap <span className="font-semibold text-foreground">Spend</span> on your card to make a virtual purchase.
            </p>
          ) : (
            <div className="space-y-6">
              {cardTxGroups.map(([day, txs]) => (
                <div key={day} className="space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{day}</h3>
                  <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
                    {txs.map(tx => {
                      const balanceAfter = balanceByTx.get(tx) ?? 0;
                      return (
                        <button
                          key={tx.id ?? `${tx.t}-${tx.amount}-${tx.symbol}`}
                          type="button"
                          onClick={() => setDetailTx(tx)}
                          className="w-full flex items-center justify-between p-4 hover:bg-foreground/[0.02] transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                              style={{ color: LOSS, backgroundColor: `${LOSS}1a` }}
                            >
                              <ShoppingBag className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold tracking-tight truncate">
                                {tx.symbol ?? "Card purchase"}
                              </p>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mt-0.5">
                                {new Date(tx.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0 ml-3">
                            <p className="font-mono font-bold text-sm" style={{ color: LOSS }}>
                              -${tx.amount.toFixed(2)}
                            </p>
                            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              Bal ${balanceAfter.toFixed(2)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <TransferModal
        open={transferMode !== null}
        onClose={() => setTransferMode(null)}
        mode={transferMode ?? "deposit"}
        cashBalance={cashBalance}
        refresh={refresh}
      />

      <IssueCardModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        firstName={firstName}
        lastName={lastName}
        hasActiveCard={!!card && card.status !== 'cancelled'}
        refresh={refresh}
      />

      <ReportCardModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        cardholderName={card?.cardholderName ?? null}
        refresh={refresh}
      />

      <OrderPhysicalCardModal
        open={physicalOpen}
        onClose={() => setPhysicalOpen(false)}
        isGoldActive={isGoldActive}
        cashBalance={cashBalance}
        refresh={refresh}
      />

      <CardLimitModal
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        currentLimit={card?.dailyLimit ?? null}
        spentToday={spentTodayUSD}
        refresh={refresh}
      />

      <PinModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        hasExistingPin={!!card?.hasPin}
        refresh={refresh}
      />

      <TransactionDetailModal
        open={detailTx !== null}
        onClose={() => setDetailTx(null)}
        tx={detailTx}
        balanceAfter={detailTx ? balanceByTx.get(detailTx) ?? null : null}
      />

      <SpendModal
        open={spendOpen}
        onClose={() => setSpendOpen(false)}
        cashBalance={cashBalance}
        cardFrozen={!!cardFrozen}
        cardHasPin={!!card?.hasPin}
        refresh={refresh}
      />

    </div>
  );
}

function StatusPill({ status }: { status: 'active' | 'frozen' | 'cancelled' }) {
  const config = {
    active:    { label: 'Active',    color: PROFIT },
    frozen:    { label: 'Frozen',    color: AMBER },
    cancelled: { label: 'Cancelled', color: 'var(--muted-foreground)' },
  }[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
      style={{ backgroundColor: `color-mix(in srgb, ${config.color} 12%, transparent)`, color: config.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string | null; color?: string }) {
  return (
    <div className="bg-background p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      {value ? (
        <p className="font-mono font-bold mt-2 text-base" style={color ? { color } : undefined}>
          {value}
        </p>
      ) : (
        <Skeleton className="h-5 w-24 mt-2" />
      )}
    </div>
  );
}
