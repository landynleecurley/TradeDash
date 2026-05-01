// Recent company news from Finnhub. Shape into the minimal subset the UI
// renders (headline, source, time, image, url) and cap to 8 items so the
// payload is tight. Cached for 5 minutes.

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

type FinnhubNewsItem = {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return Response.json({ error: 'symbol required' }, { status: 400 });
  if (!FINNHUB_KEY) return Response.json({ error: 'no api key' }, { status: 503 });

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${ymd(from)}&to=${ymd(to)}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return Response.json({ error: `finnhub ${res.status}` }, { status: 502 });
    const data = await res.json() as FinnhubNewsItem[];
    const articles = data
      .slice()
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 8)
      .map(n => ({
        id: n.id,
        headline: n.headline,
        source: n.source,
        url: n.url,
        image: n.image || null,
        summary: n.summary,
        datetime: n.datetime,
      }));
    return Response.json({ symbol, articles });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
