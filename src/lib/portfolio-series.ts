// Replays the transaction log to compute (cash, shares-by-symbol) at any
// historical timestamp, then combines with price bars per symbol to produce
// a series of true portfolio values over time.

export type Tx = {
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'CARD_SPEND' | 'MEMBERSHIP';
  symbol: string | null;
  shares: number | null;
  amount: number;
  // Unix seconds.
  t: number;
  // Optional row id; not used by the series builder, just propagated through
  // for UI (transaction details modal etc.).
  id?: string;
};

export type SymbolBars = {
  symbol: string;
  // Each bar: [unix seconds, close price].
  bars: { t: number; price: number }[];
};

export type SeriesPoint = { t: number; value: number };

/**
 * Build a portfolio value series.
 *
 * For each unique bar timestamp across all symbols (sorted ascending), advances
 * a running (cash, shares-per-symbol) state by replaying any transactions whose
 * created_at <= bar.t, then computes value = cash + Σ(shares[symbol] × price).
 *
 * Symbols with no bar at a given timestamp use their last-seen price (forward
 * fill) so a less-liquid ticker doesn't drop out of the sum.
 */
export function buildPortfolioSeries(
  symbols: SymbolBars[],
  transactions: Tx[],
): SeriesPoint[] {
  const sortedTx = [...transactions].sort((a, b) => a.t - b.t);
  const allTimestamps = new Set<number>();
  let minBarT = Number.POSITIVE_INFINITY;
  let maxBarT = Number.NEGATIVE_INFINITY;
  for (const s of symbols) for (const b of s.bars) {
    allTimestamps.add(b.t);
    if (b.t < minBarT) minBarT = b.t;
    if (b.t > maxBarT) maxBarT = b.t;
  }
  // Add transaction timestamps that fall inside the bar range. This makes cash
  // flow events (deposits, withdrawals) and trades appear as discrete steps on
  // the chart even when they happen between price bars (e.g., after-hours).
  // Pre-window transactions still apply (they shape the starting state) but
  // don't contribute their own chart points.
  for (const tx of sortedTx) {
    if (tx.t > minBarT && tx.t <= maxBarT) allTimestamps.add(tx.t);
  }
  const timeline = [...allTimestamps].sort((a, b) => a - b);
  if (timeline.length === 0) return [];

  // Pre-build a per-symbol map<t, price> for O(1) lookup, plus a sorted list
  // of timestamps for forward-fill.
  const priceMap = new Map<string, Map<number, number>>();
  const sortedSymBars = new Map<string, { t: number; price: number }[]>();
  for (const s of symbols) {
    priceMap.set(s.symbol, new Map(s.bars.map(b => [b.t, b.price])));
    sortedSymBars.set(s.symbol, [...s.bars].sort((a, b) => a.t - b.t));
  }

  const lastPrice: Record<string, number> = {};
  const lastBarIdx: Record<string, number> = {};
  for (const s of symbols) lastBarIdx[s.symbol] = -1;

  let cash = 0;
  const shares: Record<string, number> = {};
  let txIdx = 0;
  const out: SeriesPoint[] = [];

  for (const t of timeline) {
    while (txIdx < sortedTx.length && sortedTx[txIdx].t <= t) {
      const tx = sortedTx[txIdx];
      switch (tx.type) {
        case 'DEPOSIT':
          cash += tx.amount;
          break;
        case 'WITHDRAW':
        case 'CARD_SPEND':
        case 'MEMBERSHIP':
          cash -= tx.amount;
          break;
        case 'BUY':
          cash -= tx.amount;
          if (tx.symbol && tx.shares !== null) {
            shares[tx.symbol] = (shares[tx.symbol] ?? 0) + tx.shares;
          }
          break;
        case 'SELL':
          cash += tx.amount;
          if (tx.symbol && tx.shares !== null) {
            shares[tx.symbol] = (shares[tx.symbol] ?? 0) - tx.shares;
          }
          break;
      }
      txIdx += 1;
    }

    // Forward-fill prices: advance each symbol's bar pointer to the latest
    // bar with t <= current timestamp.
    let value = cash;
    for (const s of symbols) {
      const bars = sortedSymBars.get(s.symbol)!;
      let idx = lastBarIdx[s.symbol];
      while (idx + 1 < bars.length && bars[idx + 1].t <= t) idx += 1;
      lastBarIdx[s.symbol] = idx;
      if (idx >= 0) {
        lastPrice[s.symbol] = bars[idx].price;
      }
      const heldShares = shares[s.symbol] ?? 0;
      const px = lastPrice[s.symbol];
      if (heldShares !== 0 && typeof px === 'number') {
        value += heldShares * px;
      }
    }
    out.push({ t, value });
  }

  return out;
}
