"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase-browser";

const PROFIT = "var(--brand)";
const AMBER = "#F59E0B";

type Props = {
  open: boolean;
  onClose: () => void;
  refresh: () => Promise<void>;
};

// Lightweight password strength heuristic — same shape we use during signup.
function scorePassword(p: string) {
  if (p.length === 0) return { score: 0, label: '', color: 'transparent' };
  let s = 0;
  if (p.length >= 8) s += 1;
  if (p.length >= 12) s += 1;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s += 1;
  if (/\d/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p)) s += 1;
  const score = Math.min(4, s);
  return [
    { score: 0, label: '', color: 'transparent' },
    { score: 1, label: 'Weak',   color: '#FF5000' },
    { score: 2, label: 'Fair',   color: AMBER },
    { score: 3, label: 'Good',   color: '#3B82F6' },
    { score: 4, label: 'Strong', color: PROFIT },
  ][score];
}

/**
 * Turns an anonymous Supabase session into a permanent one. All wallet,
 * watchlist, transaction, card, and gold state stays attached because
 * `auth.updateUser` only changes the identity — the user_id remains the
 * same row.
 */
export function SaveProgressModal({ open, onClose, refresh }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setErr(null);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open]);

  const strength = useMemo(() => scorePassword(password), [password]);
  const valid = email.includes('@') && password.length >= 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !valid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const supabase = createClient();
      // updateUser on an anonymous session attaches an email/password
      // identity to the existing user_id. Once it succeeds the same
      // session is no longer is_anonymous.
      const { error } = await supabase.auth.updateUser({ email, password });
      if (error) {
        setErr(error.message);
        toast.error(`Couldn't save progress: ${error.message}`);
        return;
      }
      await refresh();
      toast.success("Account saved · welcome to TradeDash");
      onClose();
      // Force a server round-trip so the proxy + RSC cache picks up the
      // new identity (no more is_anonymous flag).
      router.refresh();
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
      eyebrow="Demo mode"
      title="Save your progress"
      subtitle="Lock in your portfolio, alerts, gold benefits, and card under a real account. Everything you've built so far stays attached."
      icon={<Sparkles className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@example.com"
            autoComplete="email"
            autoFocus
            required
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(n => (
                  <div
                    key={n}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{ backgroundColor: n <= strength.score ? strength.color : 'var(--border)' }}
                  />
                ))}
              </div>
              {strength.label && (
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: strength.color }}>
                  {strength.label}
                </p>
              )}
            </div>
          )}
        </Field>

        <div className="rounded-lg border border-border/50 bg-foreground/[0.02] p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">What carries over</p>
          <ul className="space-y-0.5 list-disc list-inside marker:text-muted-foreground/40">
            <li>Cash balance, positions, and trade history</li>
            <li>Watchlist, price alerts, and notification preferences</li>
            <li>Debit card (number + PIN) and any gold benefits</li>
          </ul>
        </div>

        {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

        <ModalFooter align="stretch">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Keep playing
          </Button>
          <Button
            type="submit"
            disabled={!valid || submitting}
            className="font-bold gap-1.5"
            style={valid ? { backgroundColor: PROFIT, color: '#000' } : undefined}
          >
            {submitting ? 'Saving…' : 'Save my progress'} <ArrowRight className="h-4 w-4" />
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
