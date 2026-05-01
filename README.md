# TradeDash

A virtual stock-trading platform — paper-trade with live market data, hold a virtual debit card backed by your cash balance, set price alerts, and run a full Robinhood-style portfolio without risking a dollar.

Built as a portfolio piece. Every feature is end-to-end functional: signup → onboarding → linked banks → deposits → trades → P&L analytics → notifications → physical card upgrades — all backed by a real Postgres schema, not mocks.

---

## Highlights

**Trading**
- Live quotes from Finnhub, polled server-side every 15s with edge caching
- Yahoo Finance bar history for the chart (1D / 1W / 1M / 3M / YTD / 1Y / ALL)
- Per-stock detail page with About, Key statistics, News, and price-alerts panel
- Buy / sell with idempotent server actions (UUID client_id keys protect against double-fire)
- Watchlist with debounced symbol search, ⌘K shortcut, and right-click context menus

**Wallet**
- Linked external bank accounts (last-4 only persisted) — sources for deposits, destinations for withdrawals
- Daily $1,000 transfer cap, enforced client- and server-side
- Virtual Luhn-valid debit card with PIN, daily limit, freeze/unfreeze, and report-lost/stolen flow that atomically reissues
- Physical card upgrade: free standard plastic for Gold members, $149 brushed-stainless metal card for anyone

**Gold membership** ($5/mo or $50/yr, paid from your virtual cash balance)
- Gold-tinted debit card, profile badge, priority-support modal
- 5% APY on cash — pro-rated daily and credited via a self-throttling RPC
- 1% deposit match credited as a separate `DEPOSIT` transaction
- Unlimited watchlist (free tier caps at 10)
- Advanced P&L analytics: avg-cost ledger walked over BUY/SELL transactions for realized vs unrealized splits
- Smart price alerts: client-side WS watcher, server-side trigger RPC, notifications routed through the same bell as everything else
- Custom accent color: lime, blue, pink, yellow, orange, red, purple, OLED (deep black + white), and an animated RGB rainbow

**Auth + Onboarding**
- 6-step signup: account → personal → investor profile → bank (optional) → deposit (optional) → card (optional)
- Each onboarding step is skippable; the home page checklist tracks anything skipped
- Phone verification with mock OTP (any 6 digits) for SMS notifications
- Email/password auth via Supabase, with proper signup-redirect proxy

**Notifications**
- Per-category preferences: Trades · Transfers · Card · Gold · Security · Alerts · Product
- Three channels: in-app (live), email + SMS (UI-ready, awaiting external provider)
- Postgres trigger on `transactions` insert auto-creates notification rows for every BUY/SELL/DEPOSIT/WITHDRAW/CARD_SPEND/MEMBERSHIP
- Bell icon in every page header with unread count, realtime updates, and mark-all-read

**UI polish**
- Light / dark / system theme picker with FOUC-prevention bootstrap script
- Enterprise-grade Modal primitive: focus trap, mobile bottom sheet, stack-aware Escape, busy-state lock
- Animated number tweens on every dollar figure
- Live pulsing dot on the chart's current-time marker; dotted future projection on the daily portfolio chart
- Session-band shading on stock charts (pre-market / regular / after-hours)

---

## Tech stack

- **Next.js 16** (App Router, Turbopack, Server Actions)
- **Supabase** — Postgres, Auth, RLS, Realtime, SECURITY DEFINER RPCs
- **Tailwind v4** with a `var(--brand)` accent system that flips theme colors via a single attribute on `<html>`
- **Recharts** for portfolio + stock charts
- **TypeScript** end-to-end
- **Sonner** for toasts, **Base UI** for the button primitive, **Lucide** for icons

Data sources:
- **Finnhub** — quotes, search, company profiles, key metrics, news (server-side proxy keeps the API key out of the client bundle)
- **Yahoo Finance** — intraday bar history via `/api/history` proxy

---

## Local setup

```bash
# 1. Clone + install
git clone https://github.com/<your-username>/tradedash.git
cd tradedash
npm install

# 2. Wire up Supabase
npx supabase link --project-ref <your-supabase-project-ref>
npm run db:push     # applies all migrations in supabase/migrations/

# 3. Environment variables
cp .env.local.example .env.local   # then fill in:
# NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# FINNHUB_API_KEY=<get one free at finnhub.io>

# 4. Dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up.

### Useful scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server with Turbopack |
| `npm run build` | Production build |
| `npm run db:push` | Apply unapplied migrations to your linked Supabase project |
| `npm run db:diff` | Diff your local schema against the remote |
| `npm run db:reset` | Reset the linked database (⚠ destructive) |

---

## Deployment

Deployed on **Vercel**. The repo's root directory *is* the Next.js app, so importing the repo into Vercel works out of the box.

Required environment variables on the host:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `FINNHUB_API_KEY` *(server-only, no `NEXT_PUBLIC_` prefix)*

After deploying, in your Supabase project add the production URL to **Authentication → URL Configuration → Site URL** and **Redirect URLs**, otherwise email-confirmation links will bounce to localhost.

---

## Architecture notes

**Idempotency.** Every mutating server action accepts an optional `clientId` (UUID generated on the browser at modal-open time) which the corresponding RPC checks against `transactions.client_id`. A double-fired submit becomes a no-op that returns the current balance.

**RLS lockdown.** No table has open insert/update/delete policies. All cash-touching writes go through SECURITY DEFINER RPCs, so even a forged JWT can't manipulate the cash column directly.

**Money correctness.** Cash balance is `numeric(14,2) check (cash_balance >= 0)` with the constraint enforced at the database level. The `BUY` RPC's update is `where cash_balance >= cost` so a race between two tabs can't overspend.

**Theme system.** A `@property --brand` declaration registers the brand variable as a typed color; one `data-theme-color="..."` attribute on `<html>` flips it for the whole app. The OLED preset additionally repaints background/foreground, and the rainbow preset uses `@keyframes` to interpolate `--brand` through hues.

**Notifications.** Rather than emit notifications from each individual server action, an `AFTER INSERT` trigger on `public.transactions` produces a notification row keyed off the transaction type. Adding new notification-worthy events is a one-line update to the trigger, not a sweep across every RPC.

---

## Schema

Migrations live in `supabase/migrations/` and are applied in order via `npm run db:push`:

```
20260429000000_init.sql                 — profiles, positions, transactions, RLS, deposit/withdraw/buy/sell RPCs
20260429000001_watchlist_realtime.sql   — watchlist table + realtime publication
20260429000002_backfill_profiles.sql    — profile backfill for early users
20260429000003_idempotency_and_lockdown — client_id dedup, profile RLS lockdown
20260429000004_cards.sql                — virtual debit cards
20260429000005_card_spend.sql           — CARD_SPEND transactions
20260429000006_update_profile.sql       — first/last name updates
20260429000007_profile_names_and_delete — DOB, country, account deletion
20260429000008_gold_membership.sql      — memberships table + subscribe RPC
20260429000009_card_daily_limit.sql     — daily card cap
20260429000010_terminate_membership.sql — end-membership-now RPC
20260429000011_card_pin.sql             — bcrypt-hashed PINs
20260429000012_external_accounts.sql    — linked banks + transfer audit
20260430000000_onboarding.sql           — investor profile fields
20260430000001_physical_card.sql        — standard / metal card upgrade
20260430000002_gold_benefits.sql        — APY, deposit match, watchlist cap
20260430000003_notifications.sql        — notifications + trigger + prefs
20260430000004_themes_and_phone.sql     — theme + phone verification
20260430000005_theme_color.sql          — Gold accent color
20260430000006_rainbow_theme.sql        — RGB rainbow option
20260430000007_price_alerts.sql         — smart price alerts
```

---

## Disclaimer

TradeDash is a virtual environment. **No real money moves.** No real positions are taken. Cash balances, card numbers, and trades exist only inside the database. Built for portfolio + learning purposes.
