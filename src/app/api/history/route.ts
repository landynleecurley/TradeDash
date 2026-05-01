export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');
  const range = url.searchParams.get('range') ?? '1d';
  const interval = url.searchParams.get('interval') ?? '5m';
  const includePrePost = url.searchParams.get('includePrePost') === 'true';

  if (!symbol) {
    return Response.json({ error: 'symbol required' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({ range, interval });
    if (includePrePost) params.set('includePrePost', 'true');
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
    const res = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradeDash/1.0)' },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return Response.json({ error: `yahoo ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return Response.json({ error: 'no data' }, { status: 404 });
    }
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const points = timestamps
      .map((t, i) => ({ t, price: closes[i] }))
      .filter((p): p is { t: number; price: number } => typeof p.price === 'number');

    return Response.json({ symbol, range, interval, points });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
