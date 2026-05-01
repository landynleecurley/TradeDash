"use server";

import { createClient } from "@/lib/supabase-server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// Generate a Luhn-valid 16-digit card number on a virtual BIN. This is a
// purely-internal "card" — there's no payment network behind it.
function luhnCheckDigit(digits15: string): string {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(digits15[14 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

function generateCardNumber(): string {
  // 9999 BIN signals "virtual" — far outside real Visa/Mastercard ranges.
  const bin = '9999';
  let body = '';
  for (let i = 0; i < 11; i++) body += String(Math.floor(Math.random() * 10));
  const first15 = bin + body;
  return first15 + luhnCheckDigit(first15);
}

function generateCvv(): string {
  return String(Math.floor(100 + Math.random() * 900));
}

export async function deposit(args: {
  amount: number;
  externalAccountId: string;
  clientId?: string;
}): Promise<Result<{ cashBalance: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deposit", {
    p_amount: args.amount,
    p_client_id: args.clientId ?? null,
    p_external_account_id: args.externalAccountId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { cashBalance: Number(data) } };
}

export async function withdraw(args: {
  amount: number;
  externalAccountId: string;
  clientId?: string;
}): Promise<Result<{ cashBalance: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("withdraw", {
    p_amount: args.amount,
    p_client_id: args.clientId ?? null,
    p_external_account_id: args.externalAccountId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { cashBalance: Number(data) } };
}

export type ExternalAccountInput = {
  nickname: string;
  institution?: string | null;
  accountKind: 'checking' | 'savings';
  last4: string;
  routingLast4?: string | null;
};

export async function linkExternalAccount(args: ExternalAccountInput): Promise<Result<{ id: string }>> {
  if (!/^\d{4}$/.test(args.last4)) return { ok: false, error: 'Last 4 digits must be numeric' };
  if (args.routingLast4 && !/^\d{4}$/.test(args.routingLast4)) {
    return { ok: false, error: 'Routing last 4 must be numeric' };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('link_external_account', {
    p_nickname: args.nickname.trim(),
    p_institution: args.institution?.trim() ?? null,
    p_account_kind: args.accountKind,
    p_last4: args.last4,
    p_routing_last4: args.routingLast4 ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function unlinkExternalAccount(id: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('unlink_external_account', { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function setDefaultExternalAccount(id: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_default_external_account', { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function buyStock(args: {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  clientId?: string;
}): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("buy_stock", {
    p_symbol: args.symbol,
    p_name: args.name,
    p_shares: args.shares,
    p_price: args.price,
    p_client_id: args.clientId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function sellStock(args: {
  symbol: string;
  shares: number;
  price: number;
  clientId?: string;
}): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sell_stock", {
    p_symbol: args.symbol,
    p_shares: args.shares,
    p_price: args.price,
    p_client_id: args.clientId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function addWatchlist(args: { symbol: string; name?: string }): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_watchlist", {
    p_symbol: args.symbol.toUpperCase().trim(),
    p_name: args.name ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function removeWatchlist(args: { symbol: string }): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_watchlist", {
    p_symbol: args.symbol,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// The cardholder name is the user's legal name from their profile — the
// account holder cannot edit it directly. Returns the canonical "FIRST LAST"
// string, or null if either field is missing.
async function readCardholderNameFromProfile(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single();
  if (!data) return null;
  const first = (data.first_name ?? '').trim();
  const last = (data.last_name ?? '').trim();
  if (!first || !last) return null;
  return `${first} ${last}`.toUpperCase();
}

export async function issueCard(): Promise<Result<null>> {
  const name = await readCardholderNameFromProfile();
  if (!name) return { ok: false, error: 'Add your first and last name in Settings before issuing a card.' };
  const supabase = await createClient();
  const now = new Date();
  const { error } = await supabase.rpc('create_card', {
    p_card_number: generateCardNumber(),
    p_cardholder_name: name,
    p_expiry_month: now.getMonth() + 1,
    p_expiry_year: now.getFullYear() + 5,
    p_cvv: generateCvv(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// Card status is restricted to active/frozen for users — cancellation is only
// reachable through the report-card flow, which always reissues atomically.
export async function setCardStatus(status: 'active' | 'frozen'): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_card_status', { p_status: status });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export type CardReportReason = 'lost' | 'stolen' | 'compromised';

// Mark the current card cancelled and issue a fresh one (new number, CVV,
// expiry) under the same legal name from the user's profile. The server
// rejects an "issue" with no profile name, so we mirror that guard here
// before touching the existing card to avoid leaving the user card-less.
export async function reportCardAndReplace(reason: CardReportReason): Promise<Result<null>> {
  if (reason !== 'lost' && reason !== 'stolen' && reason !== 'compromised') {
    return { ok: false, error: 'invalid reason' };
  }
  const name = await readCardholderNameFromProfile();
  if (!name) {
    return { ok: false, error: 'Add your first and last name in Settings before reporting your card.' };
  }
  const supabase = await createClient();
  const { error: cancelErr } = await supabase.rpc('set_card_status', { p_status: 'cancelled' });
  if (cancelErr) return { ok: false, error: cancelErr.message };

  const now = new Date();
  const { error: createErr } = await supabase.rpc('create_card', {
    p_card_number: generateCardNumber(),
    p_cardholder_name: name,
    p_expiry_month: now.getMonth() + 1,
    p_expiry_year: now.getFullYear() + 5,
    p_cvv: generateCvv(),
  });
  if (createErr) return { ok: false, error: createErr.message };
  return { ok: true, data: null };
}

export async function updateCardLimit(limit: number | null): Promise<Result<null>> {
  if (limit !== null && limit < 0) return { ok: false, error: 'limit must be positive' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_card_limit', { p_limit: limit });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function setCardPin(pin: string): Promise<Result<null>> {
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be 4 digits' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_card_pin', { p_pin: pin });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function clearCardPin(): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('clear_card_pin');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export type PhysicalCardType = 'standard' | 'metal';

// Order a physical version of the active card. 'standard' is free for Gold
// members; 'metal' charges a flat $149 from the user's cash balance.
export async function orderPhysicalCard(cardType: PhysicalCardType): Promise<Result<null>> {
  if (cardType !== 'standard' && cardType !== 'metal') {
    return { ok: false, error: 'invalid card type' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('order_physical_card', { p_card_type: cardType });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function cardSpend(args: {
  amount: number;
  merchant: string;
  pin?: string;
  clientId?: string;
}): Promise<Result<{ cashBalance: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('card_spend', {
    p_amount: args.amount,
    p_merchant: args.merchant,
    p_pin: args.pin ?? null,
    p_client_id: args.clientId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { cashBalance: Number(data) } };
}

export async function updateProfile(args: { firstName: string | null; lastName: string | null }): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_profile', {
    p_first_name: args.firstName,
    p_last_name: args.lastName,
  });
  if (error) return { ok: false, error: error.message };

  // Card name is derived from profile, not user-editable. Mirror the change
  // onto the active card so the printed name stays in lock-step. Best-effort:
  // a missing card or full name silently no-ops, since the profile update has
  // already succeeded.
  const first = (args.firstName ?? '').trim();
  const last = (args.lastName ?? '').trim();
  if (first && last) {
    await supabase.rpc('update_card_name', { p_name: `${first} ${last}`.toUpperCase() });
  }
  return { ok: true, data: null };
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert';
export type AnnualIncome = '<50k' | '50-100k' | '100-250k' | '250k-1m' | '1m+';
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive';

export async function completeOnboarding(args: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
  experienceLevel: ExperienceLevel;
  annualIncome: AnnualIncome;
  riskTolerance: RiskTolerance;
}): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_onboarding', {
    p_first_name: args.firstName,
    p_last_name: args.lastName,
    p_date_of_birth: args.dateOfBirth,
    p_country: args.country,
    p_experience_level: args.experienceLevel,
    p_annual_income: args.annualIncome,
    p_risk_tolerance: args.riskTolerance,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function deleteAccount(): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, error: error.message };
  // The auth row is gone — the cookie session is now invalid.
  await supabase.auth.signOut();
  return { ok: true, data: null };
}

export async function subscribeMembership(args: {
  plan: 'monthly' | 'annual';
  clientId?: string;
}): Promise<Result<{ cashBalance: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('subscribe_membership', {
    p_plan: args.plan,
    p_client_id: args.clientId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { cashBalance: Number(data) } };
}

export async function cancelMembership(): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_membership');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function terminateMembership(): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('terminate_membership');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// Gold-only: pro-rates 5% APY across the time since the last credit and
// adds it to cash. RPC is idempotent — it self-throttles to credits >=
// $0.01, so calling it on every hook refresh is safe.
export async function accrueGoldInterest(): Promise<Result<{ accrued: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('accrue_gold_interest');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { accrued: Number(data) || 0 } };
}

export type NotificationCategory = 'trade' | 'transfer' | 'card' | 'gold' | 'security' | 'alert' | 'product';
export type NotificationChannel = 'inApp' | 'email' | 'sms';
export type NotificationPrefs = Record<NotificationCategory, Record<NotificationChannel, boolean>>;

export async function updateNotificationPrefs(prefs: NotificationPrefs): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_notification_prefs', { p_prefs: prefs });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function markNotificationRead(id: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function markAllNotificationsRead(): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export type Theme = 'light' | 'dark' | 'system';

export async function updateTheme(theme: Theme): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_theme', { p_theme: theme });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export type ThemeColor = 'lime' | 'blue' | 'pink' | 'yellow' | 'orange' | 'red' | 'purple' | 'oled' | 'rainbow';

export async function updateThemeColor(color: ThemeColor): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_theme_color', { p_color: color });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function updatePhone(phone: string | null): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_phone', { p_phone: phone });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function verifyPhone(code: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('verify_phone', { p_code: code });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export type PriceAlertDirection = 'above' | 'below';

export async function createPriceAlert(args: {
  symbol: string;
  direction: PriceAlertDirection;
  threshold: number;
}): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_price_alert', {
    p_symbol: args.symbol,
    p_direction: args.direction,
    p_threshold: args.threshold,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: String(data) } };
}

export async function deletePriceAlert(id: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_price_alert', { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// Called by the client-side price watcher once a threshold crosses. The
// RPC is idempotent — it self-checks `triggered_at` so duplicate calls
// from rapid WS ticks or concurrent tabs are no-ops.
export async function triggerPriceAlert(id: string, price: number): Promise<Result<{ fired: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('trigger_price_alert', { p_id: id, p_price: price });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { fired: !!data } };
}
