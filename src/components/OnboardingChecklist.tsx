"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Building2, Check, ChevronDown, ChevronUp,
  CreditCard, Sparkles, TrendingUp, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGlobalStockData } from "@/components/StockDataProvider";

const PROFIT = "var(--brand)";
const STORAGE_KEY = "tradedash.onboarding.dismissed";

type Step = {
  key: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
  done: boolean;
  cta: { label: string; href?: string; onClick?: () => void };
};

type Props = {
  onAddSymbol: () => void;
  onDeposit: () => void;
  onIssueCard: () => void;
};

export function OnboardingChecklist({ onAddSymbol, onDeposit, onIssueCard }: Props) {
  const { transactions, externalAccounts, card, stocks, isReady } = useGlobalStockData();
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Read the dismissal flag from localStorage on mount. We never re-hydrate
  // from server, so a user who dismissed it on one device sees it again on
  // another — that's fine for a virtual product.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") setDismissed(true);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  };

  const steps: Step[] = useMemo(() => {
    const hasLinkedAccount = externalAccounts.length > 0;
    const hasDeposit = transactions.some(t => t.type === 'DEPOSIT');
    const hasCard = card !== null && card.status !== 'cancelled';
    const hasTrade = transactions.some(t => t.type === 'BUY');

    return [
      {
        key: 'link',
        title: 'Link an external account',
        detail: 'Connect a bank or savings account so you can move money in and out of TradeDash.',
        icon: <Building2 className="h-4 w-4" />,
        done: hasLinkedAccount,
        cta: { label: hasLinkedAccount ? 'Linked' : 'Link account', href: '/settings' },
      },
      {
        key: 'deposit',
        title: 'Make your first deposit',
        detail: 'Pull cash from a linked account into your wallet — no minimum.',
        icon: <Wallet className="h-4 w-4" />,
        done: hasDeposit,
        cta: { label: hasDeposit ? 'Done' : 'Deposit cash', onClick: onDeposit },
      },
      {
        key: 'card',
        title: 'Set up your debit card',
        detail: 'Issue a virtual debit card so you can spend your wallet balance.',
        icon: <CreditCard className="h-4 w-4" />,
        done: hasCard,
        cta: { label: hasCard ? 'Issued' : 'Issue card', onClick: onIssueCard },
      },
      {
        key: 'trade',
        title: 'Place your first trade',
        detail: stocks.length === 0
          ? 'Add a symbol to your watchlist, then buy your first share.'
          : 'Buy a share of any stock on your watchlist.',
        icon: <TrendingUp className="h-4 w-4" />,
        done: hasTrade,
        cta: stocks.length === 0
          ? { label: hasTrade ? 'Done' : 'Add a symbol', onClick: onAddSymbol }
          : { label: hasTrade ? 'Done' : 'Pick a stock', href: `/stock/${stocks[0]?.symbol ?? ''}?action=buy` },
      },
    ];
  }, [transactions, externalAccounts, card, stocks, onDeposit, onIssueCard, onAddSymbol]);

  const completed = steps.filter(s => s.done).length;
  const total = steps.length;
  const allDone = completed === total;

  if (!isReady) return null;
  if (dismissed) return null;
  // Auto-hide once everything's complete (no need to clutter the home page).
  if (allDone) return null;

  return (
    <section
      className="rounded-xl border p-5 space-y-4 relative overflow-hidden"
      style={{
        borderColor: `var(--brand-40)`,
        background: `linear-gradient(135deg, var(--brand-06) 0%, transparent 60%)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" style={{ color: PROFIT }} />
            Get started
          </p>
          <h2 className="text-lg font-bold tracking-tight mt-1">
            {completed === 0
              ? 'Welcome to TradeDash'
              : `${completed} of ${total} done — keep going`}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            A few quick steps and you&rsquo;ll be ready to invest, spend, and grow your wallet.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(completed / total) * 100}%`,
            backgroundColor: PROFIT,
          }}
        />
      </div>

      {!collapsed && (
        <ul className="space-y-2">
          {steps.map((step, i) => (
            <li
              key={step.key}
              className={`rounded-lg border p-3.5 flex items-center gap-3 transition-colors ${
                step.done
                  ? 'border-border/40 bg-foreground/[0.02]'
                  : 'border-border/50 hover:border-border'
              }`}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors"
                style={{
                  backgroundColor: step.done ? `var(--brand-1a)` : 'var(--muted)',
                  color: step.done ? PROFIT : 'var(--muted-foreground)',
                }}
              >
                {step.done ? <Check className="h-4 w-4" /> : step.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-bold tracking-tight ${
                    step.done ? 'text-muted-foreground line-through decoration-muted-foreground/50' : ''
                  }`}
                >
                  <span className="text-muted-foreground/60 mr-1.5 font-mono text-xs">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                )}
              </div>
              {!step.done && (
                step.cta.href ? (
                  <Button
                    render={<Link href={step.cta.href} />}
                    nativeButton={false}
                    size="sm"
                    className="font-bold gap-1 shrink-0"
                    style={{ backgroundColor: PROFIT, color: '#000' }}
                  >
                    {step.cta.label} <ArrowRight className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={step.cta.onClick}
                    className="font-bold gap-1 shrink-0"
                    style={{ backgroundColor: PROFIT, color: '#000' }}
                  >
                    {step.cta.label} <ArrowRight className="h-3 w-3" />
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
