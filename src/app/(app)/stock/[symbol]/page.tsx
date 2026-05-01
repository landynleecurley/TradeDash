import { Dashboard } from "@/components/Dashboard";

export default async function StockPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <Dashboard symbol={symbol.toUpperCase()} />;
}
