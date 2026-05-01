"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { buyStock, sellStock } from "@/lib/actions";
import type { StockInfo } from "@/lib/useStockData";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";

type InputMode = 'shares' | 'dollars';

type Props = {
  open: boolean;
  onClose: () => void;
  mode: "buy" | "sell";
  stock: StockInfo;
  cashBalance: number;
  refresh: () => Promise<void>;
};

export function TradeModal({ open, onClose, mode, stock, cashBalance, refresh }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('shares');
  const [valueStr, setValueStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const clientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setValueStr("");
      setInputMode('shares');
      setErr(null);
      setSubmitting(false);
      submittingRef.current = false;
      clientIdRef.current = crypto.randomUUID();
    }
  }, [open]);

  const numeric = Number(valueStr);
  const validInput = valueStr !== "" && Number.isFinite(numeric) && numeric > 0 && stock.price > 0;
  const shares = validInput
    ? (inputMode === 'shares' ? numeric : Math.floor((numeric / stock.price) * 1e6) / 1e6)
    : 0;
  const total = validInput ? shares * stock.price : 0;
  const insufficientCash = mode === "buy" && validInput && total > cashBalance;
  const insufficientShares = mode === "sell" && validInput && shares > stock.shares;
  const canSubmit = validInput && shares > 0 && !insufficientCash && !insufficientShares;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const clientId = clientIdRef.current ?? undefined;
      const res = mode === "buy"
        ? await buyStock({ symbol: stock.symbol, name: stock.name, shares, price: stock.price, clientId })
        : await sellStock({ symbol: stock.symbol, shares, price: stock.price, clientId });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success(
        mode === "buy"
          ? `Bought ${shares} ${stock.symbol} for $${total.toFixed(2)}`
          : `Sold ${shares} ${stock.symbol} for $${total.toFixed(2)}`,
      );
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const setMax = () => {
    if (mode === "buy" && stock.price > 0) {
      if (inputMode === 'dollars') {
        setValueStr(cashBalance.toFixed(2));
      } else {
        const maxShares = Math.floor((cashBalance / stock.price) * 1e6) / 1e6;
        setValueStr(String(maxShares));
      }
    } else if (mode === "sell") {
      if (inputMode === 'dollars') {
        setValueStr((stock.shares * stock.price).toFixed(2));
      } else {
        setValueStr(String(stock.shares));
      }
    }
  };

  const switchMode = (next: InputMode) => {
    if (next === inputMode) return;
    if (validInput && stock.price > 0) {
      if (next === 'dollars') {
        setValueStr((shares * stock.price).toFixed(2));
      } else {
        setValueStr(String(Math.floor((numeric / stock.price) * 1e6) / 1e6));
      }
    }
    setInputMode(next);
  };

  const accent = mode === 'buy' ? PROFIT : LOSS;
  const accentText = mode === 'buy' ? '#000' : '#fff';

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow={`${mode === "buy" ? "Buy" : "Sell"} ${stock.symbol}`}
      title={
        <span className="font-mono">${stock.price.toFixed(2)}</span>
      }
      subtitle={stock.name}
      icon={mode === "buy" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
      iconColor={accent}
      size="md"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-1 p-1 bg-foreground/5 rounded-md w-fit">
          {(['shares', 'dollars'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-widest rounded transition-colors ${
                inputMode === m ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'shares' ? 'Shares' : 'Dollars'}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {inputMode === 'shares' ? 'Shares' : 'Amount'}
            </label>
            <button
              type="button"
              onClick={setMax}
              className="text-xs font-bold uppercase tracking-widest hover:underline"
              style={{ color: accent }}
            >
              Max
            </button>
          </div>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={valueStr}
            onChange={e => setValueStr(e.target.value)}
            placeholder={inputMode === 'shares' ? '0' : '0.00'}
            autoFocus
          />
          {validInput && (
            <p className="text-xs text-muted-foreground font-mono">
              {inputMode === 'shares'
                ? <>≈ ${total.toFixed(2)}</>
                : <>≈ {shares} shares</>}
            </p>
          )}
        </div>

        <div className="space-y-2 pt-3 border-t border-border/40 text-sm font-mono">
          <Row label={mode === "buy" ? "Cost" : "Proceeds"} value={validInput ? `$${total.toFixed(2)}` : "—"} />
          {mode === "buy" ? (
            <Row label="Available cash" value={`$${cashBalance.toFixed(2)}`} warning={insufficientCash} />
          ) : (
            <Row label="Shares owned" value={`${stock.shares}`} warning={insufficientShares} />
          )}
        </div>

        {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

        <ModalFooter align="stretch">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || submitting}
            className="font-bold"
            style={canSubmit ? { backgroundColor: accent, color: accentText } : undefined}
          >
            {submitting ? "Working…" : mode === "buy" ? "Buy" : "Sell"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function Row({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={warning ? "text-rose-500 font-semibold" : "text-foreground"}>{value}</span>
    </div>
  );
}
