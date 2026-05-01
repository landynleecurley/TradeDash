"use client";

import { useState } from "react";
import { Crown, Eye, EyeOff, Snowflake, Wifi } from "lucide-react";
import type { CardInfo } from "@/lib/useStockData";

const PROFIT = "var(--brand)";
const GOLD = "#E8B530";

function formatCardNumber(num: string, masked: boolean) {
  const digits = num.replace(/\s+/g, '');
  if (masked) return `•••• •••• •••• ${digits.slice(-4)}`;
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

// Stylized EMV chip — the SVG keeps its 4:3 viewBox and scales to whatever
// width the parent gives it. That lets the chip shrink in lock-step with
// the rest of the card on narrow viewports.
function Chip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 30" aria-hidden className={className}>
      <defs>
        <linearGradient id="chipBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6c98c" />
          <stop offset="50%" stopColor="#b48a4d" />
          <stop offset="100%" stopColor="#7a5b30" />
        </linearGradient>
      </defs>
      <rect width="40" height="30" rx="4" fill="url(#chipBody)" />
      <rect x="2" y="2" width="36" height="26" rx="3" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      <line x1="14" y1="0" x2="14" y2="30" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      <line x1="26" y1="0" x2="26" y2="30" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      <line x1="0" y1="10" x2="40" y2="10" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
      <line x1="0" y1="20" x2="40" y2="20" stroke="rgba(0,0,0,0.25)" strokeWidth="0.6" />
    </svg>
  );
}

export function DebitCard({ card, gold = false }: { card: CardInfo; gold?: boolean }) {
  const [revealed, setRevealed] = useState(false);

  const frozen = card.status === 'frozen';
  const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
  const isMetal = card.cardType === 'metal';
  const accent = isMetal ? GOLD : gold ? GOLD : PROFIT;
  const background = isMetal
    ? `linear-gradient(135deg, #1f1f23 0%, #2c2c30 25%, #6a6a70 55%, #c9c9cf 78%, #6a6a70 100%)`
    : gold
      ? `linear-gradient(135deg, #1a1208 0%, #2b1f0a 35%, #4a3a18 70%, ${GOLD} 100%)`
      : `linear-gradient(135deg, #050505 0%, #1a1a1a 50%, var(--brand-30) 100%)`;

  return (
    // `@container` makes every internal cqw/clamp() value resolve against the
    // card's own width — so the same component prints correctly whether
    // it's 240px wide on a phone or 480px in the wallet hero.
    <div
      className="@container relative w-full max-w-md aspect-[1.586/1] rounded-2xl text-white shadow-2xl overflow-hidden"
      style={{ background }}
    >
      {/* Decorative gradient blobs — also sized in cqw so they keep their
           position relative to the card, not the viewport. */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          top: '-30%', right: '-30%',
          width: '60%', height: '60%',
          backgroundColor: `${accent}10`,
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          bottom: '-40%', left: '-15%',
          width: '70%', height: '70%',
          backgroundColor: `${accent}08`,
        }}
      />

      <div
        className="relative h-full flex flex-col justify-between"
        style={{ padding: 'clamp(0.875rem, 6cqw, 1.5rem)' }}
      >
        {/* Top row: brand left, badge + reveal toggle right. */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            <span
              className="font-black tracking-tight italic whitespace-nowrap"
              style={{ color: accent, fontSize: 'clamp(0.875rem, 4.5cqw, 1.125rem)' }}
            >
              TradeDash
            </span>
            {gold && (
              <span
                className="font-bold uppercase tracking-[0.25em] rounded inline-flex items-center gap-1 whitespace-nowrap"
                style={{
                  backgroundColor: `${GOLD}30`,
                  color: GOLD,
                  fontSize: 'clamp(0.5rem, 2.2cqw, 0.625rem)',
                  padding: 'clamp(0.0625rem, 0.5cqw, 0.125rem) clamp(0.25rem, 1.4cqw, 0.4rem)',
                }}
              >
                <Crown style={{ width: 'clamp(0.5rem, 2.5cqw, 0.625rem)', height: 'clamp(0.5rem, 2.5cqw, 0.625rem)' }} />
                Gold
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="font-bold uppercase tracking-[0.2em] rounded border whitespace-nowrap"
              style={{
                fontSize: 'clamp(0.5rem, 2.2cqw, 0.625rem)',
                padding: 'clamp(0.125rem, 0.8cqw, 0.25rem) clamp(0.375rem, 1.8cqw, 0.5rem)',
                borderColor: card.cardType === 'virtual' ? 'rgba(255,255,255,0.3)' : `${accent}66`,
                color: card.cardType === 'virtual' ? 'rgba(255,255,255,0.8)' : accent,
                backgroundColor: card.cardType === 'virtual' ? undefined : `${accent}1a`,
              }}
            >
              {card.cardType === 'metal' ? 'Metal' : card.cardType === 'standard' ? 'Standard' : 'Virtual'}
            </span>
            <button
              type="button"
              onClick={() => setRevealed(r => !r)}
              className="rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center shrink-0"
              style={{
                width: 'clamp(1.5rem, 7cqw, 1.75rem)',
                height: 'clamp(1.5rem, 7cqw, 1.75rem)',
              }}
              aria-label={revealed ? 'Hide card details' : 'Show card details'}
            >
              {revealed
                ? <EyeOff style={{ width: 'clamp(0.75rem, 3.5cqw, 0.875rem)', height: 'clamp(0.75rem, 3.5cqw, 0.875rem)' }} />
                : <Eye style={{ width: 'clamp(0.75rem, 3.5cqw, 0.875rem)', height: 'clamp(0.75rem, 3.5cqw, 0.875rem)' }} />}
            </button>
          </div>
        </div>

        {/* Middle row: chip + contactless. */}
        <div className="flex items-center" style={{ gap: 'clamp(0.5rem, 2.5cqw, 0.75rem)' }}>
          {/* 10cqw is roughly chip-sized at any zoom level; clamp keeps it
               28-48px so it never disappears or balloons. */}
          <div
            className="shrink-0"
            style={{ width: 'clamp(1.75rem, 10cqw, 3rem)' }}
          >
            <Chip className="w-full h-auto" />
          </div>
          <Wifi
            className="-rotate-90 opacity-70 shrink-0"
            style={{ width: 'clamp(1rem, 4.5cqw, 1.25rem)', height: 'clamp(1rem, 4.5cqw, 1.25rem)' }}
            aria-hidden
          />
        </div>

        {/* Bottom: card number + cardholder/expiry/cvv. */}
        <div style={{ gap: 'clamp(0.5rem, 2.5cqw, 0.75rem)' }} className="flex flex-col">
          <p
            className="font-mono whitespace-nowrap"
            style={{
              fontSize: 'clamp(0.875rem, 4.8cqw, 1.25rem)',
              letterSpacing: '0.18em',
            }}
            aria-label="Card number"
          >
            {formatCardNumber(card.cardNumber, !revealed)}
          </p>
          <div
            className="flex items-end justify-between"
            style={{ gap: 'clamp(0.5rem, 2.5cqw, 0.75rem)' }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="uppercase tracking-widest opacity-60"
                style={{ fontSize: 'clamp(0.5rem, 2cqw, 0.625rem)' }}
              >
                Cardholder
              </p>
              <p
                className="font-bold tracking-wide truncate"
                style={{ marginTop: '0.125rem', fontSize: 'clamp(0.625rem, 2.6cqw, 0.75rem)' }}
              >
                {card.cardholderName ?? 'CARDHOLDER'}
              </p>
            </div>
            <div className="shrink-0">
              <p
                className="uppercase tracking-widest opacity-60"
                style={{ fontSize: 'clamp(0.5rem, 2cqw, 0.625rem)' }}
              >
                Expires
              </p>
              <p
                className="font-mono font-bold"
                style={{ marginTop: '0.125rem', fontSize: 'clamp(0.625rem, 2.6cqw, 0.75rem)' }}
              >
                {expiry}
              </p>
            </div>
            <div className="shrink-0">
              <p
                className="uppercase tracking-widest opacity-60"
                style={{ fontSize: 'clamp(0.5rem, 2cqw, 0.625rem)' }}
              >
                CVV
              </p>
              <p
                className="font-mono font-bold"
                style={{ marginTop: '0.125rem', fontSize: 'clamp(0.625rem, 2.6cqw, 0.75rem)' }}
              >
                {revealed ? card.cvv : '•••'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {frozen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md bg-blue-950/60">
          <Snowflake
            className="text-blue-200"
            style={{ width: 'clamp(1.5rem, 12cqw, 2.5rem)', height: 'clamp(1.5rem, 12cqw, 2.5rem)' }}
          />
          <p
            className="font-bold uppercase tracking-[0.3em] text-blue-100"
            style={{
              marginTop: '0.5rem',
              fontSize: 'clamp(0.5rem, 2.5cqw, 0.75rem)',
            }}
          >
            Frozen
          </p>
        </div>
      )}
    </div>
  );
}
