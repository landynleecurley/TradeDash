"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthBrandPanel } from "@/components/AuthBrandPanel";
import { Activity, ArrowLeft, ArrowRight, MailCheck } from "lucide-react";

const PROFIT = "var(--brand)";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid = email.includes("@");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || loading) return;
    setErr(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setErr(error.message);
        return;
      }
      // Always show success — don't reveal whether the email is registered.
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex bg-background">
      <AuthBrandPanel subtitle="Locked out? We'll email you a secure link to reset your password." />

      <div className="w-full md:w-1/2 flex items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-md space-y-6">
          {/* Logo — mobile only (brand panel is hidden below md) */}
          <div className="md:hidden flex items-center gap-2 font-bold text-xl tracking-tight">
            <Activity className="h-6 w-6" style={{ color: PROFIT }} />
            TradeDash
          </div>

          {sent ? (
            <div className="space-y-6">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--brand-1a)", color: PROFIT }}
              >
                <MailCheck className="h-6 w-6" />
              </div>
              <header>
                <h1 className="text-3xl font-bold tracking-tight">Check your email</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  If an account exists for{" "}
                  <span className="font-semibold text-foreground">{email}</span>, we&rsquo;ve sent a
                  link to reset your password. The link expires in 1 hour.
                </p>
              </header>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSent(false)}
                className="w-full h-12 font-bold gap-1.5"
              >
                Use a different email
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                <Link
                  href="/login"
                  className="font-semibold text-foreground hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <header>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Reset password
                </p>
                <h1 className="text-3xl font-bold tracking-tight mt-1">Forgot your password?</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Enter your email and we&rsquo;ll send you a link to set a new one.
                </p>
              </header>

              <Field label="Email">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className="h-12"
                />
              </Field>

              {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

              <Button
                type="submit"
                disabled={!valid || loading}
                className="w-full h-12 font-bold gap-1.5"
                style={{ backgroundColor: PROFIT, color: "#000" }}
              >
                {loading ? "Sending…" : "Send reset link"} <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-sm text-muted-foreground text-center">
                Remembered it?{" "}
                <Link href="/login" className="font-semibold text-foreground hover:underline">
                  Back to sign in
                </Link>
              </p>
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
