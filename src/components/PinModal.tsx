"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { setCardPin, clearCardPin } from "@/lib/actions";

const PROFIT = "var(--brand)";

type Props = {
  open: boolean;
  onClose: () => void;
  hasExistingPin: boolean;
  refresh: () => Promise<void>;
};

export function PinModal({ open, onClose, hasExistingPin, refresh }: Props) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setPin("");
      setConfirm("");
      setErr(null);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open]);

  const valid = pin.length === 4 && pin === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !valid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await setCardPin(pin);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success(hasExistingPin ? "Card PIN updated" : "Card PIN set");
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await clearCardPin();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success("Card PIN removed");
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
      eyebrow={hasExistingPin ? "Change card PIN" : "Set card PIN"}
      title={hasExistingPin ? "New 4-digit PIN" : "Pick a 4-digit PIN"}
      subtitle="Required for every Spend transaction once set. Stored hashed — even support can't see it."
      icon={<Lock className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      {/* `autoComplete="off"` plus a non-credential form name helps stop browser
          credential autofill from intercepting these fields. The cell-style
          PinField below is the real defense — it's a `type="text"` input with
          a numeric inputMode, so password managers don't recognize it. */}
      <form
        onSubmit={submit}
        className="space-y-5"
        autoComplete="off"
        data-form-type="other"
      >
        <div className="space-y-4">
          <PinField
            label="New PIN"
            value={pin}
            onChange={setPin}
            autoFocus
            id="new-card-pin"
          />
          <PinField
            label="Confirm PIN"
            value={confirm}
            onChange={setConfirm}
            id="confirm-card-pin"
          />
          {pin.length > 0 && pin.length < 4 && (
            <p className="text-xs text-muted-foreground text-center">PINs are 4 digits.</p>
          )}
          {pin.length === 4 && confirm.length > 0 && pin !== confirm && (
            <p className="text-xs text-rose-500 text-center">PINs don&rsquo;t match.</p>
          )}
        </div>

        {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

        <ModalFooter align={hasExistingPin ? "between" : "end"}>
          {hasExistingPin && (
            <Button
              type="button"
              variant="ghost"
              onClick={remove}
              disabled={submitting}
              className="text-rose-500 hover:text-rose-500 hover:bg-rose-500/10"
            >
              Remove PIN
            </Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!valid || submitting}
              className="font-bold"
              style={valid ? { backgroundColor: PROFIT, color: "#000" } : undefined}
            >
              {submitting ? "Saving…" : hasExistingPin ? "Update PIN" : "Set PIN"}
            </Button>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/**
 * 4-cell PIN entry. Visually renders four boxes that fill with bullets as the
 * user types; a single transparent text input sits above the cells and
 * captures keystrokes. Because the input is `type="text"` with a numeric
 * inputMode and never carries a credential-shaped name/autocomplete, browser
 * password managers leave it alone.
 */
function PinField({
  label,
  value,
  onChange,
  autoFocus,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <label htmlFor={id} className="block space-y-2">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div
        className="relative h-14 w-full max-w-[16rem] mx-auto"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Visible cells. pointer-events-none so clicks land on the input. */}
        <div className="absolute inset-0 flex gap-2 justify-center pointer-events-none">
          {[0, 1, 2, 3].map(i => {
            const filled = !!value[i];
            return (
              <div
                key={i}
                className={`h-14 w-14 rounded-md border-2 flex items-center justify-center text-2xl font-bold transition-colors ${
                  filled
                    ? 'border-foreground/40 bg-foreground/5 text-foreground'
                    : 'border-border/60 text-muted-foreground'
                }`}
              >
                {filled ? '•' : ''}
              </div>
            );
          })}
        </div>
        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name={id ?? 'card-pin'}
          // Hints to common password managers to stay out of this field.
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          maxLength={4}
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          autoFocus={autoFocus}
          aria-label={label}
          // The input itself is invisible — text-transparent + caret-transparent
          // so only the cells underneath show through. Selection is also masked.
          className="absolute inset-0 w-full h-full bg-transparent border-0 outline-none text-transparent caret-transparent selection:bg-transparent cursor-pointer text-center font-mono tracking-[1.5rem] text-2xl"
        />
      </div>
    </label>
  );
}
