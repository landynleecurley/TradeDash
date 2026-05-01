import { Toaster } from "sonner";
import { Activity } from "lucide-react";

const PROFIT = "var(--brand)";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="flex items-center gap-2 mb-8 font-bold text-2xl tracking-tight">
        <Activity className="h-6 w-6" style={{ color: PROFIT }} />
        TradeDash
      </div>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          },
        }}
      />
    </main>
  );
}
