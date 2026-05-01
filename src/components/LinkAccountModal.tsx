"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, Sparkles, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { linkExternalAccount } from "@/lib/actions";

const PROFIT = "var(--brand)";

type Props = {
  open: boolean;
  onClose: () => void;
  refresh: () => Promise<void>;
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

const DEMO_BANKS = [
  { nickname: '360 Performance Savings', institution: 'Capital One', accountKind: 'savings' as const, account: '4001294567829216', routing: '031176110' },
  { nickname: 'Everyday Checking', institution: 'Chase', accountKind: 'checking' as const, account: '0987654321', routing: '021000021' },
  { nickname: 'High-Yield Savings', institution: 'Ally Bank', accountKind: 'savings' as const, account: '7392041084', routing: '124003116' },
];

export function LinkAccountModal({ open, onClose, refresh }: Props) {
  const [nickname, setNickname] = useState("");
  const [institution, setInstitution] = useState("");
  const [accountKind, setAccountKind] = useState<"checking" | "savings">("savings");
  // The user enters full numbers; we extract last 4 on submit so we never
  // persist anything more than that.
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setNickname("");
      setInstitution("");
      setAccountKind("savings");
      setAccountNumber("");
      setRoutingNumber("");
      setErr(null);
      setAttempted(false);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open]);

  const nicknameOk = nickname.trim().length >= 2;
  // 4–17 digits covers most US/EU bank account number lengths.
  const accountOk = /^\d{4,17}$/.test(accountNumber);
  // 9 digits for ABA routing, or empty when omitted.
  const routingOk = routingNumber === "" || /^\d{9}$/.test(routingNumber);
  const canSubmit = nicknameOk && accountOk && routingOk;

  const accountLast4 = useMemo(
    () => (accountOk ? accountNumber.slice(-4) : ""),
    [accountNumber, accountOk],
  );
  const routingLast4 = useMemo(
    () => (routingNumber.length === 9 ? routingNumber.slice(-4) : ""),
    [routingNumber],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (submittingRef.current || !canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await linkExternalAccount({
        nickname: nickname.trim(),
        institution: institution.trim() || null,
        accountKind,
        last4: accountLast4,
        routingLast4: routingLast4 || null,
      });
      if (!res.ok) {
        setErr(res.error);
        toast.error(`Couldn't link account: ${res.error}`);
        return;
      }
      await refresh();
      toast.success(`${nickname.trim()} linked`);
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const fillDemo = (bank: (typeof DEMO_BANKS)[number]) => {
    setNickname(bank.nickname);
    setInstitution(bank.institution);
    setAccountKind(bank.accountKind);
    setAccountNumber(bank.account);
    setRoutingNumber(bank.routing);
    setAttempted(false);
    setErr(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow="Linked accounts"
      title="Link an external account"
      subtitle="Source for deposits, destination for withdrawals. We only store the last 4 digits."
      icon={<Building2 className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {/* Demo prefill — TradeDash is virtual, so a one-click sample is the
            fastest path to a usable wallet for first-time users. */}
        <div className="rounded-lg border border-dashed border-border/60 p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" style={{ color: PROFIT }} />
            Quick connect · demo banks
          </p>
          <div className="grid gap-1.5">
            {DEMO_BANKS.map(b => (
              <button
                key={b.nickname}
                type="button"
                onClick={() => fillDemo(b)}
                className="text-left rounded-md border border-border/40 hover:border-border bg-foreground/[0.02] hover:bg-foreground/[0.04] transition-colors px-3 py-2 flex items-center gap-2.5 text-sm"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold tracking-tight">{b.nickname}</span>
                  <span className="text-muted-foreground"> · {b.institution}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <Field label="Nickname">
          <Input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="What should we call this account?"
            maxLength={60}
            autoFocus
            aria-invalid={attempted && !nicknameOk}
            className={attempted && !nicknameOk ? "border-rose-500" : undefined}
          />
          {attempted && !nicknameOk && (
            <p className="text-xs font-medium text-rose-500 mt-1">Give your account a nickname (at least 2 characters).</p>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Institution (optional)">
            <Input
              type="text"
              value={institution}
              onChange={e => setInstitution(e.target.value)}
              placeholder="Bank name"
              maxLength={60}
            />
          </Field>

          <Field label="Account type">
            <div className="grid grid-cols-2 gap-1 p-1 bg-foreground/5 rounded-md">
              {(["savings", "checking"] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAccountKind(k)}
                  aria-pressed={accountKind === k}
                  className={`h-7 rounded-md text-xs font-semibold capitalize transition-all ${
                    accountKind === k
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Account number">
          <Input
            type="text"
            inputMode="numeric"
            value={accountNumber}
            onChange={e => setAccountNumber(onlyDigits(e.target.value).slice(0, 17))}
            placeholder="•••• •••• •••• 0000"
            maxLength={17}
            autoComplete="off"
            aria-invalid={attempted && !accountOk}
            className={`font-mono tracking-wider ${attempted && !accountOk ? "border-rose-500" : ""}`}
          />
          <div className="flex justify-between text-xs mt-1">
            <span className={attempted && !accountOk ? "text-rose-500 font-medium" : "text-muted-foreground"}>
              {attempted && !accountOk
                ? "Account number must be 4–17 digits."
                : "We only store the last 4 digits."}
            </span>
            {accountLast4 && (
              <span className="font-mono font-semibold text-foreground">
                ••{accountLast4}
              </span>
            )}
          </div>
        </Field>

        <Field label="Routing number (optional)">
          <Input
            type="text"
            inputMode="numeric"
            value={routingNumber}
            onChange={e => setRoutingNumber(onlyDigits(e.target.value).slice(0, 9))}
            placeholder="9-digit ABA routing number"
            maxLength={9}
            autoComplete="off"
            aria-invalid={attempted && !routingOk}
            className={`font-mono tracking-wider ${attempted && !routingOk ? "border-rose-500" : ""}`}
          />
          {attempted && !routingOk && (
            <p className="text-xs font-medium text-rose-500 mt-1">Routing number must be exactly 9 digits, or leave it blank.</p>
          )}
        </Field>

        {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

        <ModalFooter align="stretch">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="font-bold"
            style={canSubmit ? { backgroundColor: PROFIT, color: "#000" } : undefined}
          >
            {submitting ? "Linking…" : "Link account"}
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
