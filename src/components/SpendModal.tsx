"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { cardSpend } from "@/lib/actions";

const PROFIT = "var(--brand)";

const MERCHANT_PRESETS = [
  { label: 'Coffee', value: 'Coffee shop' },
  { label: 'Groceries', value: 'Grocery store' },
  { label: 'Gas', value: 'Gas station' },
  { label: 'Restaurant', value: 'Restaurant' },
  { label: 'Gym', value: 'Gym' },
  { label: 'Subscription', value: 'Subscription' },
] as const;

const onlyDigits = (s: string) => s.replace(/\D/g, '').slice(0, 4);

type Props = {
  open: boolean;
  onClose: () => void;
  cashBalance: number;
  cardFrozen: boolean;
  cardHasPin: boolean;
  refresh: () => Promise<void>;
};

export function SpendModal({ open, onClose, cashBalance, cardFrozen, cardHasPin, refresh }: Props) {
  const [amountStr, setAmountStr] = useState("");
  const [merchant, setMerchant] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const clientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmountStr("");
      setMerchant("");
      setPin("");
      setErr(null);
      setSubmitting(false);
      submittingRef.current = false;
      clientIdRef.current = crypto.randomUUID();
    }
  }, [open]);

  const amount = Number(amountStr);
  const validAmount = amountStr !== "" && Number.isFinite(amount) && amount > 0;
  const overdraft = validAmount && amount > cashBalance;
  const merchantOk = merchant.trim().length >= 2;
  const pinOk = !cardHasPin || pin.length === 4;
  const canSubmit = validAmount && !overdraft && merchantOk && pinOk && !cardFrozen;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await cardSpend({
        amount,
        merchant: merchant.trim(),
        pin: cardHasPin ? pin : undefined,
        clientId: clientIdRef.current ?? undefined,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success(`Charged $${amount.toFixed(2)} at ${merchant.trim()}`);
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow="Spend with card"
      title={
        <span className="font-mono">
          ${cashBalance.toFixed(2)}
        </span>
      }
      subtitle="Available to spend"
      icon={<ShoppingBag className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Merchant
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MERCHANT_PRESETS.map(p => {
                const active = merchant === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setMerchant(p.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-foreground/15 text-foreground'
                        : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <Input
              type="text"
              value={merchant}
              onChange={e => setMerchant(e.target.value)}
              placeholder="Custom merchant name"
              maxLength={40}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Amount
            </label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
              placeholder="0.00"
              className={overdraft ? "border-rose-500" : undefined}
            />
            {overdraft && (
              <p className="text-xs font-medium text-rose-500">Insufficient cash</p>
            )}
          </div>

          {cardHasPin && (
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Card PIN
              </label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={e => setPin(onlyDigits(e.target.value))}
                placeholder="••••"
                maxLength={4}
                className="font-mono text-lg tracking-[0.5em] text-center"
              />
            </div>
          )}
        </div>

        {cardFrozen && (
          <p className="text-sm font-medium text-rose-500">Card is frozen — unfreeze it before spending.</p>
        )}
        {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

        <ModalFooter align="stretch">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit || submitting}
            className="font-bold"
            style={canSubmit ? { backgroundColor: PROFIT, color: "#000" } : undefined}
          >
            {submitting ? "Charging…" : "Charge card"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
