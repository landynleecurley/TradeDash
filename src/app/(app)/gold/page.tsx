"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PrioritySupportModal } from "@/components/PrioritySupportModal";
import { subscribeMembership } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import {
  Crown, CreditCard, Sparkles, ShieldCheck, TrendingUp, Bell,
  Headphones, Coins, ArrowRight,
} from "lucide-react";

const GOLD = "#E8B530";
const GOLD_DARK = "#B8861F";
const PROFIT = "var(--brand)";

const MONTHLY_PRICE = 5;
const ANNUAL_PRICE = 50;
const ANNUAL_SAVINGS_PCT = Math.round((1 - ANNUAL_PRICE / (MONTHLY_PRICE * 12)) * 100);

type Plan = 'monthly' | 'annual';

type ConfirmIntent = { kind: 'subscribe'; plan: Plan };

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function GoldPage() {
  const { membership, isGoldActive, cashBalance, transactions, stocks, priceAlerts, isReady, refresh } = useGlobalStockData();
  const [supportOpen, setSupportOpen] = useState(false);

  // Live tallies for the benefit tiles. Both come from rows the new
  // `deposit` / `accrue_gold_interest` RPCs insert into transactions, so
  // they keep ticking up automatically.
  const goldStats = useMemo(() => {
    let interest = 0;
    let match = 0;
    for (const tx of transactions) {
      if (tx.type !== 'DEPOSIT' || !tx.symbol) continue;
      if (tx.symbol === 'Gold interest · 5% APY') interest += tx.amount;
      else if (tx.symbol === 'Gold deposit match · 1%') match += tx.amount;
    }
    return { interest, match };
  }, [transactions]);

  // 5% APY projection on the user's current cash, expressed as a daily run-
  // rate so the number reads as something like "+$0.14/day at $1,000".
  const projectedDailyInterest = isGoldActive
    ? cashBalance * 0.05 / 365
    : 0;

  // One busy flag per side of the action. They don't gate each other so the
  // cancel buttons stay clickable while a subscribe spinner is up (the prior
  // shared-busy bug was hiding the cancel flow).
  const [subscribing, setSubscribing] = useState<Plan | null>(null);
  const [confirmingIntent, setConfirmingIntent] = useState<ConfirmIntent | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);
  const subscribingRef = useRef(false);
  const confirmBusyRef = useRef(false);

  const cancelled = !!membership?.cancelledAt;
  const currentPlan = membership?.plan ?? null;
  const expiresAt = membership?.expiresAt ?? null;

  const runSubscribe = async (plan: Plan) => {
    if (subscribingRef.current) return;
    const price = plan === 'monthly' ? MONTHLY_PRICE : ANNUAL_PRICE;
    if (cashBalance < price) {
      setTopErr(`Need $${price.toFixed(2)} in cash to subscribe. You have $${cashBalance.toFixed(2)}.`);
      return;
    }
    subscribingRef.current = true;
    setSubscribing(plan);
    setTopErr(null);
    try {
      const clientId = crypto.randomUUID();
      const res = await subscribeMembership({ plan, clientId });
      if (!res.ok) {
        setTopErr(res.error);
      } else {
        await refresh();
        toast.success(`TradeDash Gold ${plan} active`);
      }
    } finally {
      subscribingRef.current = false;
      setSubscribing(null);
    }
  };

  const runConfirm = async () => {
    if (!confirmingIntent || confirmBusyRef.current) return;
    confirmBusyRef.current = true;
    setConfirmBusy(true);
    setTopErr(null);
    try {
      await runSubscribe(confirmingIntent.plan);
    } finally {
      confirmBusyRef.current = false;
      setConfirmBusy(false);
      setConfirmingIntent(null);
    }
  };

  const confirmCopy = (() => {
    if (!confirmingIntent) return { title: '', message: '', label: 'Confirm', destructive: false };
    const plan = confirmingIntent.plan;
    const price = plan === 'monthly' ? MONTHLY_PRICE : ANNUAL_PRICE;
    const cadence = plan === 'monthly' ? 'month' : 'year';
    return {
      title: `Subscribe to TradeDash Gold ${plan}?`,
      message: `$${price.toFixed(2)} will be charged from your cash balance now. Renews automatically each ${cadence} until you cancel.`,
      label: `Charge $${price.toFixed(2)}`,
      destructive: false,
    };
  })();

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-[var(--demo-banner-h,0px)] z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <NotificationsBell className="ml-auto" />
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-2xl p-8 md:p-10"
          style={{
            background: `linear-gradient(135deg, #1a1208 0%, #2a1d0a 50%, ${GOLD_DARK}25 100%)`,
            border: `1px solid ${GOLD}30`,
          }}
        >
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full" style={{ backgroundColor: `${GOLD}15` }} />
          <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full" style={{ backgroundColor: `${GOLD}08` }} />

          <div className="relative">
            <div className="flex items-center gap-2">
              <Crown className="h-6 w-6" style={{ color: GOLD }} />
              <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
                TradeDash Gold
              </span>
            </div>
            {!isReady ? (
              <Skeleton className="h-12 w-72 mt-4" />
            ) : isGoldActive ? (
              <>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mt-4 leading-tight">
                  You&apos;re Gold.
                </h1>
                <p className="text-sm text-muted-foreground mt-3 max-w-md">
                  {cancelled
                    ? <>Auto-renew off. Benefits remain until <span className="text-foreground font-semibold">{formatDate(expiresAt)}</span>.</>
                    : <>Active <span className="font-semibold capitalize text-foreground">{currentPlan}</span> plan, renews on <span className="text-foreground font-semibold">{formatDate(expiresAt)}</span>.</>}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mt-4 leading-tight">
                  Trade like a pro.
                </h1>
                <p className="text-sm text-muted-foreground mt-3 max-w-md">
                  TradeDash Gold unlocks the gold card, a profile badge, and a queue of premium perks landing soon.
                </p>
              </>
            )}
          </div>
        </section>

        {topErr && (
          <p className="text-sm font-medium text-rose-500 -mt-6">{topErr}</p>
        )}

        {/* Subscribe / manage */}
        {!isReady ? (
          <Skeleton className="h-44 w-full rounded-lg" />
        ) : isGoldActive ? (
          <section className="rounded-lg border border-border/40 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight">Manage your subscription</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Change your plan, manage auto-renew, or view payment history on your billing page.
                Plan changes take effect on your next billing cycle.
              </p>
            </div>
            <Button
              render={<Link href="/billing" />}
              nativeButton={false}
              className="font-bold uppercase tracking-widest gap-1.5 shrink-0"
              style={{ backgroundColor: GOLD, color: "#000" }}
            >
              Manage billing <ArrowRight className="h-4 w-4" />
            </Button>
          </section>
        ) : (
          <section className="grid sm:grid-cols-2 gap-3">
            <PlanCard
              title="Monthly"
              price={MONTHLY_PRICE}
              cadence="per month"
              busy={subscribing === 'monthly'}
              onSubscribe={() => setConfirmingIntent({ kind: 'subscribe', plan: 'monthly' })}
              insufficient={cashBalance < MONTHLY_PRICE}
            />
            <PlanCard
              title="Annual"
              price={ANNUAL_PRICE}
              cadence="per year"
              tag={`Save ${ANNUAL_SAVINGS_PCT}%`}
              busy={subscribing === 'annual'}
              onSubscribe={() => setConfirmingIntent({ kind: 'subscribe', plan: 'annual' })}
              insufficient={cashBalance < ANNUAL_PRICE}
              highlight
            />
          </section>
        )}

        {/* Benefits */}
        <section className="space-y-4">
          <header>
            <h2 className="text-lg font-bold tracking-tight">Member benefits</h2>
            <p className="text-sm text-muted-foreground mt-1">Active perks today, plus what we&apos;re building next.</p>
          </header>

          <div className="grid sm:grid-cols-2 gap-3">
            <Benefit
              live
              icon={<CreditCard className="h-4 w-4" />}
              title="Gold debit card"
              description="Your virtual card flips to a polished gold finish for as long as your membership is active."
            />
            <Benefit
              live
              icon={<Crown className="h-4 w-4" />}
              title="Gold profile badge"
              description="A subtle crown on your account header lets everyone know you're Gold."
            />
            <Benefit
              live={isGoldActive}
              icon={<Headphones className="h-4 w-4" />}
              title="Priority support"
              description="Skip the queue — typical response under 2 hours."
              cta={isGoldActive ? { label: 'Contact support', onClick: () => setSupportOpen(true) } : undefined}
            />
            <Benefit
              live={isGoldActive}
              icon={<Coins className="h-4 w-4" />}
              title="5% APY on cash"
              description={isGoldActive
                ? `Earned ${formatMoney(goldStats.interest)} so far · accruing ~${formatMoney(projectedDailyInterest)}/day on your current balance.`
                : "Pro-rated daily interest paid into your wallet — only while Gold."}
              valueLabel={isGoldActive ? 'Earned' : undefined}
              valueText={isGoldActive ? formatMoney(goldStats.interest) : undefined}
            />
            <Benefit
              live={isGoldActive}
              icon={<TrendingUp className="h-4 w-4" />}
              title="1% deposit match"
              description={isGoldActive
                ? `We've matched ${formatMoney(goldStats.match)} on your deposits since you went Gold.`
                : "A 1% bonus on every deposit, paid as cash."}
              valueLabel={isGoldActive ? 'Matched' : undefined}
              valueText={isGoldActive ? formatMoney(goldStats.match) : undefined}
            />
            <Benefit
              live={isGoldActive}
              icon={<Sparkles className="h-4 w-4" />}
              title="Unlimited watchlist"
              description={isGoldActive
                ? `${stocks.length} symbol${stocks.length === 1 ? '' : 's'} on your watchlist · no cap while Gold.`
                : "Free accounts cap at 10 symbols. Gold lifts the cap entirely."}
              valueLabel={isGoldActive ? 'Symbols' : undefined}
              valueText={isGoldActive ? String(stocks.length) : undefined}
            />
            <Benefit
              live
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Advanced trade analytics"
              description="Realized vs unrealized P&L breakdown surfaced on your account page."
              cta={{ label: 'Open analytics', href: '/account' }}
            />
            <Benefit
              live={isGoldActive}
              icon={<Bell className="h-4 w-4" />}
              title="Smart price alerts"
              description={(() => {
                const active = priceAlerts.filter(a => !a.triggeredAt).length;
                const fired = priceAlerts.filter(a => a.triggeredAt).length;
                if (!isGoldActive) {
                  return "Set thresholds on any watchlist symbol; we'll ping you when it crosses.";
                }
                if (active === 0 && fired === 0) {
                  return "No alerts set yet — open any stock and tap Set alert to arm one.";
                }
                return `${active} armed${fired > 0 ? ` · ${fired} previously fired` : ''}.`;
              })()}
              valueLabel={isGoldActive ? 'Armed' : undefined}
              valueText={isGoldActive ? String(priceAlerts.filter(a => !a.triggeredAt).length) : undefined}
            />
          </div>
        </section>

        <p className="text-xs text-muted-foreground text-center">
          Membership fees are charged from your cash balance. Cancel any time. No real money moves anywhere — TradeDash is a virtual environment.
        </p>
      </main>

      <PrioritySupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />

      <ConfirmModal
        open={confirmingIntent !== null}
        onClose={() => { if (!confirmBusy) setConfirmingIntent(null); }}
        onConfirm={runConfirm}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.label}
        destructive={confirmCopy.destructive}
      />
    </div>
  );
}

function PlanCard({
  title, price, cadence, tag, busy, onSubscribe, insufficient, highlight,
}: {
  title: string;
  price: number;
  cadence: string;
  tag?: string;
  busy: boolean;
  onSubscribe: () => void;
  insufficient: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-5 space-y-4 relative"
      style={{
        border: `1px solid ${highlight ? `${GOLD}50` : 'var(--border)'}`,
        backgroundColor: highlight ? `${GOLD}08` : undefined,
      }}
    >
      {tag && (
        <span
          className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${GOLD}30`, color: GOLD }}
        >
          {tag}
        </span>
      )}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
        <p className="font-mono font-bold text-3xl mt-2">${price}</p>
        <p className="text-xs text-muted-foreground mt-1">{cadence}</p>
      </div>
      <Button
        type="button"
        onClick={onSubscribe}
        disabled={busy || insufficient}
        className="w-full font-bold uppercase tracking-widest gap-2"
        style={!insufficient ? { backgroundColor: GOLD, color: "#000" } : undefined}
      >
        {busy ? 'Subscribing…' : insufficient ? 'Insufficient cash' : 'Subscribe'}
      </Button>
    </div>
  );
}

type BenefitCta =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

function Benefit({
  icon, title, description, live, comingSoon, valueLabel, valueText, cta,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  live?: boolean;
  comingSoon?: boolean;
  valueLabel?: string;
  valueText?: string;
  cta?: BenefitCta;
}) {
  return (
    <div className="rounded-lg border border-border/40 p-4 flex items-start gap-3">
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
        style={{
          backgroundColor: live ? `${GOLD}1a` : 'var(--muted)',
          color: live ? GOLD : 'var(--muted-foreground)',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold tracking-tight">{title}</p>
          {live && (
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded" style={{ backgroundColor: `var(--brand-20)`, color: PROFIT }}>
              Live
            </span>
          )}
          {comingSoon && (
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">
              Coming soon
            </span>
          )}
        </div>
        {valueText && (
          <p className="mt-1 flex items-baseline gap-1.5 font-mono">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {valueLabel}
            </span>
            <span className="font-bold text-sm tabular-nums" style={{ color: GOLD }}>
              {valueText}
            </span>
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        {cta && (
          cta.href ? (
            <a
              href={cta.href}
              className="inline-block text-[11px] font-bold uppercase tracking-widest mt-2 hover:underline"
              style={{ color: GOLD }}
            >
              {cta.label} →
            </a>
          ) : (
            <button
              type="button"
              onClick={cta.onClick}
              className="inline-block text-[11px] font-bold uppercase tracking-widest mt-2 hover:underline"
              style={{ color: GOLD }}
            >
              {cta.label} →
            </button>
          )
        )}
      </div>
    </div>
  );
}

const formatMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
