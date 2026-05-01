// Combined company info + quote + key metrics. Three Finnhub endpoints fired
// in parallel and shaped into a single payload so the client only does one
// fetch per symbol change. Cached for 60s on the edge — the chart already
// pushes live prices, this route just feeds the static side panels.

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

type FinnhubProfile = {
  country?: string;
  currency?: string;
  exchange?: string;
  finnhubIndustry?: string;
  ipo?: string;
  logo?: string;
  marketCapitalization?: number;
  name?: string;
  phone?: string;
  shareOutstanding?: number;
  ticker?: string;
  weburl?: string;
};

type FinnhubQuote = {
  c?: number; d?: number; dp?: number;
  h?: number; l?: number; o?: number; pc?: number; t?: number;
};

type FinnhubMetric = {
  metric?: Record<string, number | undefined>;
};

async function fh<T>(path: string, revalidate = 60): Promise<T | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const res = await fetch(`https://finnhub.io/api/v1/${path}&token=${FINNHUB_KEY}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 });
  if (!FINNHUB_KEY) return Response.json({ error: 'no api key' }, { status: 503 });

  const [profile, quote, metric] = await Promise.all([
    fh<FinnhubProfile>(`stock/profile2?symbol=${encodeURIComponent(symbol)}`, 3600),
    fh<FinnhubQuote>(`quote?symbol=${encodeURIComponent(symbol)}`, 60),
    fh<FinnhubMetric>(`stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, 3600),
  ]);

  const m = metric?.metric ?? {};
  return Response.json({
    symbol,
    profile: profile
      ? {
          name: profile.name ?? null,
          industry: profile.finnhubIndustry ?? null,
          country: profile.country ?? null,
          exchange: profile.exchange ?? null,
          ipo: profile.ipo ?? null,
          logo: profile.logo ?? null,
          weburl: profile.weburl ?? null,
          currency: profile.currency ?? null,
          marketCap: typeof profile.marketCapitalization === 'number'
            ? profile.marketCapitalization * 1_000_000
            : null,
          sharesOutstanding: typeof profile.shareOutstanding === 'number'
            ? profile.shareOutstanding * 1_000_000
            : null,
        }
      : null,
    quote: quote
      ? {
          price: quote.c ?? null,
          high: quote.h ?? null,
          low: quote.l ?? null,
          open: quote.o ?? null,
          previousClose: quote.pc ?? null,
        }
      : null,
    metrics: {
      peTTM: m['peTTM'] ?? null,
      epsTTM: m['epsTTM'] ?? null,
      dividendYield: m['dividendYieldIndicatedAnnual'] ?? null,
      avgVolume10d: m['10DayAverageTradingVolume'] ?? null,
      high52Week: m['52WeekHigh'] ?? null,
      low52Week: m['52WeekLow'] ?? null,
      beta: m['beta'] ?? null,
    },
  });
}
