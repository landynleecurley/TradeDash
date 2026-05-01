"use client";

import { ArrowDownToLine, ArrowUpFromLine, Crown, ShoppingBag, TrendingDown, TrendingUp } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { TopNav } from "@/components/TopNav";
import { NotificationsBell } from "@/components/NotificationsBell";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";

type Tx = {
  id: string;
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'CARD_SPEND' | 'MEMBERSHIP';
  symbol: string | null;
  shares: number | null;
  price: number | null;
  amount: number;
  createdAt: string;
};

function describe(tx: Tx): { title: string; sign: 1 | -1 } {
  switch (tx.type) {
    case 'BUY':
      return {
        title: `Bought ${tx.shares} ${tx.symbol} @ $${tx.price?.toFixed(2)}`,
        sign: -1,
      };
    case 'SELL':
      return {
        title: `Sold ${tx.shares} ${tx.symbol} @ $${tx.price?.toFixed(2)}`,
        sign: 1,
      };
    case 'DEPOSIT':
      return { title: 'Deposit', sign: 1 };
    case 'WITHDRAW':
      return { title: 'Withdrawal', sign: -1 };
    case 'CARD_SPEND':
      return { title: tx.symbol ? `Card · ${tx.symbol}` : 'Card purchase', sign: -1 };
    case 'MEMBERSHIP':
      return { title: tx.symbol ?? 'Membership', sign: -1 };
  }
}

function iconFor(tx: Tx) {
  switch (tx.type) {
    case 'BUY': return <TrendingUp className="h-4 w-4" />;
    case 'SELL': return <TrendingDown className="h-4 w-4" />;
    case 'DEPOSIT': return <ArrowDownToLine className="h-4 w-4" />;
    case 'WITHDRAW': return <ArrowUpFromLine className="h-4 w-4" />;
    case 'CARD_SPEND': return <ShoppingBag className="h-4 w-4" />;
    case 'MEMBERSHIP': return <Crown className="h-4 w-4" />;
  }
}

function formatDateGroup(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
}

export function ActivityClient({ transactions }: { transactions: Tx[] }) {
  // Group by day
  const groups = new Map<string, Tx[]>();
  for (const tx of transactions) {
    const key = formatDateGroup(tx.createdAt);
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  return (
    <div className="flex flex-col flex-1 w-full bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 backdrop-blur-xl w-full px-4">
        <SearchBar className="w-full max-w-sm shrink" />
        <TopNav className="hidden lg:flex shrink-0" />
        <NotificationsBell className="ml-auto" />
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {transactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No transactions yet.</p>
        ) : (
          [...groups.entries()].map(([day, txs]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{day}</h2>
              <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
                {txs.map(tx => {
                  const { title, sign } = describe(tx);
                  const color = sign > 0 ? PROFIT : LOSS;
                  return (
                    <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-foreground/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ color, backgroundColor: `${color}1a` }}
                        >
                          {iconFor(tx)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold tracking-tight truncate">{title}</p>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mt-0.5">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <p className="font-mono font-bold text-sm shrink-0 ml-3" style={{ color }}>
                        {sign > 0 ? '+' : '-'}${tx.amount.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
