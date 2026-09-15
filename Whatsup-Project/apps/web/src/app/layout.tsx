import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "@/components/auth-gate";
import { BrandProvider } from "@/components/brand-provider";
import { LanguageProvider } from "@/components/marketing/language-context";
import { ThemeProvider, themeBootScript } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Loqio",
  description: "WhatsApp Business messaging platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — see theme-provider.tsx */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <ThemeProvider>
        <BrandProvider>
          <LanguageProvider>
            <AuthGate>{children}</AuthGate>
          </LanguageProvider>
        </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
