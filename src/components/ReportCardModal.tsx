"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, MapPinOff, UserX, KeyRound, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { reportCardAndReplace, type CardReportReason } from "@/lib/actions";

const LOSS = "#FF5000";

const REASONS: Array<{
  value: CardReportReason;
  title: string;
  detail: string;
  icon: React.ReactNode;
}> = [
  {
    value: "lost",
    title: "Lost",
    detail: "I misplaced the card and can't find it. No reason to think anyone else has it.",
    icon: <MapPinOff className="h-4 w-4" />,
  },
  {
    value: "stolen",
    title: "Stolen",
    detail: "The card was taken from me. Someone else may try to use it.",
    icon: <UserX className="h-4 w-4" />,
  },
  {
    value: "compromised",
    title: "Compromised",
    detail: "I think the number, expiry, or CVV leaked. The card may be used online.",
    icon: <KeyRound className="h-4 w-4" />,
  },
];

type Step = "reason" | "confirm";

type Props = {
  open: boolean;
  onClose: () => void;
  cardholderName: string | null;
  refresh: () => Promise<void>;
};

export function ReportCardModal({ open, onClose, cardholderName, refresh }: Props) {
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<CardReportReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setStep("reason");
      setReason(null);
      setSubmitting(false);
      setErr(null);
      submittingRef.current = false;
    }
  }, [open]);

  const selected = REASONS.find(r => r.value === reason);

  const submit = async () => {
    if (submittingRef.current || !reason) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await reportCardAndReplace(reason);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success("New card issued. The old one is cancelled.");
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
      eyebrow={step === "reason" ? "Step 1 of 2 · Why are you reporting?" : "Step 2 of 2 · Confirm replacement"}
      title={step === "reason" ? "Report your debit card" : "Replace card now?"}
      icon={<ShieldAlert className="h-5 w-5" />}
      iconColor={LOSS}
      size="md"
    >
      {step === "reason" ? (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Reporting your card immediately cancels its number, expiry, and CVV, then issues a brand-new card under
            the same legal name. You can&rsquo;t undo this.
          </p>

          <div role="radiogroup" aria-label="Report reason" className="space-y-2">
            {REASONS.map(r => {
              const active = reason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left rounded-lg border p-4 transition-all flex items-start gap-3 ${
                    active
                      ? "border-rose-500/60 bg-rose-500/[0.04]"
                      : "border-border/50 hover:border-border hover:bg-foreground/[0.02]"
                  }`}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      backgroundColor: active ? `${LOSS}1a` : "var(--muted)",
                      color: active ? LOSS : "var(--muted-foreground)",
                    }}
                  >
                    {r.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold tracking-tight">{r.title}</p>
                      <span
                        aria-hidden
                        className="h-4 w-4 rounded-full border flex items-center justify-center shrink-0"
                        style={{
                          borderColor: active ? LOSS : "var(--border)",
                          backgroundColor: active ? LOSS : "transparent",
                        }}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.detail}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setStep("confirm")}
              disabled={!reason}
              className="gap-1.5 font-bold bg-rose-500 hover:bg-rose-600 text-white"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </ModalFooter>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-4 space-y-3">
            <div className="flex items-center gap-2">
              {selected?.icon}
              <p className="text-sm font-bold tracking-tight">Reported as {selected?.title.toLowerCase()}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {selected?.detail}
            </p>
          </div>

          <dl className="text-sm space-y-3 rounded-lg border border-border/50 p-4">
            <ConfirmRow label="Old card">
              <span className="font-mono text-muted-foreground">Cancelled immediately</span>
            </ConfirmRow>
            <ConfirmRow label="New card">
              <span className="font-mono">Issued under <span className="font-bold">{cardholderName ?? "your account name"}</span></span>
            </ConfirmRow>
            <ConfirmRow label="PIN, daily limit">
              <span className="text-muted-foreground">Reset to defaults</span>
            </ConfirmRow>
            <ConfirmRow label="Wallet balance">
              <span className="text-muted-foreground">Unchanged</span>
            </ConfirmRow>
          </dl>

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          <ModalFooter align="between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("reason")}
              disabled={submitting}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="font-bold bg-rose-500 hover:bg-rose-600 text-white"
              >
                {submitting ? "Replacing card…" : "Cancel & replace card"}
              </Button>
            </div>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

function ConfirmRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
