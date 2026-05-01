"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Check, ChevronRight, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useGlobalStockData } from "@/components/StockDataProvider";
import type { ExternalAccount } from "@/lib/useStockData";
import { deposit, withdraw } from "@/lib/actions";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";

const DAILY_LIMIT = 1000;

const INTERNAL_ACCOUNT_NAME = "Individual";

type Mode = "deposit" | "withdraw";
type Step = "amount" | "review";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  cashBalance: number;
  refresh: () => Promise<void>;
};

function sumToday(
  transactions: Array<{ t: number; type: string; amount: number }>,
  type: "DEPOSIT" | "WITHDRAW",
): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startUnix = Math.floor(start.getTime() / 1000);
  return transactions.reduce(
    (acc, tx) => (tx.type === type && tx.t >= startUnix ? acc + tx.amount : acc),
    0,
  );
}

function describeExternal(acc: ExternalAccount): string {
  return `${acc.nickname} · ${acc.accountKind === "savings" ? "Savings" : "Checking"} ${acc.last4}`;
}

export function TransferModal({ open, onClose, mode, cashBalance, refresh }: Props) {
  const { transactions, externalAccounts } = useGlobalStockData();

  const [step, setStep] = useState<Step>("amount");
  const [amountStr, setAmountStr] = useState("");
  const [externalId, setExternalId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const clientIdRef = useRef<string | null>(null);

  // Whenever the modal opens, reset state and pre-select the user's default
  // external account (or the first one we have).
  useEffect(() => {
    if (open) {
      setStep("amount");
      setAmountStr("");
      setErr(null);
      setSubmitting(false);
      setPickerOpen(false);
      submittingRef.current = false;
      clientIdRef.current = crypto.randomUUID();
      const def = externalAccounts.find(a => a.isDefault) ?? externalAccounts[0] ?? null;
      setExternalId(def?.id ?? null);
    }
  }, [open, externalAccounts]);

  const usedToday = useMemo(
    () => sumToday(transactions, mode === "deposit" ? "DEPOSIT" : "WITHDRAW"),
    [transactions, mode],
  );

  const externalAcc = externalAccounts.find(a => a.id === externalId) ?? null;
  const hasNoAccounts = externalAccounts.length === 0;

  const amount = Number(amountStr);
  const validAmount = amountStr !== "" && Number.isFinite(amount) && amount > 0;
  const overdraft = mode === "withdraw" && validAmount && amount > cashBalance;
  const overLimit = validAmount && usedToday + amount > DAILY_LIMIT;
  const canProceed = validAmount && !overdraft && !overLimit && !!externalAcc;
  const remainingLimit = Math.max(0, DAILY_LIMIT - usedToday);

  // From → To rows flip depending on direction.
  const fromAccount = mode === "deposit"
    ? { kind: "external" as const, account: externalAcc }
    : { kind: "internal" as const, label: INTERNAL_ACCOUNT_NAME, detail: `$${cashBalance.toFixed(2)}` };
  const toAccount = mode === "deposit"
    ? { kind: "internal" as const, label: INTERNAL_ACCOUNT_NAME, detail: `$${cashBalance.toFixed(2)}` }
    : { kind: "external" as const, account: externalAcc };

  const submit = async () => {
    if (submittingRef.current || !canProceed || !externalAcc) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const clientId = clientIdRef.current ?? undefined;
      const res = mode === "deposit"
        ? await deposit({ amount, externalAccountId: externalAcc.id, clientId })
        : await withdraw({ amount, externalAccountId: externalAcc.id, clientId });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success(
        mode === "deposit"
          ? `Deposited $${amount.toFixed(2)} from ${externalAcc.nickname}`
          : `Withdrew $${amount.toFixed(2)} to ${externalAcc.nickname}`,
      );
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        busy={submitting}
        title="Transfer money"
        size="md"
      >
        {hasNoAccounts ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-dashed border-border/60 p-6 flex flex-col items-center text-center gap-3">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-sm">
                You haven&rsquo;t linked an external account yet. Add one in Settings to deposit cash into your wallet
                or withdraw it back to your bank.
              </p>
              <Button
                render={<Link href="/settings" onClick={onClose} />}
                nativeButton={false}
                className="font-bold gap-1.5"
                style={{ backgroundColor: PROFIT, color: "#000" }}
              >
                Go to Settings <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            </ModalFooter>
          </div>
        ) : step === "amount" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canProceed) setStep("review");
            }}
            className="space-y-5"
          >
            {/* Amount */}
            <Field label="Amount">
              <div className="relative">
                <span
                  aria-hidden
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-bold font-mono text-muted-foreground pointer-events-none"
                >
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  aria-label="Transfer amount"
                  className={`h-14 text-3xl font-bold font-mono pl-9 ${
                    overdraft || overLimit ? "border-rose-500" : ""
                  }`}
                />
              </div>
              {overdraft && (
                <p className="text-xs font-medium text-rose-500 mt-1">
                  Insufficient cash — you have ${cashBalance.toFixed(2)} available.
                </p>
              )}
              {overLimit && !overdraft && (
                <p className="text-xs font-medium text-rose-500 mt-1">
                  Over your remaining ${remainingLimit.toFixed(2)} daily limit.
                </p>
              )}
            </Field>

            {/* From */}
            <Field label="From">
              <AccountRow
                pickable={fromAccount.kind === "external"}
                onPick={() => setPickerOpen(true)}
                icon={fromAccount.kind === "external" ? <Building2 className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              >
                {fromAccount.kind === "external"
                  ? <ExternalLabel account={fromAccount.account} />
                  : <InternalLabel label={fromAccount.label} detail={fromAccount.detail} />}
              </AccountRow>
            </Field>

            {/* To */}
            <Field label="To">
              <AccountRow
                pickable={toAccount.kind === "external"}
                onPick={() => setPickerOpen(true)}
                icon={toAccount.kind === "external" ? <Building2 className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              >
                {toAccount.kind === "external"
                  ? <ExternalLabel account={toAccount.account} />
                  : <InternalLabel label={toAccount.label} detail={toAccount.detail} />}
              </AccountRow>
            </Field>

            {/* Frequency */}
            <Field label="Frequency">
              <AccountRow>
                <span className="text-sm font-semibold tracking-tight">Just once</span>
              </AccountRow>
            </Field>

            <p className="text-xs text-muted-foreground">
              Daily {mode === "deposit" ? "deposit" : "withdrawal"} limit:{" "}
              <span className="font-mono font-semibold text-foreground">
                ${usedToday.toFixed(2)} / ${DAILY_LIMIT.toLocaleString()}
              </span>
            </p>

            {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

            <ModalFooter align="stretch">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canProceed || submitting}
                className="font-bold gap-1.5"
                style={canProceed ? {
                  backgroundColor: mode === "deposit" ? PROFIT : LOSS,
                  color: mode === "deposit" ? "#000" : "#fff",
                } : undefined}
              >
                Review transfer <ArrowRight className="h-4 w-4" />
              </Button>
            </ModalFooter>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="text-center py-4 rounded-lg border border-border/50 bg-foreground/[0.02]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {mode === "deposit" ? "You're transferring in" : "You're transferring out"}
              </p>
              <p className="font-mono font-bold text-4xl tracking-tight mt-2" style={{ color: mode === "deposit" ? PROFIT : LOSS }}>
                ${amount.toFixed(2)}
              </p>
            </div>

            <dl className="rounded-lg border border-border/50 divide-y divide-border/40 overflow-hidden">
              <ReviewRow label="From">
                {fromAccount.kind === "external" && fromAccount.account ? (
                  <>
                    <p className="text-sm font-semibold tracking-tight">{fromAccount.account.nickname}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{fromAccount.account.accountKind}</span> ••{fromAccount.account.last4}
                      {fromAccount.account.institution ? ` · ${fromAccount.account.institution}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold tracking-tight">{INTERNAL_ACCOUNT_NAME}</p>
                    <p className="text-xs text-muted-foreground">${cashBalance.toFixed(2)}</p>
                  </>
                )}
              </ReviewRow>
              <ReviewRow label="To">
                {toAccount.kind === "external" && toAccount.account ? (
                  <>
                    <p className="text-sm font-semibold tracking-tight">{toAccount.account.nickname}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{toAccount.account.accountKind}</span> ••{toAccount.account.last4}
                      {toAccount.account.institution ? ` · ${toAccount.account.institution}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold tracking-tight">{INTERNAL_ACCOUNT_NAME}</p>
                    <p className="text-xs text-muted-foreground">${cashBalance.toFixed(2)}</p>
                  </>
                )}
              </ReviewRow>
              <ReviewRow label="Frequency">
                <p className="text-sm font-semibold tracking-tight">Just once</p>
              </ReviewRow>
              <ReviewRow label="Arrives">
                <p className="text-sm font-semibold tracking-tight">Instantly</p>
                <p className="text-xs text-muted-foreground">Virtual transfer · no settlement window</p>
              </ReviewRow>
            </dl>

            {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

            <ModalFooter align="between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("amount")}
                disabled={submitting}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" /> Edit
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="font-bold"
                  style={{
                    backgroundColor: mode === "deposit" ? PROFIT : LOSS,
                    color: mode === "deposit" ? "#000" : "#fff",
                  }}
                >
                  {submitting ? "Transferring…" : "Transfer money"}
                </Button>
              </div>
            </ModalFooter>
          </div>
        )}
      </Modal>

      <AccountPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={externalAccounts}
        selectedId={externalId}
        onPick={(id) => {
          setExternalId(id);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function AccountRow({
  icon,
  pickable = false,
  onPick,
  children,
}: {
  icon?: React.ReactNode;
  pickable?: boolean;
  onPick?: () => void;
  children: React.ReactNode;
}) {
  const className =
    "rounded-lg border border-border/50 bg-foreground/[0.02] px-3.5 h-12 flex items-center gap-3 text-foreground w-full text-left";

  const inner = (
    <>
      {icon && (
        <span className="h-7 w-7 rounded-full bg-foreground/5 flex items-center justify-center text-muted-foreground shrink-0">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight className={`h-4 w-4 shrink-0 ${pickable ? "text-muted-foreground" : "text-muted-foreground/30"}`} aria-hidden />
    </>
  );

  if (pickable && onPick) {
    return (
      <button type="button" onClick={onPick} className={`${className} hover:bg-foreground/[0.04] transition-colors`}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

function ExternalLabel({ account }: { account: ExternalAccount | null }) {
  if (!account) {
    return <span className="text-sm font-semibold text-muted-foreground">Pick an account</span>;
  }
  return (
    <span className="truncate">
      <span className="text-sm font-semibold tracking-tight">{account.nickname}</span>
      <span className="text-sm text-muted-foreground">
        {" · "}
        <span className="capitalize">{account.accountKind}</span> {account.last4}
      </span>
    </span>
  );
}

function InternalLabel({ label, detail }: { label: string; detail: string }) {
  return (
    <span className="truncate">
      <span className="text-sm font-semibold tracking-tight">{label}</span>
      <span className="text-sm text-muted-foreground"> · {detail}</span>
    </span>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-0.5">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function AccountPickerModal({
  open,
  onClose,
  accounts,
  selectedId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  accounts: ExternalAccount[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Choose account" size="sm">
      <div className="space-y-2">
        {accounts.map(acc => {
          const selected = acc.id === selectedId;
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onPick(acc.id)}
              className={`w-full text-left rounded-lg border p-3.5 transition-colors flex items-center gap-3 ${
                selected
                  ? "border-foreground/40 bg-foreground/5"
                  : "border-border/50 hover:bg-foreground/[0.02]"
              }`}
            >
              <span className="h-9 w-9 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-muted-foreground">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-tight truncate">{acc.nickname}</span>
                  {acc.isDefault && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: `var(--brand-20)`, color: PROFIT }}
                    >
                      Default
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground truncate mt-0.5">
                  <span className="capitalize">{acc.accountKind}</span>
                  {" · "}
                  <span className="font-mono">••{acc.last4}</span>
                  {acc.institution ? ` · ${acc.institution}` : null}
                </span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0" style={{ color: PROFIT }} />}
            </button>
          );
        })}
      </div>
      <ModalFooter>
        <Button
          render={<Link href="/settings" onClick={onClose} />}
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="gap-1.5"
        >
          Manage linked accounts
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </ModalFooter>
    </Modal>
  );
}
