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

// Stylized EMV chip — gold gradient with the canonical contact pattern.
function Chip() {
  return (
    <svg width="40" height="30" viewBox="0 0 40 30" aria-hidden>
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
  // Metal trumps gold visually — the brushed steel finish reads as the
  // "premium" tier even on a non-Gold account.
  const isMetal = card.cardType === 'metal';
  const accent = isMetal ? GOLD : gold ? GOLD : PROFIT;
  const background = isMetal
    ? `linear-gradient(135deg, #1f1f23 0%, #2c2c30 25%, #6a6a70 55%, #c9c9cf 78%, #6a6a70 100%)`
    : gold
      ? `linear-gradient(135deg, #1a1208 0%, #2b1f0a 35%, #4a3a18 70%, ${GOLD} 100%)`
      : `linear-gradient(135deg, #050505 0%, #1a1a1a 50%, var(--brand-30) 100%)`;

  return (
    <div
      className="relative w-full max-w-sm aspect-[1.586/1] rounded-2xl p-6 text-white shadow-2xl overflow-hidden"
      style={{ background }}
    >
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full" style={{ backgroundColor: `${accent}10` }} />
      <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full" style={{ backgroundColor: `${accent}08` }} />

      <div className="relative h-full flex flex-col justify-between">
        {/* Top row: brand left, virtual badge + reveal toggle right. */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="font-black text-base tracking-tight italic" style={{ color: accent }}>
              TradeDash
            </span>
            {gold && (
              <span
                className="text-[9px] font-bold uppercase tracking-[0.25em] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{ backgroundColor: `${GOLD}30`, color: GOLD }}
              >
                <Crown className="h-2.5 w-2.5" />
                Gold
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.25em] px-2 py-1 rounded border text-white/80"
              style={{
                borderColor: card.cardType === 'virtual' ? 'rgba(255,255,255,0.3)' : `${accent}66`,
                color: card.cardType === 'virtual' ? undefined : accent,
                backgroundColor: card.cardType === 'virtual' ? undefined : `${accent}1a`,
              }}
            >
              {card.cardType === 'metal' ? 'Metal' : card.cardType === 'standard' ? 'Standard' : 'Virtual'}
            </span>
            <button
              type="button"
              onClick={() => setRevealed(r => !r)}
              className="h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              aria-label={revealed ? 'Hide card details' : 'Show card details'}
            >
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Middle row: chip + contactless. */}
        <div className="flex items-center gap-3">
          <Chip />
          <Wifi className="h-5 w-5 -rotate-90 opacity-70" aria-hidden />
        </div>

        {/* Bottom: card number + cardholder/expiry/cvv. */}
        <div className="space-y-3">
          <p className="font-mono text-base md:text-lg tracking-[0.2em]" aria-label="Card number">
            {formatCardNumber(card.cardNumber, !revealed)}
          </p>
          <div className="flex items-end justify-between text-xs gap-3">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-widest opacity-60">Cardholder</p>
              <p className="font-bold tracking-wide mt-0.5 truncate">{card.cardholderName ?? 'CARDHOLDER'}</p>
            </div>
            <div className="shrink-0">
              <p className="text-[9px] uppercase tracking-widest opacity-60">Expires</p>
              <p className="font-mono font-bold mt-0.5">{expiry}</p>
            </div>
            <div className="shrink-0">
              <p className="text-[9px] uppercase tracking-widest opacity-60">CVV</p>
              <p className="font-mono font-bold mt-0.5">{revealed ? card.cvv : '•••'}</p>
            </div>
          </div>
        </div>
      </div>

      {frozen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md bg-blue-950/60">
          <Snowflake className="h-10 w-10 text-blue-200" />
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-blue-100">Frozen</p>
        </div>
      )}
    </div>
  );
}
