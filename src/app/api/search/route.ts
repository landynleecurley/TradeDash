// Server-side proxy for Finnhub /search. Used by the global SearchBar and
// the AddSymbolModal to look up tickers without leaking the API key into
// the client bundle.

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

type FinnhubSearchResult = {
  symbol: string;
  description: string;
  displaySymbol: string;
  type: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  if (!query) return Response.json({ result: [] });
  if (!FINNHUB_KEY) return Response.json({ error: 'no api key' }, { status: 503 });

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&exchange=US&token=${FINNHUB_KEY}`,
      // Short cache: searches change rarely but we don't want stale results
      // showing up after a delisting either.
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return Response.json({ error: `finnhub ${res.status}` }, { status: 502 });
    const data = (await res.json()) as { result?: FinnhubSearchResult[] };
    const filtered = (data.result ?? [])
      .filter(r => r.type === 'Common Stock' || r.type === 'ETP' || r.type === 'ETF' || r.type === '')
      .filter(r => !r.symbol.includes('.'))
      .slice(0, 10);
    return Response.json({ result: filtered });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
