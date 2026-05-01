"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { addWatchlist } from "@/lib/actions";

type SearchResult = {
  symbol: string;
  description: string;
  displaySymbol: string;
  type: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  refresh: () => Promise<void>;
};

export function AddSymbolModal({ open, onClose, refresh }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setErr(null);
      setSubmitting(false);
    }
  }, [open]);

  // Debounced search via the server proxy — API key stays server-side.
  // Empty results just mean no matches; user can still submit a raw ticker.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data: { result?: SearchResult[] } = await res.json();
        setResults((data.result ?? []).slice(0, 10));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const submitRaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    await add(query.trim().toUpperCase(), null);
  };

  const add = async (symbol: string, name: string | null) => {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await addWatchlist({ symbol, name: name ?? undefined });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      await refresh();
      toast.success(`${symbol} added to watchlist`);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={submitting}
      eyebrow="Watchlist"
      title="Add a symbol"
      subtitle="Search by ticker or company name. Hit Enter to add the raw symbol."
      icon={<Search className="h-5 w-5" />}
      iconColor="#6B7280"
      size="md"
    >
      <form onSubmit={submitRaw} className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="AAPL, Tesla, NVDA…"
          className="pl-9"
          autoFocus
          autoComplete="off"
        />
      </form>

      {searching && (
        <p className="text-xs text-muted-foreground text-center">Searching…</p>
      )}

      {results.length > 0 && (
        <div className="border border-border/50 rounded-md divide-y divide-border/40 max-h-72 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.symbol}
              type="button"
              onClick={() => add(r.symbol, r.description)}
              disabled={submitting}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-foreground/5 transition-colors disabled:opacity-50"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight">{r.displaySymbol}</p>
                <p className="text-xs text-muted-foreground truncate">{r.description}</p>
              </div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest shrink-0 ml-3">
                {r.type || "Equity"}
              </span>
            </button>
          ))}
        </div>
      )}

      {results.length === 0 && query.trim() && !searching && (
        <p className="text-xs text-muted-foreground">
          No matches — press Enter to add &lsquo;{query.trim().toUpperCase()}&rsquo; as a raw ticker.
        </p>
      )}

      {err && <p className="text-sm font-medium text-rose-500">{err}</p>}

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
