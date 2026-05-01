import { Toaster } from "sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { StockDataProvider } from "@/components/StockDataProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StockDataProvider>
      <ThemeProvider>
        <SidebarProvider>
          <AppSidebar />
          {children}
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
