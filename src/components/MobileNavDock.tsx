"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGlobalStockData } from "@/components/StockDataProvider";
import { CircleUserRound, Crown, Home, ScrollText, Wallet } from "lucide-react";

const GOLD = "#E8B530";
const PROFIT = "var(--brand)";

const ITEMS = [
  { href: '/',         label: 'Portfolio', icon: Home,            match: (p: string) => p === '/' },
  { href: '/wallet',   label: 'Wallet',    icon: Wallet,          match: (p: string) => p === '/wallet' },
  { href: '/activity', label: 'Activity',  icon: ScrollText,      match: (p: string) => p === '/activity' },
  { href: '/account',  label: 'Account',   icon: CircleUserRound, match: (p: string) => p === '/account' },
  { href: '/gold',     label: 'Gold',      icon: Crown,           match: (p: string) => p === '/gold' },
] as const;

export function MobileNavDock() {
  const pathname = usePathname() ?? '';
  const { isGoldActive } = useGlobalStockData();

  return (
    <nav
      aria-label="Primary mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/50 bg-background/90 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {ITEMS.map(item => {
          const active = item.match(pathname);
          const isGold = item.href === '/gold';
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
              style={{
                color: active ? (isGold ? GOLD : 'var(--foreground)') : undefined,
              }}
            >
              <span className="relative">
                <Icon
                  className="h-5 w-5"
                  style={{
                    color: active
                      ? (isGold ? GOLD : PROFIT)
                      : isGold
                        ? GOLD
                        : 'var(--muted-foreground)',
                  }}
                />
                {isGold && isGoldActive && (
                  <span
                    className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: GOLD }}
                    aria-hidden
                  />
                )}
              </span>
              <span className={active ? '' : 'text-muted-foreground'}>{item.label}</span>
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                  style={{ backgroundColor: isGold ? GOLD : PROFIT }}
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
