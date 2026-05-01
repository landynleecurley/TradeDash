"use client";

const PROFIT = "var(--brand)";

export function getInitials(firstName: string | null, lastName: string | null, fallback: string | null): string {
  const f = firstName?.trim()?.[0]?.toUpperCase();
  const l = lastName?.trim()?.[0]?.toUpperCase();
  if (f && l) return f + l;
  if (f) return f;
  if (l) return l;
  // Fallback: first letter of email username, or "?"
  return fallback?.trim()?.[0]?.toUpperCase() ?? "?";
}

type Size = 'sm' | 'md' | 'lg';

const sizeClass: Record<Size, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-base',
  lg: 'h-20 w-20 text-2xl',
};

export function UserAvatar({
  firstName,
  lastName,
  fallback,
  size = 'md',
  className = '',
}: {
  firstName: string | null;
  lastName: string | null;
  fallback: string | null;
  size?: Size;
  className?: string;
}) {
  const initials = getInitials(firstName, lastName, fallback);
  return (
    <div
      className={`${sizeClass[size]} rounded-full flex items-center justify-center font-bold tracking-tight shrink-0 ${className}`}
      style={{
        background: `linear-gradient(135deg, var(--brand-40), var(--brand-20))`,
        color: PROFIT,
        border: `1px solid var(--brand-30)`,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
