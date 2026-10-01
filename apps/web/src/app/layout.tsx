import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { SessionReplay } from "@/components/SessionReplay";
import { UserProvider } from "@/lib/user-context";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider } from "@/components/AuthProvider";
import { ActivityTracker } from "@/components/ActivityTracker";
import { PresenceTracker } from "@/components/PresenceTracker";

export const metadata: Metadata = {
  title: "ClickShop Intelligence",
  description: "Retail analytics and AI agents powered by ClickHouse",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased bg-[--bg] text-[--fg] transition-colors duration-300">
        <AuthProvider>
          <ThemeProvider>
            <UserProvider>
              <SessionReplay />
              <ActivityTracker />
              <PresenceTracker />
              <Navbar />
              <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">{children}</main>
            </UserProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
