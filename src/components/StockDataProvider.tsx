"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useStockData } from "@/lib/useStockData";

type StockContextType = ReturnType<typeof useStockData>;

const StockContext = createContext<StockContextType | undefined>(undefined);

export function StockDataProvider({ children }: { children: ReactNode }) {
  const stockData = useStockData();
  return (
    <StockContext.Provider value={stockData}>
      {children}
    </StockContext.Provider>
  );
}

export function useGlobalStockData() {
  const context = useContext(StockContext);
  if (!context) throw new Error("must be used within StockDataProvider");
  return context;
}
