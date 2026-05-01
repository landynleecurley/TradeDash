"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, ArrowUp, ArrowDown, Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { createPriceAlert, type PriceAlertDirection } from "@/lib/actions";

const PROFIT = "var(--brand)";
const LOSS = "#FF5000";
const GOLD = "#E8B530";

const PERCENT_PRESETS = [-10, -5, -2, 2, 5, 10];

type Props = {
  open: boolean;
  onClose: () => void;
  symbol: string;
  symbolName: string;
  currentPrice: number;
  isGoldActive: boolean;
  refresh: () => Promise<void>;
};

export function PriceAlertModal({
  open, onClose, symbol, symbolName, currentPrice, isGoldActive, refresh,
}: Props) {
  const [direction, setDirection] = useState<PriceAlertDirection>('above');
  const [thresholdStr, setThresholdStr] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      // Default to 5% above the current price; users typically set "wake me
      // when it pops" before "wake me when it dumps".
      const seed = currentPrice > 0 ? roundForDisplay(currentPrice * 1.05) : 0;
      setDirection('above');
      setThresholdStr(seed > 0 ? String(seed) : '');
      setErr(null);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open, currentPrice]);

  const threshold = Number(thresholdStr);
  const valid = Number.isFinite(threshold) && threshold > 0;
  const deltaPct = useMemo(() => {
    if (!valid || currentPrice <= 0) return null;
    return ((threshold - currentPrice) / currentPrice) * 100;
  }, [threshold, currentPrice, valid]);

  // The picked direction has to actually be on the right side of "now",
  // otherwise the alert would fire instantly.
  const directionMakesSense =
    !valid ||
    currentPrice <= 0 ||
    (direction === 'above' && threshold > currentPrice) ||
    (direction === 'below' && threshold < currentPrice);
  const canSubmit = isGoldActive && valid && directionMakesSense;

  const applyPreset = (pct: number) => {
    if (currentPrice <= 0) return;
    const target = roundForDisplay(currentPrice * (1 + pct / 100));
    setThresholdStr(String(target));
    setDirection(pct >= 0 ? 'above' : 'below');
  };

  const submit = async () => {
    if (submittingRef.current || !canSubmit) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await createPriceAlert({ symbol, direction, threshold });
      if (!res.ok) {
        setErr(res.error);
        toast.error(`Couldn't create alert: ${res.error}`);
        return;
      }
      await refresh();
      toast.success(
        `Alert set · ${symbol} ${direction === 'above' ? '≥' : '≤'} $${threshold.toFixed(2)}`,
      );
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const accentColor = direction === 'above' ? PROFIT : LOSS;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow={`${symbol} · price alert`}
      title="Set a price alert"
      subtitle={
        currentPrice > 0
          ? `${symbolName} is at $${currentPrice.toFixed(2)} now. We'll ping you the moment it crosses your threshold.`
          : `Set a threshold and we'll notify you when ${symbol} crosses it.`
      }
      icon={<Bell className="h-5 w-5" />}
      iconColor={isGoldActive ? PROFIT : GOLD}
      size="md"
    >
      {!isGoldActive ? (
        <div className="space-y-4">
          <div
            className="rounded-lg border p-4 flex items-start gap-3"
            style={{ borderColor: `${GOLD}40`, backgroundColor: `${GOLD}0a` }}
          >
            <Crown className="h-5 w-5 shrink-0 mt-0.5" style={{ color: GOLD }} />
            <div className="text-sm leading-relaxed">
              <p className="font-bold tracking-tight">Smart price alerts are a Gold benefit.</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Set thresholds on any watchlist symbol. We&rsquo;ll watch the live tape and ping the
                bell up top — plus email or SMS if you&rsquo;ve enabled them — the instant it crosses.
              </p>
            </div>
          </div>
          <ModalFooter align="stretch">
            <Button type="button" variant="outline" onClick={onClose}>
              Not now
            </Button>
            <Button
              render={<Link href="/gold" onClick={onClose} />}
              nativeButton={false}
              className="font-bold gap-1.5"
              style={{ backgroundColor: GOLD, color: "#000" }}
            >
              <Crown className="h-4 w-4" />
              Upgrade to Gold
            </Button>
          </ModalFooter>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Direction picker */}
          <div className="grid grid-cols-2 gap-2">
            <DirectionTile
              direction="above"
              selected={direction === 'above'}
              onClick={() => setDirection('above')}
            />
            <DirectionTile
              direction="below"
              selected={direction === 'below'}
              onClick={() => setDirection('below')}
            />
          </div>

          {/* Threshold input */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Threshold
            </label>
            <div className="relative">
              <span
                aria-hidden
                className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold font-mono text-muted-foreground pointer-events-none"
              >
                $
              </span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={thresholdStr}
                onChange={e => setThresholdStr(e.target.value)}
                placeholder="0.00"
                autoFocus
                className={`h-12 text-2xl font-bold font-mono pl-9 ${
                  valid && !directionMakesSense ? "border-rose-500" : ""
                }`}
              />
            </div>
            {valid && currentPrice > 0 && deltaPct !== null && (
              <p
                className="text-xs font-mono"
                style={{ color: directionMakesSense ? 'var(--muted-foreground)' : LOSS }}
              >
                {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}% vs. current
                {!directionMakesSense && (
                  <span className="ml-2 font-bold">
                    Pick {direction === 'above' ? 'a higher' : 'a lower'} threshold or flip direction.
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Quick percent presets */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Quick presets
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {PERCENT_PRESETS.map(pct => {
                const negative = pct < 0;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => applyPreset(pct)}
                    disabled={currentPrice <= 0}
                    className="px-2 py-2 rounded-md text-xs font-bold tabular-nums transition-colors disabled:opacity-40"
                    style={{
                      backgroundColor: negative ? `${LOSS}1a` : `var(--brand-1a)`,
                      color: negative ? LOSS : 'var(--brand)',
                    }}
                  >
                    {pct >= 0 ? '+' : ''}{pct}%
                  </button>
                );
              })}
            </div>
          </div>

          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

          <ModalFooter align="stretch">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="font-bold gap-1.5"
              style={canSubmit
                ? { backgroundColor: accentColor, color: direction === 'above' ? '#000' : '#fff' }
                : undefined}
            >
              <Bell className="h-4 w-4" />
              {submitting ? 'Setting alert…' : 'Create alert'}
            </Button>
          </ModalFooter>
        </div>
      )}
    </Modal>
  );
}

function DirectionTile({
  direction, selected, onClick,
}: {
  direction: PriceAlertDirection;
  selected: boolean;
  onClick: () => void;
}) {
  const accent = direction === 'above' ? PROFIT : LOSS;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition-all flex items-center gap-3 ${
        selected ? 'shadow-sm' : 'border-border/50 hover:border-border hover:bg-foreground/[0.02]'
      }`}
      style={selected
        ? { borderColor: `color-mix(in srgb, ${accent} 50%, transparent)`, backgroundColor: `color-mix(in srgb, ${accent} 6%, transparent)` }
        : undefined}
    >
      <span
        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
          color: accent,
        }}
      >
        {direction === 'above' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold tracking-tight">
          {direction === 'above' ? 'Crosses above' : 'Falls below'}
        </span>
        <span className="block text-xs text-muted-foreground">
          {direction === 'above' ? 'When price ≥ threshold' : 'When price ≤ threshold'}
        </span>
      </span>
    </button>
  );
}

// Small helper so $0.41 doesn't end up as "0.40850000000000003" after a
// percent calculation on awkward floats.
function roundForDisplay(n: number): number {
  if (n >= 100) return Math.round(n * 100) / 100;
  if (n >= 10) return Math.round(n * 100) / 100;
  return Math.round(n * 100) / 100;
}
