"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";

const PROFIT = "var(--brand)";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const valid = email.includes('@') && password.length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || loading) return;
    setErr(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErr(error.message);
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  // Anonymous sign-in lets visitors poke around the app without committing
  // to a real account. The DB trigger seeds them with $10k + a starter
  // watchlist so the dashboard doesn't open empty.
  const onTryDemo = async () => {
    if (demoLoading) return;
    setErr(null);
    setDemoLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setErr(
          error.message.includes('disabled') || error.message.includes('not enabled')
            ? "Demo mode isn't enabled on this Supabase project. Toggle Authentication → Sign In Providers → Allow anonymous sign-ins."
            : error.message,
        );
        return;
      }
      router.replace('/');
      router.refresh();
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md space-y-6">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Welcome back</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Sign in to TradeDash</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Use the email and password you signed up with.
        </p>
      </header>

      <div className="space-y-4">
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
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
        </Field>
      </div>

      {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

      <Button
        type="submit"
        disabled={!valid || loading}
        className="w-full font-bold gap-1.5"
        style={valid ? { backgroundColor: PROFIT, color: '#000' } : undefined}
      >
        {loading ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
      </Button>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/50" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 bg-background text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            or
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onTryDemo}
        disabled={demoLoading || loading}
        className="w-full font-bold gap-1.5"
      >
        <Sparkles className="h-4 w-4" style={{ color: PROFIT }} />
        {demoLoading ? "Loading demo…" : "Try the demo · no signup needed"}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        New to TradeDash?{" "}
        <Link href="/signup" className="font-semibold text-foreground hover:underline">
          Create an account
        </Link>
      </p>
    </form>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-md" />}>
      <LoginForm />
    </Suspense>
  );
}
