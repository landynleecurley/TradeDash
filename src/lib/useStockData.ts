import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { accrueGoldInterest, triggerPriceAlert } from '@/lib/actions';
import type { Tx } from '@/lib/portfolio-series';

export type HistoryPoint = { time: string; price: number; t: number };

export type CardInfo = {
  id: string;
  cardNumber: string;
  cardholderName: string | null;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  status: 'active' | 'frozen' | 'cancelled';
  dailyLimit: number | null;
  hasPin: boolean;
  cardType: 'virtual' | 'standard' | 'metal';
  orderedAt: string | null;
  shippedAt: string | null;
};

export type MembershipInfo = {
  status: 'active' | 'inactive';
  plan: 'monthly' | 'annual' | null;
  startedAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
  totalPaid: number;
};

export type ExternalAccount = {
  id: string;
  nickname: string;
  institution: string | null;
  accountKind: 'checking' | 'savings';
  last4: string;
  routingLast4: string | null;
  isDefault: boolean;
  createdAt: string;
};

export type NotificationCategory = 'trade' | 'transfer' | 'card' | 'gold' | 'security' | 'alert' | 'product';
export type NotificationChannel = 'inApp' | 'email' | 'sms';
export type NotificationPrefs = Record<NotificationCategory, Record<NotificationChannel, boolean>>;

export type AppNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type PriceAlert = {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  threshold: number;
  createdAt: string;
  triggeredAt: string | null;
  triggeredPrice: number | null;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  trade:    { inApp: true,  email: false, sms: false },
  transfer: { inApp: true,  email: false, sms: false },
  card:     { inApp: true,  email: false, sms: false },
  gold:     { inApp: true,  email: false, sms: false },
  security: { inApp: true,  email: true,  sms: false },
  alert:    { inApp: true,  email: false, sms: false },
  product:  { inApp: false, email: false, sms: false },
};

export type StockInfo = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  shares: number;
  avgCost: number;
  costBasisTotal: number;
  acquired: string | null;
  sessionOpen: number;
  previousClose: number;
  history: HistoryPoint[];
};

const HISTORY_LIMIT = 120;
// How often we poll /api/quote per watched symbol. The server route caches
// upstream Finnhub responses for 10s, so multiple users on the same Vercel
// instance share a single upstream call inside that window.
const QUOTE_POLL_MS = 15_000;

const generateMockHistory = (basePrice: number): HistoryPoint[] => {
  const history: HistoryPoint[] = [];
  let currentPrice = basePrice * 0.98;
  const now = new Date();
  for (let i = 60; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 5000);
    history.push({
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      price: Number(currentPrice.toFixed(2)),
      t: Math.floor(time.getTime() / 1000),
    });
    currentPrice = currentPrice * (1 + (Math.random() - 0.45) * 0.005);
  }
  return history;
};

type QuoteResponse = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  previousClose: number | null;
  t: number | null;
};

type WatchlistRow = { symbol: string; name: string | null };
type PortfolioRow = {
  symbol: string;
  name: string | null;
  shares: number | string;
  cost_basis_total: number | string;
  acquired: string | null;
};

const emptyStock = (symbol: string, name: string): StockInfo => ({
  symbol,
  name,
  price: 0,
  change: 0,
  changePercent: 0,
  shares: 0,
  avgCost: 0,
  costBasisTotal: 0,
  acquired: null,
  sessionOpen: 0,
  previousClose: 0,
  history: [],
});

export function useStockData() {
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [externalAccounts, setExternalAccounts] = useState<ExternalAccount[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [themeColor, setThemeColor] = useState<'lime' | 'blue' | 'pink' | 'yellow' | 'orange' | 'red' | 'purple' | 'oled' | 'rainbow'>('lime');
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  // Tracks alerts we've already attempted to trigger this session so we
  // don't fire trigger_price_alert in a tight loop while the realtime
  // subscription catches up. Cleared whenever an alert is removed/reset.
  const triggeredLocally = useRef<Set<string>>(new Set());
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [usingMock, setUsingMock] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Pull current user's profile (cash) + positions + watchlist and merge into stocks.
  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsReady(true);
      return;
    }
    setUserId(user.id);
    setEmail(user.email ?? null);
    setAccountCreatedAt(user.created_at ?? null);

    const [profileRes, positionsRes, watchlistRes, transactionsRes, cardRes, membershipRes, externalAccountsRes, notificationsRes, priceAlertsRes] = await Promise.all([
      supabase.from('profiles').select('cash_balance, first_name, last_name, notification_prefs, theme, theme_color, phone, phone_verified_at').eq('id', user.id).single(),
      supabase.from('positions').select('symbol, name, shares, cost_basis_total, acquired').eq('user_id', user.id),
      supabase.from('watchlist').select('symbol, name').eq('user_id', user.id).order('added_at', { ascending: true }),
      supabase.from('transactions').select('id, type, symbol, shares, amount, created_at').order('created_at', { ascending: true }),
      supabase.from('cards').select('id, card_number, cardholder_name, expiry_month, expiry_year, cvv, status, daily_limit, has_pin, card_type, ordered_at, shipped_at').neq('status', 'cancelled').limit(1).maybeSingle(),
      supabase.from('memberships').select('status, plan, started_at, expires_at, cancelled_at, total_paid').eq('user_id', user.id).maybeSingle(),
      supabase.from('external_accounts').select('id, nickname, institution, account_kind, last4, routing_last4, is_default, created_at').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('notifications').select('id, category, title, body, link, read_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('price_alerts').select('id, symbol, direction, threshold, created_at, triggered_at, triggered_price').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    if (profileRes.data) {
      setCashBalance(Number(profileRes.data.cash_balance) || 0);
      setFirstName(profileRes.data.first_name ?? null);
      setLastName(profileRes.data.last_name ?? null);
      // Defensive merge — if a category is missing from the persisted JSON
      // (e.g., we add a new category later), fall back to defaults.
      const persisted = (profileRes.data.notification_prefs ?? {}) as Partial<NotificationPrefs>;
      const merged: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
      for (const k of Object.keys(merged) as NotificationCategory[]) {
        if (persisted[k]) {
          merged[k] = { ...merged[k], ...persisted[k] };
        }
      }
      setNotificationPrefs(merged);
      setTheme((profileRes.data.theme ?? 'system') as 'light' | 'dark' | 'system');
      setThemeColor((profileRes.data.theme_color ?? 'lime') as 'lime' | 'blue' | 'pink' | 'yellow' | 'orange' | 'red' | 'purple' | 'oled' | 'rainbow');
      setPhone(profileRes.data.phone ?? null);
      setPhoneVerifiedAt(profileRes.data.phone_verified_at ?? null);
    }

    const txData = transactionsRes.data ?? [];
    const txs: Tx[] = txData.map((d) => ({
      id: d.id,
      type: d.type as Tx['type'],
      symbol: d.symbol,
      shares: d.shares !== null ? Number(d.shares) : null,
      amount: Number(d.amount),
      t: Math.floor(new Date(d.created_at).getTime() / 1000),
    }));
    setTransactions(txs);

    if (cardRes.data) {
      setCard({
        id: cardRes.data.id,
        cardNumber: cardRes.data.card_number,
        cardholderName: cardRes.data.cardholder_name,
        expiryMonth: cardRes.data.expiry_month,
        expiryYear: cardRes.data.expiry_year,
        cvv: cardRes.data.cvv,
        status: cardRes.data.status,
        dailyLimit: cardRes.data.daily_limit !== null ? Number(cardRes.data.daily_limit) : null,
        hasPin: !!cardRes.data.has_pin,
        cardType: cardRes.data.card_type ?? 'virtual',
        orderedAt: cardRes.data.ordered_at ?? null,
        shippedAt: cardRes.data.shipped_at ?? null,
      });
    } else {
      setCard(null);
    }

    if (membershipRes.data) {
      setMembership({
        status: membershipRes.data.status,
        plan: membershipRes.data.plan,
        startedAt: membershipRes.data.started_at,
        expiresAt: membershipRes.data.expires_at,
        cancelledAt: membershipRes.data.cancelled_at,
        totalPaid: Number(membershipRes.data.total_paid) || 0,
      });
    } else {
      setMembership(null);
    }

    setExternalAccounts((externalAccountsRes.data ?? []).map(row => ({
      id: row.id,
      nickname: row.nickname,
      institution: row.institution,
      accountKind: row.account_kind,
      last4: row.last4,
      routingLast4: row.routing_last4,
      isDefault: !!row.is_default,
      createdAt: row.created_at,
    })));

    setNotifications((notificationsRes.data ?? []).map(row => ({
      id: row.id,
      category: row.category,
      title: row.title,
      body: row.body,
      link: row.link,
      readAt: row.read_at,
      createdAt: row.created_at,
    })));

    setPriceAlerts((priceAlertsRes.data ?? []).map(row => ({
      id: row.id,
      symbol: row.symbol,
      direction: row.direction,
      threshold: Number(row.threshold),
      createdAt: row.created_at,
      triggeredAt: row.triggered_at,
      triggeredPrice: row.triggered_price !== null ? Number(row.triggered_price) : null,
    })));

    const positions = (positionsRes.data ?? []) as PortfolioRow[];
    const watchlist = (watchlistRes.data ?? []) as WatchlistRow[];
    const positionBySymbol = new Map(positions.map(p => [p.symbol, p]));

    const nextSymbols = watchlist.map(w => w.symbol);
    setSymbols(prev =>
      prev.length === nextSymbols.length && prev.every((s, i) => s === nextSymbols[i])
        ? prev
        : nextSymbols,
    );

    setStocks(prev => {
      const prevBySymbol = new Map(prev.map(s => [s.symbol, s]));
      return watchlist.map(w => {
        const market = prevBySymbol.get(w.symbol) ?? emptyStock(w.symbol, w.name ?? w.symbol);
        const pos = positionBySymbol.get(w.symbol);
        const shares = pos ? Number(pos.shares) : 0;
        const cost = pos ? Number(pos.cost_basis_total) : 0;
        return {
          ...market,
          name: w.name ?? market.name,
          shares,
          costBasisTotal: cost,
          avgCost: shares > 0 ? cost / shares : 0,
          acquired: pos?.acquired ?? null,
        };
      });
    });

    setIsReady(true);
  }, []);

  // Mount: load user data and subscribe to realtime changes for cross-device sync.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Gold benefit: smart price alerts. On every stocks update, scan active
  // alerts and fire trigger_price_alert when a threshold has been crossed.
  // The RPC re-checks the threshold server-side (so a stale price never
  // false-fires) and atomically flips triggered_at — a local Set acts as a
  // best-effort de-dup so we don't slam the RPC on every micro-tick while
  // realtime catches up.
  useEffect(() => {
    if (priceAlerts.length === 0) return;
    const active = priceAlerts.filter(a => !a.triggeredAt);
    if (active.length === 0) return;
    const stockBySymbol = new Map(stocks.map(s => [s.symbol, s]));
    for (const alert of active) {
      if (triggeredLocally.current.has(alert.id)) continue;
      const stock = stockBySymbol.get(alert.symbol);
      if (!stock || !(stock.price > 0)) continue;
      const crossed =
        (alert.direction === 'above' && stock.price >= alert.threshold) ||
        (alert.direction === 'below' && stock.price <= alert.threshold);
      if (!crossed) continue;
      triggeredLocally.current.add(alert.id);
      void triggerPriceAlert(alert.id, stock.price).catch(() => {
        // RPC failure is fine — realtime + next refresh will reconcile.
        triggeredLocally.current.delete(alert.id);
      });
    }
    // Drop ids whose alerts no longer exist (deleted) so the set doesn't grow forever.
    const liveIds = new Set(priceAlerts.map(a => a.id));
    for (const id of triggeredLocally.current) {
      if (!liveIds.has(id)) triggeredLocally.current.delete(id);
    }
  }, [stocks, priceAlerts]);

  // Gold benefit: pro-rate 5% APY on cash. The RPC self-throttles to a $0.01
  // minimum so calling it on every refresh + every 5 minutes is idempotent.
  // When it does credit, the realtime subscription on profiles+transactions
  // wakes refresh again and the new balance flows through.
  useEffect(() => {
    if (!userId) return;
    const tick = () => {
      accrueGoldInterest().catch(() => {
        // Silent — we don't want to block app on a benefit RPC failure.
      });
    };
    tick();
    const id = setInterval(tick, 5 * 60_000);
    return () => clearInterval(id);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`user-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_accounts', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_alerts', filter: `user_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [userId, refresh]);

  // Whenever the watchlist changes, restart the market-data feeds for the new symbol set.
  useEffect(() => {
    if (symbols.length === 0) {
      setIsLive(false);
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let mockTimer: ReturnType<typeof setInterval> | null = null;

    // Bootstrap intraday history once per symbol — feeds the chart and
    // sidebar sparklines. /api/history already proxies Yahoo server-side.
    (async () => {
      await Promise.all(symbols.map(async (symbol) => {
        try {
          const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=1d&interval=5m`);
          if (!res.ok) return;
          const data: { points?: { t: number; price: number }[] } = await res.json();
          if (cancelled || !data.points || data.points.length === 0) return;
          const history: HistoryPoint[] = data.points.map(p => ({
            time: new Date(p.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            price: p.price,
            t: p.t,
          }));
          setStocks(prev => prev.map(s => s.symbol === symbol ? { ...s, history } : s));
        } catch (err) {
          console.error('Intraday history error', symbol, err);
        }
      }));
    })();

    // Pull a single round of quotes from the server-side proxy. Returns
    // true when at least one symbol came back live, so the caller can
    // decide whether to keep polling vs. fall through to the mock generator.
    const pollQuotes = async (): Promise<boolean> => {
      const responses = await Promise.allSettled(
        symbols.map(s =>
          fetch(`/api/quote?symbol=${encodeURIComponent(s)}`).then(r => {
            if (!r.ok) throw new Error(`quote ${r.status}`);
            return r.json() as Promise<QuoteResponse>;
          }),
        ),
      );
      if (cancelled) return false;
      let anyLive = false;
      setStocks(prev => prev.map(stock => {
        const idx = symbols.indexOf(stock.symbol);
        if (idx < 0) return stock;
        const result = responses[idx];
        if (result.status !== 'fulfilled' || result.value.price == null) return stock;
        anyLive = true;
        const q = result.value;
        const price = q.price!;
        const previousClose = q.previousClose && q.previousClose > 0 ? q.previousClose : price;
        const sessionOpen = q.open && q.open > 0 ? q.open : previousClose;
        const change = q.change ?? price - previousClose;
        const changePercent = q.changePercent ?? (previousClose === 0 ? 0 : (change / previousClose) * 100);
        const now = new Date();
        // Append to history if the price actually moved — keeps sparklines
        // ticking without polluting the buffer with dupes.
        const lastHistoryPrice = stock.history[stock.history.length - 1]?.price;
        const history = lastHistoryPrice !== price
          ? [...stock.history, {
              time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              price,
              t: Math.floor(now.getTime() / 1000),
            }].slice(-HISTORY_LIMIT)
          : stock.history;
        return { ...stock, price, sessionOpen, previousClose, change, changePercent, history };
      }));
      return anyLive;
    };

    (async () => {
      const live = await pollQuotes();
      if (cancelled) return;
      setIsLive(live);
      if (live) {
        setUsingMock(false);
        pollTimer = setInterval(() => { void pollQuotes(); }, QUOTE_POLL_MS);
      } else {
        // No upstream quotes available (no FINNHUB_API_KEY on the server,
        // or the proxy returned nothing). Fall through to the mock loop
        // below so the demo still moves.
        setUsingMock(true);
        startMock();
      }
    })();

    function startMock() {
      // Mock fallback.
      setStocks(prev => prev.map(s => {
        const base = s.price > 0 ? s.price : 100;
        const history = generateMockHistory(base);
        const sessionOpen = history[0].price;
        const price = history[history.length - 1].price;
        const change = Number((price - sessionOpen).toFixed(2));
        const changePercent = Number(((change / sessionOpen) * 100).toFixed(2));
        return { ...s, price, change, changePercent, sessionOpen, previousClose: sessionOpen, history };
      }));
      setIsLive(false);

      mockTimer = setInterval(() => {
        setStocks(prev => prev.map(stock => {
          if (Math.random() > 0.3) return stock;
          const volatility = 0.002;
          const ratio = 1 + (Math.random() - 0.48) * volatility;
          const newPrice = Number((stock.price * ratio).toFixed(2));
          const now = new Date();
          const newHistory = stock.history.length > 0
            ? [...stock.history.slice(1), {
                time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                price: newPrice,
                t: Math.floor(now.getTime() / 1000),
              }]
            : stock.history;
          return {
            ...stock,
            price: newPrice,
            history: newHistory,
            change: Number((newPrice - stock.sessionOpen).toFixed(2)),
            changePercent: stock.sessionOpen > 0 ? Number(((newPrice - stock.sessionOpen) / stock.sessionOpen * 100).toFixed(2)) : 0,
          };
        }));
      }, 1000);
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (mockTimer) clearInterval(mockTimer);
    };
  }, [symbols]);

  const totalPortfolioValue = stocks.reduce((acc, s) => acc + s.price * s.shares, 0);
  const totalCostBasis = stocks.reduce((acc, s) => acc + s.costBasisTotal, 0);
  const totalGain = totalPortfolioValue - totalCostBasis;
  const totalGainPercent = totalCostBasis === 0 ? 0 : (totalGain / totalCostBasis) * 100;

  // Today's P&L is per-position math against the right "starting basis":
  //   - Shares held BEFORE today: basis = shares × previousClose (yesterday's close)
  //   - Shares bought TODAY: basis = actual purchase cost
  //   - Shares sold TODAY: subtracts proceeds from basis
  //
  // dayPnL = currentValue − todayBasis. For a position opened today at current
  // price, this correctly returns $0, not the stock's day decline × shares.
  const dayPnLBySymbol = useMemo<Record<string, { dollar: number; basis: number }>>(() => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const todayET = fmt.format(new Date());
    const out: Record<string, { dollar: number; basis: number }> = {};
    for (const s of stocks) {
      let sharesOpen = 0;          // shares at start of today
      let sharesBoughtToday = 0;
      let sharesSoldToday = 0;
      let costBoughtToday = 0;
      let proceedsSoldToday = 0;
      for (const tx of transactions) {
        if (tx.symbol !== s.symbol || tx.shares === null) continue;
        const txET = fmt.format(new Date(tx.t * 1000));
        if (txET < todayET) {
          if (tx.type === 'BUY') sharesOpen += tx.shares;
          else if (tx.type === 'SELL') sharesOpen -= tx.shares;
        } else if (txET === todayET) {
          if (tx.type === 'BUY') {
            sharesBoughtToday += tx.shares;
            costBoughtToday += tx.amount;
          } else if (tx.type === 'SELL') {
            sharesSoldToday += tx.shares;
            proceedsSoldToday += tx.amount;
          }
        }
      }
      const netShares = sharesOpen + sharesBoughtToday - sharesSoldToday;
      const currentValue = netShares * s.price;
      const todayBasis = sharesOpen * s.previousClose + costBoughtToday - proceedsSoldToday;
      out[s.symbol] = { dollar: currentValue - todayBasis, basis: todayBasis };
    }
    return out;
  }, [stocks, transactions]);

  const dayChange = Object.values(dayPnLBySymbol).reduce((acc, v) => acc + v.dollar, 0);
  const dayBasis = Object.values(dayPnLBySymbol).reduce((acc, v) => acc + v.basis, 0);
  const dayChangePercent = dayBasis === 0 ? 0 : (dayChange / dayBasis) * 100;

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || null;
  // Membership is "really" active only while inside its paid window. The DB
  // status flag persists past expiry until the next subscribe; the app gates
  // benefits on this computed value.
  const isGoldActive = !!(
    membership &&
    membership.status === 'active' &&
    membership.expiresAt &&
    new Date(membership.expiresAt).getTime() > Date.now()
  );

  return {
    stocks,
    transactions,
    card,
    membership,
    externalAccounts,
    notifications,
    notificationPrefs,
    theme,
    themeColor,
    phone,
    phoneVerifiedAt,
    priceAlerts,
    isGoldActive,
    firstName,
    lastName,
    displayName,
    email,
    accountCreatedAt,
    userId,
    isLive,
    isReady,
    usingMockData: usingMock,
    totalPortfolioValue,
    totalCostBasis,
    totalGain,
    totalGainPercent,
    dayChange,
    dayChangePercent,
    dayPnLBySymbol,
    cashBalance,
    totalWealth: totalPortfolioValue + cashBalance,
    refresh,
  };
}
