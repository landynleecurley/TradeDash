"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthBrandPanel } from "@/components/AuthBrandPanel";
import { Activity, ArrowRight, Eye, EyeOff } from "lucide-react";

const PROFIT = "var(--brand)";

type Status = "loading" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The recovery link drops the user here with a one-time token. The browser
  // client (detectSessionInUrl) auto-exchanges it on load and fires an auth
  // event — we accept either PKCE (SIGNED_IN) or implicit (PASSWORD_RECOVERY).
  // If no session ever materializes, the link was bad or expired.
  useEffect(() => {
    // Read the recovery markers BEFORE creating the client — detectSessionInUrl
    // consumes and strips the URL params the moment the client is instantiated.
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const hasError = url.searchParams.has("error") || url.searchParams.has("error_code");
    const isRecovery = url.searchParams.has("code") || hashParams.get("type") === "recovery";

    let settled = false;
    const settle = (next: Status) => {
      if (!settled) {
        settled = true;
        setStatus(next);
      }
    };

    // No recovery token (or an explicit error from Supabase) means this isn't a
    // valid reset visit — don't show the form just because a normal session
    // happens to exist. Defer the state update out of the effect body.
    if (hasError || !isRecovery) {
      const id = setTimeout(() => settle("invalid"), 0);
      return () => clearTimeout(id);
    }

    const supabase = createClient();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        settle("ready");
      }
    });

    // Catch a session that was established before the listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle("ready");
    });

    // Generous timeout so a slow exchange on a mobile network isn't mistaken
    // for an invalid link.
    const timer = setTimeout(() => settle("invalid"), 10000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const valid = password.length >= 8 && password === confirm;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setErr(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErr(error.message);
        return;
      }
      toast.success("Password updated — you're signed in.");
      router.replace("/");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen flex bg-background">
      <AuthBrandPanel subtitle="Almost there — set a new password and you're back in." />

      <div className="w-full md:w-1/2 flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-md space-y-6">
          {/* Logo — mobile only (brand panel is hidden below md) */}
          <div className="md:hidden flex items-center gap-2 font-bold text-xl tracking-tight">
            <Activity className="h-6 w-6" style={{ color: PROFIT }} />
            TradeDash
          </div>

          {status === "loading" && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
              <Activity className="h-5 w-5 animate-pulse" style={{ color: PROFIT }} />
              Verifying your reset link…
            </div>
          )}

          {status === "invalid" && (
            <div className="space-y-6" role="status">
              <header>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Reset password
                </p>
                <h1 className="text-3xl font-bold tracking-tight mt-1">This link didn&rsquo;t work</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Reset links are single-use, expire after an hour, and must be opened in the same
                  browser you requested them from. Request a fresh one to continue.
                </p>
              </header>
              <Button
                render={<Link href="/forgot-password" />}
                nativeButton={false}
                className="w-full h-12 font-bold gap-1.5"
                style={{ backgroundColor: PROFIT, color: "#000" }}
              >
                Request a new link <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                <Link href="/login" className="font-semibold text-foreground hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={onSubmit} className="space-y-6">
              <header>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Reset password
                </p>
                <h1 className="text-3xl font-bold tracking-tight mt-1">Set a new password</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Choose a strong password — at least 8 characters.
                </p>
              </header>

              <div className="space-y-4">
                <Field label="New password">
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      minLength={8}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      autoFocus
                      className="h-12 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <Field label="Confirm password">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-12"
                  />
                  {confirm.length > 0 && password !== confirm && (
                    <p className="text-xs font-medium text-rose-500 mt-1">Passwords don&rsquo;t match.</p>
                  )}
                </Field>
              </div>

              {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

              <Button
                type="submit"
                disabled={!valid || saving}
                className="w-full h-12 font-bold gap-1.5"
                style={valid ? { backgroundColor: PROFIT, color: "#000" } : undefined}
              >
                {saving ? "Updating…" : "Update password"} <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
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
