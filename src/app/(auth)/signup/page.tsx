"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, ArrowRight, Eye, EyeOff, Sparkles, GraduationCap, Briefcase,
  TrendingUp, Wallet, ShieldCheck, Scale, Rocket, Building2, CreditCard, Check,
} from "lucide-react";
import {
  completeOnboarding,
  linkExternalAccount,
  deposit,
  issueCard,
  type AnnualIncome,
  type ExperienceLevel,
  type RiskTolerance,
} from "@/lib/actions";
import { COUNTRIES } from "@/lib/countries";

const PROFIT = "var(--brand)";
const AMBER = "#F59E0B";

type Step = 'account' | 'personal' | 'investor' | 'bank' | 'deposit' | 'card';

const STEPS: { key: Step; label: string; required: boolean }[] = [
  { key: 'account', label: 'Account', required: true },
  { key: 'personal', label: 'Personal', required: true },
  { key: 'investor', label: 'Profile', required: true },
  { key: 'bank', label: 'Bank', required: false },
  { key: 'deposit', label: 'Deposit', required: false },
  { key: 'card', label: 'Card', required: false },
];

// Quick-connect demo banks for the optional bank step. Mirrors the list in
// LinkAccountModal so users get a consistent set across both flows.
const DEMO_BANKS = [
  { nickname: '360 Performance Savings', institution: 'Capital One', accountKind: 'savings' as const, last4: '9216', routingLast4: '6110' },
  { nickname: 'Everyday Checking',       institution: 'Chase',       accountKind: 'checking' as const, last4: '4321', routingLast4: '0021' },
  { nickname: 'High-Yield Savings',      institution: 'Ally Bank',   accountKind: 'savings' as const, last4: '1084', routingLast4: '3116' },
];

const DEPOSIT_PRESETS = [100, 500, 1000, 5000];

const INCOME_RANGES: { value: AnnualIncome; label: string }[] = [
  { value: '<50k', label: 'Under $50k' },
  { value: '50-100k', label: '$50k–$100k' },
  { value: '100-250k', label: '$100k–$250k' },
  { value: '250k-1m', label: '$250k–$1M' },
  { value: '1m+', label: '$1M+' },
];

const EXPERIENCE_OPTIONS: {
  value: ExperienceLevel;
  title: string;
  detail: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'beginner',
    title: 'Beginner',
    detail: 'New to investing or just learning the ropes.',
    icon: <GraduationCap className="h-5 w-5" />,
  },
  {
    value: 'intermediate',
    title: 'Intermediate',
    detail: 'Comfortable with stocks and ETFs; familiar with the basics.',
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    value: 'expert',
    title: 'Expert',
    detail: 'Experienced trader; understands options, margin, derivatives.',
    icon: <TrendingUp className="h-5 w-5" />,
  },
];

const RISK_OPTIONS: {
  value: RiskTolerance;
  title: string;
  detail: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    value: 'conservative',
    title: 'Conservative',
    detail: 'Prioritize stability; smaller swings, slower growth.',
    icon: <ShieldCheck className="h-5 w-5" />,
    color: '#3B82F6',
  },
  {
    value: 'balanced',
    title: 'Balanced',
    detail: 'Mix of stable and growth holdings; accept moderate volatility.',
    icon: <Scale className="h-5 w-5" />,
    color: PROFIT,
  },
  {
    value: 'aggressive',
    title: 'Aggressive',
    detail: 'Chase high growth; comfortable with sharp drawdowns.',
    icon: <Rocket className="h-5 w-5" />,
    color: '#FF5000',
  },
];

function scorePassword(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (p.length === 0) return { score: 0, label: '', color: 'transparent' };
  let s = 0;
  if (p.length >= 8) s += 1;
  if (p.length >= 12) s += 1;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s += 1;
  if (/\d/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p)) s += 1;
  const score = Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
  return [
    { score: 0, label: '', color: 'transparent' },
    { score: 1, label: 'Weak', color: '#FF5000' },
    { score: 2, label: 'Fair', color: AMBER },
    { score: 3, label: 'Good', color: '#3B82F6' },
    { score: 4, label: 'Strong', color: PROFIT },
  ][score] as { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };
}

// Maximum DOB that still puts the user at 18+ today.
function maxDobForAge18(): string {
  const now = new Date();
  const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
  const y = cutoff.getFullYear();
  const m = String(cutoff.getMonth() + 1).padStart(2, '0');
  const d = String(cutoff.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function SignupPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('account');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Step 1
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const strength = useMemo(() => scorePassword(password), [password]);

  // Step 2
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');

  // Step 3
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [income, setIncome] = useState<AnnualIncome | null>(null);
  const [risk, setRisk] = useState<RiskTolerance | null>(null);

  // Set when the user has been bounced back to step 2 from a downstream
  // validation failure. Drives the inline red error text under each field.
  const [personalAttempted, setPersonalAttempted] = useState(false);

  // Optional steps 4–6. Each holds the side effects that already ran so the
  // user sees a "✓ done" treatment if they navigate back, plus an inline
  // hint that the action persists into the dashboard.
  const [linkedBank, setLinkedBank] = useState<{ id: string; nickname: string } | null>(null);
  const [linkingBank, setLinkingBank] = useState<string | null>(null);
  const [depositAmountStr, setDepositAmountStr] = useState('');
  const [depositedCents, setDepositedCents] = useState<number | null>(null);
  const [cardIssuedFlag, setCardIssuedFlag] = useState(false);

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const isOptionalStep = step === 'bank' || step === 'deposit' || step === 'card';

  const accountValid = email.includes('@') && password.length >= 8;
  const firstNameValid = firstName.trim().length >= 2;
  const lastNameValid = lastName.trim().length >= 2;
  const dobValid = dob.length > 0 && new Date(dob) <= new Date(maxDobForAge18());
  const countryValid = country.length > 0;
  const personalValid = firstNameValid && lastNameValid && dobValid && countryValid;
  const investorValid = experience !== null && income !== null && risk !== null;

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !accountValid) return;
    setSubmitting(true);
    setErr(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setErr(error.message);
        return;
      }
      if (!data.session) {
        // Email confirmation required — we can't write to profiles without a
        // session. Stop here and tell the user to confirm; they'll finish
        // onboarding on their first sign-in.
        setInfo("Check your email to confirm your account, then sign in to finish setup.");
        return;
      }
      setStep('personal');
    } finally {
      setSubmitting(false);
    }
  };

  const submitFinal = async () => {
    if (submitting) return;
    // Defensive: if upstream data is missing, surface the problem instead of
    // silently no-op'ing. The button is also disabled in this state, but
    // keep the recovery path here in case it's clicked anyway.
    if (!personalValid) {
      setPersonalAttempted(true);
      setStep('personal');
      return;
    }
    if (!investorValid) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await completeOnboarding({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dob,
        country,
        experienceLevel: experience!,
        annualIncome: income!,
        riskTolerance: risk!,
      });
      if (!res.ok) {
        // Surface failure both inline and as a toast — the inline message is
        // easy to miss while the user is staring at the button.
        setErr(res.error);
        toast.error(`Couldn't finish setup: ${res.error}`);
        return;
      }
      // Investor profile saved — drop the user into the optional getting-
      // started flow. Each step is skippable; landing-on-dashboard happens
      // after the card step (or any skip from bank/deposit/card).
      setStep('bank');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.error(`Couldn't finish setup: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Skipping any optional step lands the user on the dashboard immediately.
  // The home-page checklist still tracks whatever they didn't do here.
  const goToDashboard = () => {
    toast.success('Welcome to TradeDash');
    router.replace('/');
    router.refresh();
  };

  const linkDemoBank = async (bank: (typeof DEMO_BANKS)[number]) => {
    if (linkingBank) return;
    setLinkingBank(bank.nickname);
    setErr(null);
    try {
      const res = await linkExternalAccount({
        nickname: bank.nickname,
        institution: bank.institution,
        accountKind: bank.accountKind,
        last4: bank.last4,
        routingLast4: bank.routingLast4,
      });
      if (!res.ok) {
        setErr(res.error);
        toast.error(`Couldn't link ${bank.nickname}: ${res.error}`);
        return;
      }
      setLinkedBank({ id: res.data.id, nickname: bank.nickname });
      toast.success(`${bank.nickname} linked`);
      setStep('deposit');
    } finally {
      setLinkingBank(null);
    }
  };

  const submitDeposit = async () => {
    if (submitting || !linkedBank) return;
    const amount = Number(depositAmountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr('Enter an amount greater than zero.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await deposit({
        amount,
        externalAccountId: linkedBank.id,
        clientId: crypto.randomUUID(),
      });
      if (!res.ok) {
        setErr(res.error);
        toast.error(`Couldn't deposit: ${res.error}`);
        return;
      }
      setDepositedCents(Math.round(amount * 100));
      toast.success(`Deposited $${amount.toFixed(2)}`);
      setStep('card');
    } finally {
      setSubmitting(false);
    }
  };

  const submitIssueCard = async () => {
    if (submitting || cardIssuedFlag) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await issueCard();
      if (!res.ok) {
        // Already-have-card means we're done here — drop the user into
        // the dashboard rather than blocking on a server-side guard.
        if (/card already exists/i.test(res.error)) {
          setCardIssuedFlag(true);
          goToDashboard();
          return;
        }
        setErr(res.error);
        toast.error(`Couldn't issue card: ${res.error}`);
        return;
      }
      setCardIssuedFlag(true);
      toast.success('Debit card issued');
      goToDashboard();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  i <= stepIndex ? '' : 'bg-foreground/10'
                }`}
                style={i <= stepIndex ? { backgroundColor: PROFIT } : undefined}
              />
            </div>
          ))}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex].label}
            {isOptionalStep && (
              <span
                className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold"
                style={{ backgroundColor: `${AMBER}1a`, color: AMBER }}
              >
                OPTIONAL
              </span>
            )}
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {step === 'account' && 'Create your account'}
            {step === 'personal' && 'A bit about you'}
            {step === 'investor' && 'Your investor profile'}
            {step === 'bank' && 'Link your first bank'}
            {step === 'deposit' && 'Make your first deposit'}
            {step === 'card' && 'Get your debit card'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {step === 'account' && 'Email + password. We send confirmations and login codes here.'}
            {step === 'personal' && 'Required for account verification. You must be 18 or older to use TradeDash.'}
            {step === 'investor' && 'Helps us tailor your dashboard. You can change these any time in Settings.'}
            {step === 'bank' && 'Connect a bank to fund your wallet. You can skip and link one later.'}
            {step === 'deposit' && 'Pull cash from your linked bank into your wallet — no minimum.'}
            {step === 'card' && 'Issue your virtual debit card. Spend your wallet anywhere cards are accepted.'}
          </p>
        </div>
      </header>

      {step === 'account' && (
        <form onSubmit={submitAccount} className="space-y-5">
          <Field label="Email">
            <Input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
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

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}
          {info && <p className="text-sm font-medium text-emerald-500">{info}</p>}

          <Button
            type="submit"
            disabled={!accountValid || submitting}
            className="w-full font-bold gap-1.5"
            style={accountValid ? { backgroundColor: PROFIT, color: '#000' } : undefined}
          >
            {submitting ? 'Creating account…' : 'Continue'} <ArrowRight className="h-4 w-4" />
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}

      {step === 'personal' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (personalValid) setStep('investor');
            else setPersonalAttempted(true);
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <Input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="First name"
                maxLength={40}
                autoComplete="given-name"
                autoFocus
                aria-invalid={personalAttempted && !firstNameValid}
                className={personalAttempted && !firstNameValid ? "border-rose-500" : undefined}
              />
              {personalAttempted && !firstNameValid && (
                <p className="text-xs font-medium text-rose-500 mt-1">First name is required.</p>
              )}
            </Field>
            <Field label="Last name">
              <Input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Last name"
                maxLength={40}
                autoComplete="family-name"
                aria-invalid={personalAttempted && !lastNameValid}
                className={personalAttempted && !lastNameValid ? "border-rose-500" : undefined}
              />
              {personalAttempted && !lastNameValid && (
                <p className="text-xs font-medium text-rose-500 mt-1">Last name is required.</p>
              )}
            </Field>
          </div>

          <Field label="Date of birth">
            <Input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              max={maxDobForAge18()}
              required
              aria-invalid={personalAttempted && !dobValid}
              className={personalAttempted && !dobValid ? "border-rose-500" : undefined}
            />
            {personalAttempted && !dobValid ? (
              <p className="text-xs font-medium text-rose-500 mt-1">
                {dob.length === 0 ? "Date of birth is required." : "You must be at least 18 years old."}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                You must be at least 18 years old.
              </p>
            )}
          </Field>

          <Field label="Country">
            <select
              value={country}
              onChange={e => setCountry(e.target.value)}
              className={`flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                personalAttempted && !countryValid ? "border-rose-500" : "border-input"
              }`}
              aria-invalid={personalAttempted && !countryValid}
              required
            >
              <option value="">Select your country…</option>
              {COUNTRIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {personalAttempted && !countryValid && (
              <p className="text-xs font-medium text-rose-500 mt-1">Country is required.</p>
            )}
          </Field>

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          <NavRow
            onBack={() => setStep('account')}
            disabledNext={!personalValid || submitting}
            nextLabel="Continue"
          />
        </form>
      )}

      {step === 'investor' && (
        <div className="space-y-7">
          {/* Experience */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Experience level
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              {EXPERIENCE_OPTIONS.map(opt => (
                <RadioCard
                  key={opt.value}
                  selected={experience === opt.value}
                  onClick={() => setExperience(opt.value)}
                  icon={opt.icon}
                  title={opt.title}
                  detail={opt.detail}
                />
              ))}
            </div>
          </div>

          {/* Income */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Annual income
            </p>
            <div className="flex flex-wrap gap-1 p-1 bg-foreground/5 rounded-lg">
              {INCOME_RANGES.map(r => {
                const active = income === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setIncome(r.value)}
                    aria-pressed={active}
                    className={`flex-1 min-w-[5rem] h-9 px-3 rounded-md text-xs font-semibold transition-all ${
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Wallet className="h-3 w-3" />
              We never share this. Used only to shape your default risk recommendations.
            </p>
          </div>

          {/* Risk */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Risk tolerance
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              {RISK_OPTIONS.map(opt => (
                <RadioCard
                  key={opt.value}
                  selected={risk === opt.value}
                  onClick={() => setRisk(opt.value)}
                  icon={opt.icon}
                  iconColor={opt.color}
                  title={opt.title}
                  detail={opt.detail}
                />
              ))}
            </div>
          </div>

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          {!personalValid && (
            <button
              type="button"
              onClick={() => {
                setPersonalAttempted(true);
                setStep('personal');
              }}
              className="w-full text-left rounded-md border border-rose-500/40 bg-rose-500/[0.06] p-3 text-xs text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                <span className="font-bold">Missing info from step 2.</span>{" "}
                Go back to add your name, date of birth, or country.
              </span>
            </button>
          )}

          <NavRow
            onBack={() => setStep('personal')}
            disabledNext={!personalValid || !investorValid || submitting}
            nextLabel={submitting ? 'Finishing up…' : 'Finish setup'}
            nextIcon={<Sparkles className="h-4 w-4" />}
            onNext={submitFinal}
          />
        </div>
      )}

      {step === 'bank' && (
        <div className="space-y-5">
          <div className="space-y-2">
            {DEMO_BANKS.map(bank => {
              const linking = linkingBank === bank.nickname;
              const linked = linkedBank?.nickname === bank.nickname;
              return (
                <button
                  key={bank.nickname}
                  type="button"
                  onClick={() => linkDemoBank(bank)}
                  disabled={linkingBank !== null || linked}
                  className={`w-full text-left rounded-lg border p-3.5 transition-colors flex items-center gap-3 ${
                    linked
                      ? 'border-foreground/30 bg-foreground/[0.04]'
                      : 'border-border/50 hover:border-border hover:bg-foreground/[0.02] disabled:opacity-50'
                  }`}
                >
                  <span className="h-9 w-9 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold tracking-tight">{bank.nickname}</span>
                    <span className="block text-xs text-muted-foreground">
                      {bank.institution} ·{' '}
                      <span className="capitalize">{bank.accountKind}</span>
                      {' '}<span className="font-mono">••{bank.last4}</span>
                    </span>
                  </span>
                  {linking ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
                      Linking…
                    </span>
                  ) : linked ? (
                    <Check className="h-4 w-4 shrink-0" style={{ color: PROFIT }} />
                  ) : (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Sandbox connections — no real money moves. You can manage and unlink accounts in Settings.
          </p>

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep('card')}
              className="gap-1.5"
              disabled={linkingBank !== null}
            >
              Skip for now
            </Button>
            {linkedBank && (
              <Button
                type="button"
                onClick={() => setStep('deposit')}
                className="font-bold gap-1.5"
                style={{ backgroundColor: PROFIT, color: '#000' }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 'deposit' && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border/50 bg-foreground/[0.02] p-3 flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-muted-foreground">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="text-muted-foreground">From </span>
              <span className="font-semibold tracking-tight">
                {linkedBank?.nickname ?? 'No bank linked'}
              </span>
            </span>
          </div>

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
                value={depositAmountStr}
                onChange={e => setDepositAmountStr(e.target.value)}
                placeholder="0.00"
                autoFocus
                aria-label="Deposit amount"
                className="h-14 text-3xl font-bold font-mono pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DEPOSIT_PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDepositAmountStr(String(p))}
                  className="px-3 py-1 rounded-full bg-foreground/5 hover:bg-foreground/10 text-xs font-semibold tracking-tight transition-colors"
                >
                  ${p.toLocaleString()}
                </button>
              ))}
            </div>
          </Field>

          {depositedCents !== null && (
            <p className="text-xs font-medium" style={{ color: PROFIT }}>
              Already deposited ${(depositedCents / 100).toFixed(2)} this session.
            </p>
          )}

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep('card')}
              className="gap-1.5"
              disabled={submitting}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              onClick={submitDeposit}
              disabled={submitting || !linkedBank || !(Number(depositAmountStr) > 0)}
              className="font-bold gap-1.5"
              style={Number(depositAmountStr) > 0 && linkedBank
                ? { backgroundColor: PROFIT, color: '#000' }
                : undefined}
            >
              {submitting
                ? 'Depositing…'
                : Number(depositAmountStr) > 0
                  ? `Deposit $${Number(depositAmountStr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'Enter amount'}
            </Button>
          </div>
        </div>
      )}

      {step === 'card' && (
        <div className="space-y-5">
          <div
            className="relative w-full aspect-[1.586/1] max-w-sm mx-auto rounded-2xl p-6 text-white shadow-2xl overflow-hidden"
            style={{
              background: `linear-gradient(135deg, #050505 0%, #1a1a1a 50%, var(--brand-30) 100%)`,
            }}
          >
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full" style={{ backgroundColor: `var(--brand-10)` }} />
            <div className="relative h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="font-black text-base tracking-tight italic" style={{ color: PROFIT }}>
                  TradeDash
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.25em] px-2 py-1 rounded border border-white/30 text-white/80">
                  Virtual
                </span>
              </div>
              <div>
                <p className="font-mono text-base md:text-lg tracking-[0.2em] opacity-80">
                  •••• •••• •••• ••••
                </p>
                <div className="flex items-end justify-between text-xs mt-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest opacity-60">Cardholder</p>
                    <p className="font-bold tracking-wide mt-0.5">
                      {[firstName.trim(), lastName.trim()].filter(Boolean).join(' ').toUpperCase() || 'YOUR NAME'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest opacity-60">Expires</p>
                    <p className="font-mono font-bold mt-0.5">
                      {String(new Date().getMonth() + 1).padStart(2, '0')}/
                      {String((new Date().getFullYear() + 5) % 100).padStart(2, '0')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside marker:text-muted-foreground/40">
            <li>Luhn-valid 16-digit number on the virtual <span className="font-mono">9999</span> BIN</li>
            <li>Tied to your wallet&rsquo;s cash balance — no credit, no overdraft</li>
            <li>Upgrade to a physical or metal card any time from your wallet</li>
          </ul>

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={goToDashboard}
              className="gap-1.5"
              disabled={submitting}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              onClick={submitIssueCard}
              disabled={submitting}
              className="font-bold gap-1.5"
              style={{ backgroundColor: PROFIT, color: '#000' }}
            >
              {submitting ? 'Issuing card…' : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Issue card
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function RadioCard({
  selected, onClick, icon, iconColor, title, detail,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-4 transition-all flex flex-col gap-2 ${
        selected
          ? 'border-foreground/40 bg-foreground/[0.04] shadow-sm'
          : 'border-border/50 hover:border-border hover:bg-foreground/[0.02]'
      }`}
    >
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: iconColor
            ? `color-mix(in srgb, ${iconColor} 12%, transparent)`
            : 'var(--muted)',
          color: iconColor ?? 'var(--foreground)',
        }}
      >
        {icon}
      </div>
      <p className="text-sm font-bold tracking-tight">{title}</p>
      <p className="text-xs text-muted-foreground leading-snug">{detail}</p>
    </button>
  );
}

function NavRow({
  onBack, onNext, disabledNext, nextLabel, nextIcon,
}: {
  onBack: () => void;
  onNext?: () => void;
  disabledNext: boolean;
  nextLabel: string;
  nextIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <Button type="button" variant="ghost" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <Button
        type={onNext ? 'button' : 'submit'}
        onClick={onNext}
        disabled={disabledNext}
        className="font-bold gap-1.5"
        style={!disabledNext ? { backgroundColor: PROFIT, color: '#000' } : undefined}
      >
        {nextLabel} {nextIcon ?? <ArrowRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}
