import { Toaster } from "sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { StockDataProvider } from "@/components/StockDataProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { MobileNavDock } from "@/components/MobileNavDock";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StockDataProvider>
      <ThemeProvider>
        <SidebarProvider>
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
            <DemoBanner />
            {children}
          </div>
          <MobileNavDock />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              },
            }}
          />
        </SidebarProvider>
      </ThemeProvider>
    </StockDataProvider>
  );
}
