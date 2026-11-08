import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Dota Own Coach",
  description: "Coach pessoal de Dota 2: acompanhe suas partidas.",
};

// Texto corrido.
const inter = Inter({
  variable: "--font-inter",
  display: "swap",
  subsets: ["latin"],
});

// Títulos (classe font-display): condensada, em maiúsculas.
const display = Barlow_Condensed({
  variable: "--font-display",
  weight: ["600", "700"],
  display: "swap",
  subsets: ["latin"],
});

// v1.4: tema só escuro (cores em app/globals.css), sem seletor de tema.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${inter.variable} ${display.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <div className="flex-1 flex flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
