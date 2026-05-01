"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

type SearchResult = {
  symbol: string;
  description: string;
  displaySymbol: string;
  type: string;
};

export function SearchBar({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⌘K / Ctrl+K focuses the input from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Click outside dismisses the dropdown.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Debounced search via the server proxy. The route does the Finnhub
  // call so the API key never reaches the browser bundle.
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
        setResults((data.result ?? []).slice(0, 8));
        setActiveIdx(0);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const navigate = (symbol: string) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    inputRef.current?.blur();
    router.push(`/stock/${symbol.toUpperCase()}`);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) navigate(results[activeIdx].symbol);
      else if (query.trim()) navigate(query.trim());
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKey}
          placeholder="Search symbol or company"
          spellCheck={false}
          autoComplete="off"
          className="w-full h-9 pl-9 pr-12 rounded-md bg-foreground/5 hover:bg-foreground/10 focus:bg-foreground/10 border border-transparent focus:border-border/40 outline-none text-sm placeholder:text-muted-foreground transition-colors"
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <kbd className="hidden md:flex items-center gap-0.5 absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground bg-foreground/10 rounded px-1.5 py-0.5 pointer-events-none">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (query.trim().length > 0 || searching) && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-card border border-border/50 rounded-lg shadow-2xl overflow-hidden max-h-80 overflow-y-auto z-50">
          {searching && results.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 text-center">Searching…</p>
          )}
          {!searching && results.length === 0 && query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => navigate(query)}
              className="w-full p-3 text-left hover:bg-foreground/5 transition-colors"
            >
              <p className="text-sm font-bold tracking-tight">{query.trim().toUpperCase()}</p>
              <p className="text-xs text-muted-foreground">Open this symbol</p>
            </button>
          )}
          {results.length > 0 && (
            <ul role="listbox">
              {results.map((r, i) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => navigate(r.symbol)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                      i === activeIdx ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold tracking-tight">{r.displaySymbol}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.description}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest shrink-0 ml-3">
                      {r.type || 'Equity'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
