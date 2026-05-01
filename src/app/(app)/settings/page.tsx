"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LinkAccountModal } from "@/components/LinkAccountModal";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import {
  updateProfile,
  deleteAccount,
  unlinkExternalAccount,
  setDefaultExternalAccount,
  updateNotificationPrefs,
  updateTheme,
  updateThemeColor,
  updatePhone,
  verifyPhone,
  type Theme,
  type ThemeColor,
} from "@/lib/actions";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye, EyeOff, LogOut, Shield, Bell, Palette, Trash2, Copy, Check, Building2, Plus, Star,
  Sun, Moon, Monitor, Phone, ShieldCheck, Crown,
} from "lucide-react";
import type {
  ExternalAccount,
  NotificationCategory,
  NotificationChannel,
  NotificationPrefs,
} from "@/lib/useStockData";

const PROFIT = "var(--brand)";

// Crude but useful password strength heuristic.
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
    { score: 1, label: 'Weak',     color: '#FF5000' },
    { score: 2, label: 'Fair',     color: '#F59E0B' },
    { score: 3, label: 'Good',     color: '#3B82F6' },
    { score: 4, label: 'Strong',   color: PROFIT },
  ][score] as { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const {
    firstName: hookFirst,
    lastName: hookLast,
    email,
    accountCreatedAt,
    userId,
    isReady,
    externalAccounts,
    refresh,
  } = useGlobalStockData();
  const [linkAccountOpen, setLinkAccountOpen] = useState(false);
  const [pendingUnlink, setPendingUnlink] = useState<ExternalAccount | null>(null);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const profileBusyRef = useRef(false);

  useEffect(() => {
    setFirstName(hookFirst ?? "");
    setLastName(hookLast ?? "");
  }, [hookFirst, hookLast]);

  const profileDirty = (firstName.trim() !== (hookFirst ?? "")) || (lastName.trim() !== (hookLast ?? ""));
  const username = email?.split('@')[0] ?? '';

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileBusyRef.current || !profileDirty) return;
    profileBusyRef.current = true;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      });
      if (!res.ok) {
        setProfileMsg({ kind: 'err', text: res.error });
        return;
      }
      await refresh();
      setProfileMsg({ kind: 'ok', text: 'Saved.' });
    } finally {
      profileBusyRef.current = false;
      setSavingProfile(false);
    }
  };

  // Password form
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const pwdBusyRef = useRef(false);

  const strength = useMemo(() => scorePassword(newPwd), [newPwd]);
  const pwdValid =
    currentPwd.length > 0 &&
    newPwd.length >= 8 &&
    newPwd === confirmPwd &&
    newPwd !== currentPwd;

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdBusyRef.current || !pwdValid || !email) return;
    pwdBusyRef.current = true;
    setSavingPwd(true);
    setPwdMsg(null);
    try {
      const supabase = createClient();
      // Re-authenticate with current password before allowing the change.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPwd,
      });
      if (verifyErr) {
        setPwdMsg({ kind: 'err', text: 'Current password is incorrect.' });
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updateErr) {
        setPwdMsg({ kind: 'err', text: updateErr.message });
        return;
      }
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdMsg({ kind: 'ok', text: 'Password updated.' });
    } finally {
      pwdBusyRef.current = false;
      setSavingPwd(false);
    }
  };

  // Account info
  const [copied, setCopied] = useState(false);
  const memberSince = accountCreatedAt
    ? new Date(accountCreatedAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const accountIdShort = userId ? `${userId.slice(0, 8)}…${userId.slice(-4)}` : '—';

  // Danger zone
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SidebarTrigger className="hover:opacity-75 transition-opacity shrink-0" />
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <NotificationsBell className="ml-auto" />
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-8 space-y-12">
        {/* Profile */}
        <form onSubmit={saveProfile} className="space-y-6">
          <header>
            <h2 className="text-lg font-bold tracking-tight">Profile</h2>
            <p className="text-sm text-muted-foreground mt-1">How you appear in TradeDash and on your card.</p>
          </header>

          <div className="flex items-center gap-4">
            {isReady ? (
              <UserAvatar
                firstName={firstName || hookFirst}
                lastName={lastName || hookLast}
                fallback={username}
                size="lg"
              />
            ) : (
              <Skeleton className="h-20 w-20 rounded-full" />
            )}
            <div className="min-w-0">
              {isReady ? (
                <p className="text-lg font-bold tracking-tight truncate">
                  {[firstName, lastName].filter(Boolean).join(' ') || username || 'Your name'}
                </p>
              ) : <Skeleton className="h-6 w-32" />}
              <p className="text-xs text-muted-foreground mt-0.5">Avatar uses your initials.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name">
              {!isReady ? <Skeleton className="h-9 w-full" /> : (
                <Input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  maxLength={40}
                  autoComplete="given-name"
                />
              )}
            </Field>
            <Field label="Last name">
              {!isReady ? <Skeleton className="h-9 w-full" /> : (
                <Input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  maxLength={40}
                  autoComplete="family-name"
                />
              )}
            </Field>
          </div>

          <Field label="Username">
            {!isReady ? <Skeleton className="h-9 w-full" /> : (
              <Input value={username} disabled readOnly className="bg-muted/30 cursor-not-allowed font-mono" />
            )}
            <Hint>Derived from your sign-in email. Not editable.</Hint>
          </Field>

          <Field label="Email">
            {!isReady ? <Skeleton className="h-9 w-full" /> : (
              <Input value={email ?? ''} disabled readOnly className="bg-muted/30 cursor-not-allowed" />
            )}
            <Hint>Contact support to change your sign-in email.</Hint>
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!isReady || !profileDirty || savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </Button>
            {profileMsg && (
              <p className={`text-sm font-medium ${profileMsg.kind === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>
                {profileMsg.text}
              </p>
            )}
          </div>
        </form>

        {/* Security */}
        <form onSubmit={savePassword} className="space-y-6 border-t border-border/40 pt-12">
          <header>
            <h2 className="text-lg font-bold tracking-tight">Security</h2>
            <p className="text-sm text-muted-foreground mt-1">Verify your current password to set a new one.</p>
          </header>

          <Field label="Current password">
            <PasswordInput
              value={currentPwd}
              onChange={setCurrentPwd}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>

          <Field label="New password">
            <PasswordInput
              value={newPwd}
              onChange={setNewPwd}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            {newPwd.length > 0 && (
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

          <Field label="Confirm new password">
            <PasswordInput
              value={confirmPwd}
              onChange={setConfirmPwd}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {newPwd.length > 0 && confirmPwd.length > 0 && newPwd !== confirmPwd && (
              <Hint className="text-rose-500">Passwords don&apos;t match.</Hint>
            )}
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!pwdValid || savingPwd}>
              {savingPwd ? "Saving…" : "Update password"}
            </Button>
            {pwdMsg && (
              <p className={`text-sm font-medium ${pwdMsg.kind === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>
                {pwdMsg.text}
              </p>
            )}
          </div>

          <ComingSoon
            icon={<Shield className="h-4 w-4" />}
            title="Two-factor authentication"
            description="Authenticator app (TOTP) and backup codes. Coming soon."
          />
        </form>

        {/* Linked accounts */}
        <section className="space-y-4 border-t border-border/40 pt-12">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Linked accounts</h2>
              <p className="text-sm text-muted-foreground mt-1">
                External bank accounts available as transfer sources and destinations in the wallet.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinkAccountOpen(true)}
              disabled={!isReady || externalAccounts.length >= 5}
              className="gap-1.5 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Link account
            </Button>
          </header>

          {!isReady ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          ) : externalAccounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-6 flex flex-col items-center text-center gap-3">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-xs">
                No accounts linked yet. Link an external account to deposit cash into your wallet or
                withdraw to your bank.
              </p>
              <Button
                type="button"
                onClick={() => setLinkAccountOpen(true)}
                className="font-bold gap-1.5"
                style={{ backgroundColor: PROFIT, color: "#000" }}
              >
                <Plus className="h-4 w-4" />
                Link your first account
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
              {externalAccounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between p-4 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold tracking-tight truncate">{acc.nickname}</p>
                        {acc.isDefault && (
                          <span
                            className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `var(--brand-20)`, color: PROFIT }}
                          >
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="capitalize">{acc.accountKind}</span>
                        {" · "}
                        <span className="font-mono">••{acc.last4}</span>
                        {acc.institution ? ` · ${acc.institution}` : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!acc.isDefault && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={accountBusy === acc.id}
                        onClick={async () => {
                          setAccountBusy(acc.id);
                          try {
                            const res = await setDefaultExternalAccount(acc.id);
                            if (res.ok) {
                              await refresh();
                              toast.success(`${acc.nickname} is now your default`);
                            } else {
                              toast.error(res.error);
                            }
                          } finally {
                            setAccountBusy(null);
                          }
                        }}
                        className="gap-1.5"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Make default
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={accountBusy === acc.id}
                      onClick={() => setPendingUnlink(acc)}
                      className="text-rose-500 hover:text-rose-500 hover:bg-rose-500/10"
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              ))}
              {externalAccounts.length >= 5 && (
                <div className="p-3 text-xs text-muted-foreground bg-foreground/[0.02]">
                  Maximum of 5 linked accounts reached. Unlink one to add another.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notifications */}
        <NotificationPrefsSection />


        <ThemePreferenceSection />
        <ThemeColorSection />
        <PhoneSection />


        {/* Account info */}
        <section className="space-y-4 border-t border-border/40 pt-12">
          <header>
            <h2 className="text-lg font-bold tracking-tight">Account info</h2>
            <p className="text-sm text-muted-foreground mt-1">Reference details for support.</p>
          </header>
          <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
            <InfoRow label="Member since" value={memberSince} />
            <InfoRow
              label="Account ID"
              value={
                <button
                  type="button"
                  onClick={async () => {
                    if (!userId) return;
                    await navigator.clipboard.writeText(userId);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="font-mono text-xs hover:text-foreground text-muted-foreground inline-flex items-center gap-1.5"
                >
                  {accountIdShort}
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              }
            />
          </div>
        </section>

        {/* Sign out */}
        <section className="space-y-4 border-t border-border/40 pt-12">
          <header>
            <h2 className="text-lg font-bold tracking-tight">Account</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign out of this device.</p>
          </header>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </section>

        {/* Danger zone */}
        <section className="space-y-4 border-t border-rose-500/30 pt-12">
          <header>
            <h2 className="text-lg font-bold tracking-tight text-rose-500">Danger zone</h2>
            <p className="text-sm text-muted-foreground mt-1">Permanent actions that can&apos;t be undone.</p>
          </header>
          <div className="rounded-lg border border-rose-500/30 p-4 flex items-start justify-between gap-4 bg-rose-500/[0.03]">
            <div>
              <p className="text-sm font-bold tracking-tight">Delete account</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Permanently removes your profile, positions, watchlist, transactions, card, and login. There&apos;s no recovery.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="bg-rose-500 hover:bg-rose-600 text-white gap-2 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </Button>
          </div>
        </section>
      </main>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const res = await deleteAccount();
          if (res.ok) {
            router.replace('/login');
            router.refresh();
          }
        }}
        title="Delete your account?"
        message="This wipes everything: profile, positions, watchlist, transactions, debit card, sign-in. There's no recovery."
        confirmLabel="Delete forever"
        destructive
      />

      <LinkAccountModal
        open={linkAccountOpen}
        onClose={() => setLinkAccountOpen(false)}
        refresh={refresh}
      />

      <ConfirmModal
        open={pendingUnlink !== null}
        onClose={() => setPendingUnlink(null)}
        onConfirm={async () => {
          if (!pendingUnlink) return;
          setAccountBusy(pendingUnlink.id);
          try {
            const res = await unlinkExternalAccount(pendingUnlink.id);
            if (res.ok) {
              await refresh();
              toast.success(`${pendingUnlink.nickname} unlinked`);
            } else {
              toast.error(res.error);
            }
          } finally {
            setAccountBusy(null);
          }
        }}
        title={`Unlink ${pendingUnlink?.nickname ?? "this account"}?`}
        message={
          pendingUnlink
            ? `Past deposits and withdrawals from ${pendingUnlink.nickname} stay in your activity log, but you won't be able to transfer money through this account anymore. You can re-link it later.`
            : ""
        }
        confirmLabel="Unlink account"
        destructive
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs text-muted-foreground ${className ?? ''}`}>{children}</p>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

type CategoryDef = {
  key: NotificationCategory;
  label: string;
  description: string;
};

const CATEGORIES: CategoryDef[] = [
  { key: 'trade',    label: 'Trades',           description: 'Buy and sell order fills.' },
  { key: 'transfer', label: 'Transfers',        description: 'Deposits and withdrawals between your wallet and linked accounts.' },
  { key: 'card',     label: 'Card activity',    description: 'Card purchases, freezes, and report-card events.' },
  { key: 'gold',     label: 'Gold membership',  description: 'Renewals, deposit matches, and APY interest credits.' },
  { key: 'security', label: 'Security',         description: 'Password changes, sign-ins from new devices, PIN updates.' },
  { key: 'alert',    label: 'Price alerts',     description: 'Watchlist threshold crossings (Gold, coming soon).' },
  { key: 'product',  label: 'Product updates',  description: 'New features, scheduled maintenance, occasional announcements.' },
];

function NotificationPrefsSection() {
  const { notificationPrefs, isReady, refresh, email, phone, phoneVerifiedAt } = useGlobalStockData();
  // Email is verified implicitly at signup, so the channel is always
  // unlocked. SMS only unlocks once the user has a verified phone — until
  // then the toggle is disabled with a hint.
  const channels: { key: NotificationChannel; label: string; supported: boolean; tooltip?: string }[] = [
    { key: 'inApp', label: 'In-app', supported: true },
    { key: 'email', label: 'Email', supported: !!email, tooltip: email ? undefined : 'Verify your email to enable.' },
    { key: 'sms',   label: 'SMS',   supported: !!phone && !!phoneVerifiedAt, tooltip: phone && phoneVerifiedAt ? undefined : 'Add and verify a phone number below.' },
  ];
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  // Snapshot the server prefs into local draft when they load (or change
  // upstream from realtime) so the form is editable without committing.
  useEffect(() => {
    if (notificationPrefs && draft === null) {
      setDraft(notificationPrefs);
    }
  }, [notificationPrefs, draft]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(notificationPrefs);
  }, [draft, notificationPrefs]);

  const toggle = (cat: NotificationCategory, ch: NotificationChannel) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [cat]: { ...draft[cat], [ch]: !draft[cat][ch] },
    });
  };

  const save = async () => {
    if (!draft || !dirty || saving) return;
    setSaving(true);
    try {
      const res = await updateNotificationPrefs(draft);
      if (!res.ok) {
        toast.error(`Couldn't save preferences: ${res.error}`);
        return;
      }
      await refresh();
      toast.success('Notification preferences saved');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!notificationPrefs) return;
    setDraft(notificationPrefs);
  };

  return (
    <section
      id="notifications"
      className="space-y-4 border-t border-border/40 pt-12 scroll-mt-20"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Notifications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick which categories ping you in the app, and where else they should land. In-app notifications appear in the bell at the top of the page.
          </p>
        </div>
      </header>

      {!isReady || !draft ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 py-2 bg-foreground/[0.02] border-b border-border/40 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <span>Category</span>
              {channels.map(c => (
                <span key={c.key} className="text-center w-14">{c.label}</span>
              ))}
            </div>
            <div className="divide-y divide-border/40">
              {CATEGORIES.map(cat => (
                <div
                  key={cat.key}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-3 px-4 py-3 items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold tracking-tight">{cat.label}</p>
                    <p className="text-xs text-muted-foreground">{cat.description}</p>
                  </div>
                  {channels.map(ch => {
                    const checked = draft[cat.key][ch.key];
                    return (
                      <div
                        key={ch.key}
                        className="flex sm:justify-center items-center gap-2 sm:gap-0"
                        title={ch.tooltip}
                      >
                        <span className="sm:hidden text-xs font-medium text-muted-foreground w-12">{ch.label}</span>
                        <Toggle
                          checked={!!checked}
                          disabled={!ch.supported}
                          onClick={() => toggle(cat.key, ch.key)}
                          ariaLabel={`${cat.label} via ${ch.label}${ch.tooltip ? ` — ${ch.tooltip}` : ''}`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            In-app notifications appear in the bell up top. Email goes to your sign-in address.
            SMS requires a verified phone number — set one in the Phone section below.
          </p>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="font-bold"
              style={dirty ? { backgroundColor: PROFIT, color: "#000" } : undefined}
            >
              {saving ? 'Saving…' : 'Save preferences'}
            </Button>
            {dirty && !saving && (
              <Button type="button" variant="ghost" onClick={reset}>
                Discard
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Toggle({
  checked, onClick, disabled, ariaLabel,
}: {
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        checked ? '' : 'bg-foreground/15'
      }`}
      style={checked ? { backgroundColor: PROFIT } : undefined}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
          checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

const THEME_OPTIONS: { key: Theme; label: string; description: string; icon: React.ReactNode }[] = [
  { key: 'light',  label: 'Light',  description: 'Bright background, dark type.',                icon: <Sun     className="h-4 w-4" /> },
  { key: 'dark',   label: 'Dark',   description: 'Easy on the eyes after market close.',         icon: <Moon    className="h-4 w-4" /> },
  { key: 'system', label: 'System', description: 'Match whatever your OS is set to right now.',  icon: <Monitor className="h-4 w-4" /> },
];

function ThemePreferenceSection() {
  const { theme: serverTheme, isReady, refresh } = useGlobalStockData();
  // Optimistic local state — flips the html class immediately on click so
  // the new theme paints without waiting for a roundtrip. The ThemeProvider
  // also sets the class once the server confirms, so a failed save will
  // visibly snap back when refresh() lands.
  const [pending, setPending] = useState<Theme | null>(null);
  const active: Theme = pending ?? serverTheme;

  const pick = async (next: Theme) => {
    if (next === active) return;
    setPending(next);
    // Apply immediately so the click feels instant.
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('tradedash.theme', next); } catch {}
      const dark = next === 'dark' ||
        (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    }
    const res = await updateTheme(next);
    if (!res.ok) {
      toast.error(`Couldn't save theme: ${res.error}`);
      setPending(null);
      await refresh();
      return;
    }
    await refresh();
    setPending(null);
  };

  return (
    <section className="space-y-4 border-t border-border/40 pt-12">
      <header>
        <h2 className="text-lg font-bold tracking-tight">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a color mode. &lsquo;System&rsquo; follows your OS preference and updates automatically when it changes.
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-2">
        {THEME_OPTIONS.map(opt => {
          const selected = active === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!isReady}
              onClick={() => pick(opt.key)}
              className={`text-left rounded-lg border p-4 transition-all flex flex-col gap-2 ${
                selected
                  ? 'border-foreground/40 bg-foreground/[0.04] shadow-sm'
                  : 'border-border/50 hover:border-border hover:bg-foreground/[0.02]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="h-9 w-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--muted)' }}
                >
                  {opt.icon}
                </span>
                {selected && <Check className="h-4 w-4" style={{ color: PROFIT }} />}
              </div>
              <p className="text-sm font-bold tracking-tight">{opt.label}</p>
              <p className="text-xs text-muted-foreground leading-snug">{opt.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// Swatch hex values mirror the data-theme-color rules in globals.css. Used
// only to paint the swatch chip in the picker — at runtime the rendered
// color comes from var(--brand) via the html attribute.
const COLOR_SWATCHES: { key: ThemeColor; label: string; hex: string; subtitle: string }[] = [
  { key: 'lime',    label: 'Lime',    hex: '#00C805', subtitle: 'The TradeDash classic.' },
  { key: 'blue',    label: 'Blue',    hex: '#3B82F6', subtitle: 'Calm, Bloomberg-y.' },
  { key: 'pink',    label: 'Pink',    hex: '#EC4899', subtitle: 'Loud and friendly.' },
  { key: 'yellow',  label: 'Yellow',  hex: '#FACC15', subtitle: 'Sticky-note energy.' },
  { key: 'orange',  label: 'Orange',  hex: '#F97316', subtitle: 'Warm Robinhood vibes.' },
  { key: 'red',     label: 'Red',     hex: '#EF4444', subtitle: 'Risk-on aesthetic.' },
  { key: 'purple',  label: 'Purple',  hex: '#A855F7', subtitle: 'Twitch streamer fuel.' },
  { key: 'oled',    label: 'OLED',    hex: '#FFFFFF', subtitle: 'Pure black canvas + white.' },
  { key: 'rainbow', label: 'Rainbow', hex: '#A855F7', subtitle: 'RGB hue cycle, gamer mode.' },
];

function ThemeColorSection() {
  const { themeColor: serverColor, isGoldActive, isReady, refresh } = useGlobalStockData();
  const [pending, setPending] = useState<ThemeColor | null>(null);
  const active: ThemeColor = pending ?? serverColor;

  // Optimistic switch — paint the new color instantly via the data attribute,
  // then commit to the server. Roll back if the RPC rejects (most likely
  // case: the user's Gold lapsed mid-session).
  const pick = async (next: ThemeColor) => {
    if (next === active) return;
    if (!isGoldActive && next !== 'lime') {
      toast.error('Gold required to customize the accent color.');
      return;
    }
    setPending(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('tradedash.themeColor', next); } catch {}
      document.documentElement.setAttribute('data-theme-color', next);
    }
    const res = await updateThemeColor(next);
    if (!res.ok) {
      toast.error(`Couldn't save accent: ${res.error}`);
      setPending(null);
      await refresh();
      return;
    }
    await refresh();
    setPending(null);
  };

  return (
    <section className="space-y-4 border-t border-border/40 pt-12">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight inline-flex items-center gap-2">
            Accent color
            <span
              className="text-[9px] font-bold uppercase tracking-[0.25em] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
              style={{ backgroundColor: '#E8B53020', color: '#E8B530' }}
            >
              <Crown className="h-2.5 w-2.5" />
              Gold
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Recolor every primary action across the app. OLED also flips the canvas to pure black for an
            ultra-dark look. Gains stay green and losses stay red — that&rsquo;s baked in.
          </p>
        </div>
      </header>

      {!isGoldActive && (
        <div
          className="rounded-lg border p-3.5 text-xs leading-relaxed flex items-start gap-2.5"
          style={{ borderColor: '#E8B53040', backgroundColor: '#E8B53008', color: 'var(--foreground)' }}
        >
          <Crown className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#E8B530' }} />
          <span>
            Custom accent colors are a Gold member benefit.{' '}
            <Link
              href="/gold"
              className="font-bold underline-offset-2 hover:underline"
              style={{ color: '#E8B530' }}
            >
              Upgrade to Gold
            </Link>
            {' '}to unlock all eight palettes.
          </span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {COLOR_SWATCHES.map(opt => {
          const selected = active === opt.key;
          const locked = !isGoldActive && opt.key !== 'lime';
          const isOled = opt.key === 'oled';
          const isRainbow = opt.key === 'rainbow';
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!isReady || locked}
              onClick={() => pick(opt.key)}
              className={`text-left rounded-lg border p-3 transition-all flex items-center gap-3 ${
                selected
                  ? 'shadow-sm'
                  : 'border-border/50 hover:border-border hover:bg-foreground/[0.02]'
              } ${locked ? 'opacity-60 cursor-not-allowed' : ''} ${isRainbow && selected ? 'ring-2 ring-offset-2 ring-offset-background' : ''}`}
              style={selected
                ? isRainbow
                  ? { borderColor: 'transparent' }
                  : { borderColor: `color-mix(in srgb, ${opt.hex} 50%, transparent)`, backgroundColor: `color-mix(in srgb, ${opt.hex} 6%, transparent)` }
                : undefined}
            >
              <span
                aria-hidden
                className={`h-9 w-9 rounded-full shrink-0 ring-2 ring-background ${isRainbow ? 'rainbow-swatch' : ''}`}
                style={
                  isOled
                    ? { background: 'linear-gradient(135deg, #000 50%, #fff 50%)' }
                    : isRainbow
                      ? undefined
                      : { backgroundColor: opt.hex }
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold tracking-tight">
                  {opt.label}
                  {opt.key === 'lime' && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      Default
                    </span>
                  )}
                  {isRainbow && (
                    <span
                      className="ml-1.5 text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: 'var(--brand)' }}
                    >
                      RGB
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground leading-snug truncate">{opt.subtitle}</p>
              </div>
              {selected && (
                <Check
                  className="h-4 w-4 shrink-0"
                  style={{ color: isRainbow ? 'var(--brand)' : opt.hex === '#FFFFFF' ? 'var(--foreground)' : opt.hex }}
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PhoneSection() {
  const { phone: serverPhone, phoneVerifiedAt, isReady, refresh } = useGlobalStockData();
  const [draftPhone, setDraftPhone] = useState<string>('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Snap the input to the latest server phone on first ready or when the
  // user finishes editing (not while they're typing).
  useEffect(() => {
    if (isReady) setDraftPhone(serverPhone ?? '');
  }, [serverPhone, isReady]);

  const cleaned = draftPhone.replace(/\D/g, '');
  const hasChanged = cleaned !== (serverPhone ?? '');
  const phoneValid = cleaned === '' || (cleaned.length >= 7 && cleaned.length <= 15);
  const verified = !!phoneVerifiedAt;

  const savePhone = async () => {
    if (!hasChanged || !phoneValid || savingPhone) return;
    setSavingPhone(true);
    try {
      const res = await updatePhone(cleaned || null);
      if (!res.ok) {
        toast.error(`Couldn't save phone: ${res.error}`);
        return;
      }
      await refresh();
      toast.success(cleaned ? 'Phone saved · ready to verify' : 'Phone removed');
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <section className="space-y-4 border-t border-border/40 pt-12">
      <header>
        <h2 className="text-lg font-bold tracking-tight">Phone number</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Required for SMS notifications. We&rsquo;ll send a one-time code to verify it.
        </p>
      </header>

      <Field label="Mobile number">
        <div className="flex flex-wrap gap-2">
          <Input
            type="tel"
            inputMode="tel"
            value={draftPhone}
            onChange={e => setDraftPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            maxLength={20}
            autoComplete="tel"
            className={`flex-1 min-w-[14rem] ${draftPhone && !phoneValid ? 'border-rose-500' : ''}`}
          />
          {hasChanged ? (
            <Button
              type="button"
              onClick={savePhone}
              disabled={!phoneValid || savingPhone}
              className="font-bold"
              style={phoneValid && cleaned ? { backgroundColor: PROFIT, color: '#000' } : undefined}
            >
              {savingPhone ? 'Saving…' : cleaned ? 'Save phone' : 'Remove phone'}
            </Button>
          ) : serverPhone && !verified ? (
            <Button
              type="button"
              onClick={() => setVerifyOpen(true)}
              className="font-bold gap-1.5"
              style={{ backgroundColor: PROFIT, color: '#000' }}
            >
              <Phone className="h-4 w-4" />
              Send code
            </Button>
          ) : null}
        </div>
        {draftPhone && !phoneValid && (
          <p className="text-xs font-medium text-rose-500 mt-1">Phone must be 7–15 digits.</p>
        )}
        {serverPhone && verified && !hasChanged && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500 mt-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified · SMS notifications can now be enabled per category in the Notifications panel above.
          </p>
        )}
        {serverPhone && !verified && !hasChanged && (
          <p className="text-xs text-muted-foreground mt-1">
            Number saved but not verified yet. Click &lsquo;Send code&rsquo; to receive your one-time code.
          </p>
        )}
      </Field>

      <PhoneVerifyModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        phone={serverPhone}
        refresh={refresh}
      />
    </section>
  );
}

function PhoneVerifyModal({
  open, onClose, phone, refresh,
}: {
  open: boolean;
  onClose: () => void;
  phone: string | null;
  refresh: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setErr(null);
      setSubmitting(false);
    }
  }, [open]);

  const valid = /^\d{6}$/.test(code);

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await verifyPhone(code);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success('Phone verified');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow="Verify phone"
      title="Enter the 6-digit code"
      subtitle={
        phone
          ? `We sent a code to ${formatPhoneDisplay(phone)}. (Demo: any 6 digits will work.)`
          : 'Add a phone number first.'
      }
      icon={<Phone className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      <Field label="One-time code">
        <Input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          autoFocus
          autoComplete="one-time-code"
          className={`font-mono text-2xl tracking-[0.6em] text-center ${err ? 'border-rose-500' : ''}`}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Didn&rsquo;t get one? In a real build this would re-send via Twilio Verify or similar.
          For now any 6-digit code is accepted.
        </p>
      </Field>

      {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

      <ModalFooter align="stretch">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={!valid || submitting}
          className="font-bold"
          style={valid ? { backgroundColor: PROFIT, color: '#000' } : undefined}
        >
          {submitting ? 'Verifying…' : 'Verify'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function formatPhoneDisplay(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `+${digits}`;
}

function ComingSoon({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-4 flex items-start gap-3">
      <div className="h-8 w-8 rounded-full bg-foreground/5 flex items-center justify-center shrink-0 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold tracking-tight">{title}</p>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">
            Coming soon
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}
