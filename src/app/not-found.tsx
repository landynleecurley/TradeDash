import Link from "next/link";
import { Activity, ArrowLeft, Search } from "lucide-react";

const BRAND = "var(--brand)";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
        <Activity className="h-6 w-6" style={{ color: BRAND }} />
        TradeDash
      </div>

      <p
        className="mt-12 font-mono font-bold text-7xl sm:text-8xl tracking-tight tabular-nums leading-none"
        style={{ color: BRAND }}
      >
        404
      </p>
      <h1 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight">This page slipped past us</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-sm">
        The page you&rsquo;re looking for doesn&rsquo;t exist, moved, or the ticker isn&rsquo;t one we
        track. Let&rsquo;s get you back on the floor.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg font-bold text-sm uppercase tracking-widest transition-opacity hover:opacity-90"
          style={{ backgroundColor: BRAND, color: "#000" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <Link
          href="/account"
          className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg border border-border text-sm font-bold uppercase tracking-widest text-foreground hover:bg-foreground/5 transition-colors"
        >
          <Search className="h-4 w-4" /> Your account
        </Link>
      </div>
    </main>
  );
}
