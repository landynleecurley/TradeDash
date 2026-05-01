// Server-side proxy for Finnhub /quote so the API key never reaches the
// client bundle. Cached for 10s so a watchlist of N symbols polling every
// 15s collapses to ~one upstream call per symbol per cache window even
// across users.

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 });
  if (!FINNHUB_KEY) return Response.json({ error: 'no api key' }, { status: 503 });

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 10 } },
    );
    if (!res.ok) return Response.json({ error: `finnhub ${res.status}` }, { status: 502 });
    const q = (await res.json()) as FinnhubQuote;
    if (typeof q.c !== 'number' || q.c === 0) {
      return Response.json({ symbol, price: null });
    }
    return Response.json({
      symbol,
      price: q.c,
      change: typeof q.d === 'number' ? q.d : null,
      changePercent: typeof q.dp === 'number' ? q.dp : null,
      high: typeof q.h === 'number' ? q.h : null,
      low: typeof q.l === 'number' ? q.l : null,
      open: typeof q.o === 'number' ? q.o : null,
      previousClose: typeof q.pc === 'number' ? q.pc : null,
      t: typeof q.t === 'number' ? q.t : null,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
