"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { updateCardLimit } from "@/lib/actions";

const PROFIT = "var(--brand)";

type Props = {
  open: boolean;
  onClose: () => void;
  currentLimit: number | null;
  spentToday: number;
  refresh: () => Promise<void>;
};

export function CardLimitModal({ open, onClose, currentLimit, spentToday, refresh }: Props) {
  const [amountStr, setAmountStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setAmountStr(currentLimit !== null ? String(currentLimit) : "");
      setErr(null);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open, currentLimit]);

  const amount = Number(amountStr);
  const empty = amountStr.trim() === "";
  const validNew = !empty && Number.isFinite(amount) && amount >= 0;
  const belowSpent = validNew && amount < spentToday;
  const noChange =
    (empty && currentLimit === null) ||
    (!empty && validNew && currentLimit !== null && Math.abs(amount - currentLimit) < 0.005);
  const canSave = (empty || validNew) && !belowSpent && !noChange;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !canSave) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const newLimit = empty ? null : amount;
      const res = await updateCardLimit(newLimit);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success(
        newLimit === null
          ? "Daily card limit removed"
          : `Daily card limit set to $${newLimit.toFixed(2)}`,
      );
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
      eyebrow="Daily limit"
      title="Cap your card spending"
      subtitle="Sets a hard cap on card charges per calendar day. Leave blank for no limit."
      icon={<Gauge className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amountStr}
            onChange={e => setAmountStr(e.target.value)}
            placeholder="No limit"
            autoFocus
            className={belowSpent ? "border-rose-500" : undefined}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Already spent today:{" "}
              <span className="font-mono font-semibold text-foreground">
                ${spentToday.toFixed(2)}
              </span>
            </span>
            {currentLimit !== null && (
              <button
                type="button"
                onClick={() => setAmountStr("")}
                className="font-semibold hover:underline"
              >
                Clear limit
              </button>
            )}
          </div>
          {belowSpent && (
            <p className="text-xs font-medium text-rose-500">
              Limit must be at least ${spentToday.toFixed(2)} (today&rsquo;s spending so far).
            </p>
          )}
        </div>

        {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

        <ModalFooter align="stretch">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSave || submitting}
            className="font-bold"
            style={canSave ? {
              backgroundColor: empty ? '#FF5000' : PROFIT,
              color: empty ? '#fff' : "#000",
            } : undefined}
          >
            {submitting
              ? "Saving…"
              : empty
                ? (currentLimit !== null ? "Remove limit" : "Set limit")
                : "Save limit"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
