import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "@/components/auth-gate";
import { BrandProvider } from "@/components/brand-provider";
import { LanguageProvider } from "@/components/marketing/language-context";

export const metadata: Metadata = {
  title: "Aetos One Chat",
  description: "WhatsApp Business messaging platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <BrandProvider>
          <LanguageProvider>
            <AuthGate>{children}</AuthGate>
          </LanguageProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
