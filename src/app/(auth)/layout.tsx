import { Toaster } from "sonner";

// Thin shell for the auth routes. Each page (login, signup) owns its own
// full-screen layout, so this only provides the toast portal.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          },
        }}
      />
    </>
  );
}
