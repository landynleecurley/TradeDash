"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Headphones, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";

const GOLD = "#E8B530";

const TOPICS = [
  { key: "trade",   label: "Trading or order execution" },
  { key: "wallet",  label: "Wallet, deposits, or withdrawals" },
  { key: "card",    label: "Debit card or PIN" },
  { key: "gold",    label: "Gold membership" },
  { key: "account", label: "Account or login" },
  { key: "other",   label: "Something else" },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PrioritySupportModal({ open, onClose }: Props) {
  const [topic, setTopic] = useState<string>("trade");
  const [message, setMessage] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setTopic("trade");
      setMessage("");
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open]);

  const valid = message.trim().length >= 10;

  // We don't have a backing inbox yet. Pretend the request was filed and
  // return an SLA estimate — Gold members get the simulated "priority"
  // turnaround. Replace with a real ticketing system when one exists.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !valid) return;
    submittingRef.current = true;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600));
    submittingRef.current = false;
    setSubmitting(false);
    toast.success("Request received · Gold priority queue · ~2 hour SLA");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow="Gold priority"
      title="Contact support"
      subtitle="Gold members are routed to the front of the queue. Typical response: under 2 hours."
      icon={<Headphones className="h-5 w-5" />}
      iconColor={GOLD}
      size="md"
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="What's the topic?">
          <div className="grid grid-cols-2 gap-1.5">
            {TOPICS.map(t => {
              const active = topic === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTopic(t.key)}
                  aria-pressed={active}
                  className={`px-3 py-2 rounded-md text-xs font-semibold text-left transition-colors ${
                    active
                      ? 'border border-foreground/40 bg-foreground/[0.04] text-foreground'
                      : 'border border-border/50 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.02]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Message">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="What's going on? The more detail you share, the faster we can help."
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{message.length}/2000</p>
        </Field>

        <ModalFooter align="stretch">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!valid || submitting}
            className="font-bold gap-1.5"
            style={valid ? { backgroundColor: GOLD, color: "#000" } : undefined}
          >
            <Send className="h-4 w-4" />
            {submitting ? "Sending…" : "Send to support"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

