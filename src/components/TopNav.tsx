"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { Crown } from "lucide-react";

const GOLD = "#E8B530";

const ITEMS = [
  { href: '/',         label: 'Portfolio', match: (p: string) => p === '/' },
  { href: '/wallet',   label: 'Wallet',   match: (p: string) => p === '/wallet' },
  { href: '/activity', label: 'Activity', match: (p: string) => p === '/activity' },
  { href: '/account',  label: 'Account',  match: (p: string) => p === '/account' },
  { href: '/gold',     label: 'Gold',     match: (p: string) => p === '/gold' },
] as const;

export function TopNav({ className = "" }: { className?: string }) {
  const pathname = usePathname() ?? '';
  const { isGoldActive } = useGlobalStockData();

  return (
    <nav className={`flex items-center gap-1 ${className}`} aria-label="Primary">
      {ITEMS.map(item => {
        const active = item.match(pathname);
        const isGold = item.href === '/gold';
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold tracking-tight transition-colors ${
              active
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            {isGold && <Crown className="h-3.5 w-3.5" style={{ color: GOLD }} />}
            {item.label}
            {isGold && isGoldActive && (
              <span
                className="ml-0.5 text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${GOLD}20`, color: GOLD }}
              >
                Active
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
