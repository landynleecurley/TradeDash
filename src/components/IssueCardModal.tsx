"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ArrowRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { issueCard } from "@/lib/actions";

const PROFIT = "var(--brand)";

type Props = {
  open: boolean;
  onClose: () => void;
  firstName: string | null;
  lastName: string | null;
  /**
   * True when the user already has a non-cancelled card. We render a
   * "you already have one" empty state instead of the issue form so we
   * don't fire create_card and trip its 'card already exists' guard.
   */
  hasActiveCard: boolean;
  refresh: () => Promise<void>;
};

export function IssueCardModal({ open, onClose, firstName, lastName, hasActiveCard, refresh }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Mirrors `hasActiveCard` but flips on its own when the RPC tells us a
  // card already exists — covers the race where the parent's state is stale
  // (e.g., a card was issued in another tab between render and click).
  const [alreadyHasCard, setAlreadyHasCard] = useState(hasActiveCard);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setErr(null);
      setSubmitting(false);
      setAlreadyHasCard(hasActiveCard);
      submittingRef.current = false;
    }
  }, [open, hasActiveCard]);

  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const nameComplete = first.length > 0 && last.length > 0;
  const derivedName = nameComplete ? `${first} ${last}`.toUpperCase() : null;

  const submit = async () => {
    if (submittingRef.current || !nameComplete || alreadyHasCard) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await issueCard();
      if (!res.ok) {
        // Recover gracefully when the server reports an existing card —
        // resync local state, surface a friendly message, and let the
        // user navigate to the wallet to manage it.
        if (/card already exists/i.test(res.error)) {
          await refresh();
          setAlreadyHasCard(true);
          return;
        }
        setErr(res.error);
        toast.error(`Couldn't issue card: ${res.error}`);
        return;
      }
      await refresh();
      toast.success("Debit card issued");
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Already-issued takes precedence over the "missing name" state — if the
  // user has a card, the name discussion is moot.
  if (alreadyHasCard) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        eyebrow="Debit card"
        title="You already have a debit card"
        subtitle="Manage your existing card from the wallet — set a PIN, change the daily limit, freeze it, or order a physical version."
        icon={<CreditCard className="h-5 w-5" />}
        iconColor={PROFIT}
        size="md"
      >
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            render={<Link href="/wallet" onClick={onClose} />}
            nativeButton={false}
            className="gap-1.5 font-bold"
            style={{ backgroundColor: PROFIT, color: "#000" }}
          >
            Manage card <ArrowRight className="h-4 w-4" />
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow="New debit card"
      title="Issue your debit card"
      icon={<Sparkles className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      {nameComplete ? (
        <>
          <div className="rounded-lg border border-border/50 bg-foreground/[0.02] p-4 space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Cardholder
            </p>
            <p className="font-mono font-bold text-lg tracking-wide">{derivedName}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Matches your account&rsquo;s legal name. To change it, update your profile in
              {" "}
              <Link
                href="/settings"
                className="font-semibold text-foreground hover:underline"
                onClick={onClose}
              >
                Settings
              </Link>
              .
            </p>
          </div>

          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside marker:text-muted-foreground/40">
            <li>Luhn-valid 16-digit number on the virtual <span className="font-mono">9999</span> BIN</li>
            <li>3-digit CVV and a 5-year expiry</li>
            <li>Tied to your wallet&rsquo;s cash balance — no credit, no overdraft</li>
          </ul>

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="font-bold"
              style={{ backgroundColor: PROFIT, color: "#000" }}
            >
              {submitting ? "Issuing…" : `Issue card`}
            </Button>
          </ModalFooter>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your debit card is printed with the legal name on your account. Add your first and last
            name in Settings, then come back to issue a card.
          </p>

          <div className="rounded-lg border border-dashed border-border/60 p-4 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Missing on your profile
            </p>
            <p className="text-sm">
              {first ? null : <span className="font-semibold">First name</span>}
              {!first && !last ? <span className="text-muted-foreground"> · </span> : null}
              {last ? null : <span className="font-semibold">Last name</span>}
            </p>
          </div>

          <ModalFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Not now
            </Button>
            <Button
              render={<Link href="/settings" onClick={onClose} />}
              nativeButton={false}
              className="gap-1.5 font-bold"
              style={{ backgroundColor: PROFIT, color: "#000" }}
            >
              Go to Settings <ArrowRight className="h-4 w-4" />
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
