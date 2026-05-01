"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Crown, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { orderPhysicalCard, type PhysicalCardType } from "@/lib/actions";

const PROFIT = "var(--brand)";
const GOLD = "#E8B530";

const METAL_FEE = 149;

type Props = {
  open: boolean;
  onClose: () => void;
  isGoldActive: boolean;
  cashBalance: number;
  refresh: () => Promise<void>;
};

export function OrderPhysicalCardModal({ open, onClose, isGoldActive, cashBalance, refresh }: Props) {
  const [selected, setSelected] = useState<PhysicalCardType>('standard');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (open) {
      // Default to whichever is actually orderable for this user.
      setSelected(isGoldActive ? 'standard' : 'metal');
      setErr(null);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [open, isGoldActive]);

  const standardLocked = !isGoldActive;
  const metalAffordable = cashBalance >= METAL_FEE;
  const canOrder =
    (selected === 'standard' && isGoldActive) ||
    (selected === 'metal' && metalAffordable);

  const submit = async () => {
    if (submittingRef.current || !canOrder) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await orderPhysicalCard(selected);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success(
        selected === 'metal'
          ? 'Metal card on the way · Charged $149'
          : 'Standard card on the way',
      );
      onClose();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow="Physical card"
      title="Pick a physical card"
      subtitle="Your card number, CVV, expiry, and PIN stay the same. Choose the finish."
      icon={<CreditCard className="h-5 w-5" />}
      iconColor={PROFIT}
      size="md"
    >
      <div className="space-y-3">
        <CardOption
          selected={selected === 'standard'}
          onClick={() => setSelected('standard')}
          disabled={standardLocked}
          title="Standard"
          subtitle="Matte black plastic"
          price={isGoldActive ? 'Free with Gold' : null}
          locked={standardLocked}
          accent={PROFIT}
          icon={<Sparkles className="h-4 w-4" />}
          features={[
            'Brushed plastic finish',
            'TradeDash branding · contactless',
            'Ships in 5–7 business days',
          ]}
        />

        <CardOption
          selected={selected === 'metal'}
          onClick={() => setSelected('metal')}
          title="Metal"
          subtitle="Brushed stainless steel"
          price={`$${METAL_FEE}`}
          accent={GOLD}
          icon={<Crown className="h-4 w-4" />}
          features={[
            '22g brushed stainless steel',
            'Laser-etched name and PAN',
            'Ships in 5–7 business days',
          ]}
        />
      </div>

      {standardLocked && selected === 'standard' && (
        <div
          className="rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: `${GOLD}40`, backgroundColor: `${GOLD}0a`, color: 'var(--foreground)' }}
        >
          The standard physical card is a Gold-tier perk.{" "}
          <Link
            href="/gold"
            onClick={onClose}
            className="font-bold underline-offset-2 hover:underline"
            style={{ color: GOLD }}
          >
            Upgrade to Gold
          </Link>
          {" "}to claim it free, or pick the metal card instead.
        </div>
      )}

      {selected === 'metal' && !metalAffordable && (
        <p className="text-xs font-medium text-rose-500">
          You need ${METAL_FEE.toFixed(2)} in cash to order the metal card. You have ${cashBalance.toFixed(2)}.
        </p>
      )}

      {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

      <ModalFooter align="stretch">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={!canOrder || submitting}
          className="font-bold"
          style={canOrder
            ? { backgroundColor: selected === 'metal' ? GOLD : PROFIT, color: '#000' }
            : undefined}
        >
          {submitting
            ? 'Placing order…'
            : selected === 'metal'
              ? `Charge $${METAL_FEE} · Order metal`
              : 'Order standard card'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function CardOption({
  selected, onClick, disabled, locked,
  title, subtitle, price, accent, icon, features,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  locked?: boolean;
  title: string;
  subtitle: string;
  price: string | null;
  accent: string;
  icon: React.ReactNode;
  features: string[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !locked}
      className={`w-full text-left rounded-lg border p-4 transition-all flex flex-col gap-3 ${
        selected
          ? 'shadow-sm'
          : 'border-border/50 hover:border-border hover:bg-foreground/[0.02]'
      } ${locked ? 'opacity-90' : ''}`}
      style={selected
        ? { borderColor: `${accent}80`, backgroundColor: `${accent}0a` }
        : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {price !== null && (
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full shrink-0"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            {price}
          </span>
        )}
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {features.map(f => (
          <li key={f} className="flex items-center gap-1.5">
            <Check className="h-3 w-3 shrink-0" style={{ color: accent }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
