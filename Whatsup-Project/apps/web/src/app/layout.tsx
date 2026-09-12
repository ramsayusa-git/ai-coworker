import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "@/components/auth-gate";

export const metadata: Metadata = {
  title: "Whatsup",
  description: "WhatsApp Business messaging platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
