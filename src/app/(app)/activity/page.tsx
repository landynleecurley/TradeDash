import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { ActivityClient } from "./activity-client";

type TxRow = {
  id: string;
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'CARD_SPEND' | 'MEMBERSHIP';
  symbol: string | null;
  shares: number | string | null;
  price: number | string | null;
  amount: number | string;
  created_at: string;
};

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('transactions')
    .select('id, type, symbol, shares, price, amount, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const transactions = ((data ?? []) as TxRow[]).map(tx => ({
    id: tx.id,
    type: tx.type,
    symbol: tx.symbol,
    shares: tx.shares !== null ? Number(tx.shares) : null,
    price: tx.price !== null ? Number(tx.price) : null,
    amount: Number(tx.amount),
    createdAt: tx.created_at,
  }));

  return <ActivityClient transactions={transactions} />;
}
