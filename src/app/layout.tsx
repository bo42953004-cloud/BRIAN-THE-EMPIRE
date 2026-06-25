import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMPIRETRADER · Live Deriv Trade Analyzer",
  description:
    "EMPIRETRADER — stream live tick data from Deriv and analyze Over/Under, Even/Odd, and Rise/Fall trades across Volatility (R), 1HZ, and Jump (JD) indices in real time.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%2310b981'/%3E%3Cpath d='M4 18 L8 12 L12 16 L16 10 L20 6' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='20' cy='6' r='1.5' fill='white'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
