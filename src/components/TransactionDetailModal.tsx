"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, Crown, ShoppingBag, TrendingDown, TrendingUp, Check, Copy,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { Tx } from "@/lib/portfolio-series";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";

type Props = {
  open: boolean;
  onClose: () => void;
  tx: (Tx & { id?: string }) | null;
  balanceAfter: number | null;
};

const TYPE_LABELS: Record<Tx['type'], string> = {
  DEPOSIT: 'Deposit',
  WITHDRAW: 'Withdrawal',
  BUY: 'Buy',
  SELL: 'Sell',
  CARD_SPEND: 'Card purchase',
  MEMBERSHIP: 'Membership',
};

function describe(tx: Tx) {
  switch (tx.type) {
    case 'BUY':
      return tx.shares != null && tx.symbol
        ? `Bought ${tx.shares} ${tx.symbol}`
        : 'Stock purchase';
    case 'SELL':
      return tx.shares != null && tx.symbol
        ? `Sold ${tx.shares} ${tx.symbol}`
        : 'Stock sale';
    case 'DEPOSIT': return 'Cash deposited';
    case 'WITHDRAW': return 'Cash withdrawn';
    case 'CARD_SPEND': return tx.symbol ?? 'Card purchase';
    case 'MEMBERSHIP': return tx.symbol ?? 'Membership fee';
  }
}

function iconFor(type: Tx['type']) {
  switch (type) {
    case 'DEPOSIT': return <ArrowDownToLine className="h-5 w-5" />;
    case 'WITHDRAW': return <ArrowUpFromLine className="h-5 w-5" />;
    case 'BUY': return <TrendingUp className="h-5 w-5" />;
    case 'SELL': return <TrendingDown className="h-5 w-5" />;
    case 'CARD_SPEND': return <ShoppingBag className="h-5 w-5" />;
    case 'MEMBERSHIP': return <Crown className="h-5 w-5" />;
  }
}

function isInflow(type: Tx['type']) {
  return type === 'DEPOSIT' || type === 'SELL';
}

export function TransactionDetailModal({ open, onClose, tx, balanceAfter }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  if (!tx) return null;

  const inflow = isInflow(tx.type);
  const color = inflow ? PROFIT : LOSS;
  const fullDate = new Date(tx.t * 1000).toLocaleString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={TYPE_LABELS[tx.type]}
      title={describe(tx)}
      icon={iconFor(tx.type)}
      iconColor={color}
      size="md"
    >
      <div className="text-center py-4 border-y border-border/40">
        <p className="font-mono font-bold text-4xl tracking-tight" style={{ color }}>
          {inflow ? '+' : '-'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <Row label="Date">{fullDate}</Row>
        {tx.symbol && (tx.type === 'BUY' || tx.type === 'SELL') && (
          <Row label="Symbol"><span className="font-mono font-bold">{tx.symbol}</span></Row>
        )}
        {tx.shares != null && (
          <Row label="Shares"><span className="font-mono">{tx.shares}</span></Row>
        )}
        {balanceAfter !== null && (
          <Row label="Balance after">
            <span className="font-mono font-semibold">
              ${balanceAfter.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </Row>
        )}
        {tx.id && (
          <Row label="Transaction ID">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(tx.id!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="font-mono text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            >
              {tx.id.slice(0, 8)}…{tx.id.slice(-4)}
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </Row>
        )}
      </dl>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
