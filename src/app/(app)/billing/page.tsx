"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  subscribeMembership,
  cancelMembership,
  terminateMembership,
  schedulePlanChange,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { Crown, Receipt, ArrowRight, CalendarClock } from "lucide-react";
import type { Tx } from "@/lib/portfolio-series";

const GOLD = "#E8B530";
const LOSS = "#FF5000";

const MONTHLY_PRICE = 5;
const ANNUAL_PRICE = 50;
const ANNUAL_SAVINGS_PCT = Math.round((1 - ANNUAL_PRICE / (MONTHLY_PRICE * 12)) * 100);

type Plan = "monthly" | "annual";
const priceOf = (p: Plan) => (p === "monthly" ? MONTHLY_PRICE : ANNUAL_PRICE);
const cadenceOf = (p: Plan) => (p === "monthly" ? "mo" : "yr");
const labelOf = (p: Plan) => (p === "monthly" ? "Monthly" : "Annual");

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

type ConfirmIntent = { kind: "renew" } | { kind: "cancel-renew" } | { kind: "terminate" };

export default function BillingPage() {
  const { membership, isGoldActive, cashBalance, transactions, isReady, refresh } = useGlobalStockData();

  const currentPlan = (membership?.plan ?? null) as Plan | null;
  const pendingPlan = (membership?.pendingPlan ?? null) as Plan | null;
  const expiresAt = membership?.expiresAt ?? null;
  const cancelled = !!membership?.cancelledAt;
  const otherPlan: Plan | null = currentPlan ? (currentPlan === "monthly" ? "annual" : "monthly") : null;
  const daysUntilExpiry = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
    : 0;
  const showRenew = currentPlan !== null && (cancelled || daysUntilExpiry <= 7);

  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [intent, setIntent] = useState<ConfirmIntent | null>(null);
  const busyRef = useRef(false);

  const paymentHistory = useMemo<Tx[]>(
    () => transactions.filter(t => t.type === "MEMBERSHIP").reverse(),
    [transactions],
  );

  const runSchedule = async (plan: Plan) => {
    if (scheduling) return;
    setScheduling(true);
    setTopErr(null);
    try {
      const res = await schedulePlanChange(plan);
      if (!res.ok) {
        setTopErr(res.error);
        return;
      }
      await refresh();
      toast.success(plan === currentPlan ? "Plan change cancelled" : `Switches to ${labelOf(plan)} next cycle`);
    } finally {
      setScheduling(false);
    }
  };

  const runConfirm = async () => {
    if (!intent || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setTopErr(null);
    try {
      if (intent.kind === "renew") {
        // A queued plan change is applied by the renewal, so charge its price.
        const plan = pendingPlan ?? currentPlan ?? "monthly";
        if (cashBalance < priceOf(plan)) {
          setTopErr(`Need $${priceOf(plan).toFixed(2)} in cash to renew. You have $${cashBalance.toFixed(2)}.`);
          return;
        }
        const res = await subscribeMembership({ plan, clientId: crypto.randomUUID() });
        if (!res.ok) setTopErr(res.error);
        else {
          await refresh();
          toast.success("Membership renewed");
        }
      } else if (intent.kind === "cancel-renew") {
        const res = await cancelMembership();
        if (!res.ok) setTopErr(res.error);
        else {
          await refresh();
          toast.success("Auto-renew cancelled");
        }
      } else {
        const res = await terminateMembership();
        if (!res.ok) setTopErr(res.error);
        else {
          await refresh();
          toast.success("Membership ended");
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setIntent(null);
    }
  };

  const confirmCopy = (() => {
    if (!intent) return { title: "", message: "", label: "Confirm", destructive: false };
    if (intent.kind === "renew") {
      const plan = currentPlan ?? "monthly";
      // A queued plan change is applied by the renewal; tell the user.
      const renewingTo = pendingPlan ?? plan;
      return {
        title: pendingPlan ? `Renew as ${labelOf(renewingTo)} now?` : `Renew ${labelOf(plan)} now?`,
        message: `$${priceOf(renewingTo).toFixed(2)} will be charged from your cash balance and your benefits extend by one ${renewingTo === "monthly" ? "month" : "year"}.`,
        label: `Charge $${priceOf(renewingTo).toFixed(2)}`,
        destructive: false,
      };
    }
    if (intent.kind === "cancel-renew") {
      return {
        title: "Cancel auto-renew?",
        message: `You'll keep Gold benefits until ${formatDate(expiresAt)}. After that, the card flips back to standard. You can resume any time before then.`,
        label: "Cancel renewal",
        destructive: true,
      };
    }
    return {
      title: "End membership now?",
      message: "This immediately ends your Gold benefits — no refund of remaining time. You can resubscribe any time from the Gold page.",
      label: "End now",
      destructive: true,
    };
  })();

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-[var(--demo-banner-h,0px)] z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <NotificationsBell className="ml-auto" />
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <section className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 mt-4 border-b border-border/40 pb-2">
            <NavTab href="/account">Investing</NavTab>
            <NavTab href="/analytics">Analytics</NavTab>
            <NavTab href="/billing" active>Billing</NavTab>
            <NavTab href="/settings">Settings</NavTab>
          </nav>
        </section>

        {topErr && <p className="text-sm font-medium text-rose-500">{topErr}</p>}

        {!isReady ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : !isGoldActive ? (
          <section className="rounded-lg border border-border/40 p-8 text-center space-y-3">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center mx-auto"
              style={{ backgroundColor: `${GOLD}1a`, color: GOLD }}
            >
              <Crown className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold tracking-tight">No active membership</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              You don&rsquo;t have a TradeDash Gold subscription. Pick a plan to unlock the gold card,
              5% APY, deposit matches, and more.
            </p>
            <Button
              render={<Link href="/gold" />}
              nativeButton={false}
              className="font-bold uppercase tracking-widest gap-1.5"
              style={{ backgroundColor: GOLD, color: "#000" }}
            >
              View Gold plans <ArrowRight className="h-4 w-4" />
            </Button>
          </section>
        ) : (
          <>
            {/* Current plan + status */}
            <section className="rounded-lg border border-border/40 p-6 space-y-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current plan</p>
                  <h2 className="text-2xl font-bold tracking-tight mt-1 inline-flex items-center gap-2">
                    <Crown className="h-5 w-5" style={{ color: GOLD }} />
                    TradeDash Gold {currentPlan && labelOf(currentPlan)}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentPlan && <>${priceOf(currentPlan)}/{cadenceOf(currentPlan)} · </>}
                    {cancelled ? (
                      <>ends <span className="text-foreground font-semibold">{formatDate(expiresAt)}</span></>
                    ) : (
                      <>renews <span className="text-foreground font-semibold">{formatDate(expiresAt)}</span></>
                    )}
                  </p>
                </div>
                {!cancelled ? (
                  <span
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shrink-0"
                    style={{ backgroundColor: `${GOLD}1a`, color: GOLD }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: GOLD }} />
                    Auto-renew on
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shrink-0"
                    style={{ backgroundColor: `${LOSS}1a`, color: LOSS }}
                  >
                    Auto-renew off
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-md overflow-hidden border border-border/40">
                <Stat label="Plan" value={(currentPlan ?? "").toUpperCase() || "—"} />
                <Stat label="Started" value={formatDate(membership?.startedAt ?? null)} />
                <Stat label={cancelled ? "Ends" : "Renews"} value={formatDate(expiresAt)} color={cancelled ? LOSS : undefined} />
                <Stat label="Total paid" value={`$${(membership?.totalPaid ?? 0).toFixed(2)}`} />
              </div>
            </section>

            {/* Change plan — scheduled for next cycle */}
            <section className="rounded-lg border border-border/40 p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Change plan</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Plan changes take effect at your next renewal — no charge today, and you keep your
                  current plan until then.
                </p>
              </div>

              {pendingPlan && otherPlan ? (
                <div
                  className="rounded-md p-4 flex flex-col gap-3 sm:flex-row sm:items-start"
                  style={{ backgroundColor: `${GOLD}12`, border: `1px solid ${GOLD}33` }}
                >
                  <div className="flex items-start gap-3 min-w-0 sm:flex-1">
                    <CalendarClock className="h-5 w-5 shrink-0 mt-0.5" style={{ color: GOLD }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold tracking-tight">
                        Switching to {labelOf(pendingPlan)} — ${priceOf(pendingPlan)}/{cadenceOf(pendingPlan)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Takes effect on <span className="text-foreground font-semibold">{formatDate(expiresAt)}</span>.
                        You&rsquo;ll be charged the new rate then; until then you stay on {labelOf(currentPlan!)}.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => currentPlan && runSchedule(currentPlan)}
                    disabled={scheduling}
                    className="w-full sm:w-auto sm:shrink-0"
                  >
                    {scheduling ? "…" : "Cancel change"}
                  </Button>
                </div>
              ) : cancelled ? (
                <p className="text-sm text-muted-foreground">
                  Auto-renew is off, so there&rsquo;s no upcoming cycle to change. Resume auto-renew
                  below to schedule a plan change.
                </p>
              ) : otherPlan ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => runSchedule(otherPlan)}
                    disabled={scheduling}
                    className="w-full sm:w-auto whitespace-normal text-center font-bold uppercase tracking-widest"
                    style={{ backgroundColor: GOLD, color: "#000" }}
                  >
                    {scheduling
                      ? "Scheduling…"
                      : `Switch to ${labelOf(otherPlan)} · $${priceOf(otherPlan)}/${cadenceOf(otherPlan)}${otherPlan === "annual" ? ` (save ${ANNUAL_SAVINGS_PCT}%)` : ""}`}
                  </Button>
                </div>
              ) : null}
            </section>

            {/* Manage subscription */}
            <section className="rounded-lg border border-border/40 p-6 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Manage subscription</p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                {showRenew && currentPlan && (
                  <Button
                    type="button"
                    onClick={() => setIntent({ kind: "renew" })}
                    disabled={busy}
                    className="w-full sm:w-auto whitespace-normal font-bold uppercase tracking-widest"
                    style={{ backgroundColor: GOLD, color: "#000" }}
                  >
                    {cancelled
                      ? `Resume · $${priceOf(pendingPlan ?? currentPlan)}/${cadenceOf(pendingPlan ?? currentPlan)}`
                      : daysUntilExpiry <= 0
                        ? `Renew now · $${priceOf(pendingPlan ?? currentPlan)}`
                        : `Renew now · ${daysUntilExpiry}d left`}
                  </Button>
                )}
                {!cancelled && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIntent({ kind: "cancel-renew" })}
                    className="w-full sm:w-auto text-rose-500 hover:text-rose-500"
                  >
                    Cancel auto-renew
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIntent({ kind: "terminate" })}
                  className="w-full sm:w-auto text-rose-500 hover:text-rose-500"
                >
                  End membership now
                </Button>
              </div>
            </section>
          </>
        )}

        {/* Payment history */}
        {paymentHistory.length > 0 && (
          <section className="space-y-3">
            <header className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold tracking-tight">Payment history</h2>
              <span className="text-xs text-muted-foreground">
                Total paid <span className="font-mono font-semibold text-foreground">${(membership?.totalPaid ?? 0).toFixed(2)}</span>
              </span>
            </header>
            <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
              {paymentHistory.map(tx => (
                <div key={tx.id ?? `${tx.t}-${tx.amount}`} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ color: GOLD, backgroundColor: `${GOLD}1a` }}
                    >
                      <Receipt className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tracking-tight truncate">{tx.symbol ?? "Membership"}</p>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mt-0.5">
                        {formatDateTime(new Date(tx.t * 1000).toISOString())}
                      </p>
                    </div>
                  </div>
                  <p className="font-mono font-bold text-sm" style={{ color: LOSS }}>
                    -${tx.amount.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Membership fees are charged from your cash balance. No real money moves anywhere — TradeDash
          is a virtual environment.
        </p>
      </main>

      <ConfirmModal
        open={intent !== null}
        onClose={() => { if (!busy) setIntent(null); }}
        onConfirm={runConfirm}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.label}
        destructive={confirmCopy.destructive}
      />
    </div>
  );
}

function NavTab({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`text-sm font-semibold tracking-tight pb-2 -mb-px border-b-2 transition-colors ${
        active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-bold mt-1.5 text-sm" style={color ? { color } : undefined}>{value}</p>
    </div>
  );
}
