import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: process.env.DEMO_MODE === "1" ? "Klasmaatje (demo)" : "Klasmaatje",
  description: "Klasmaatje: weekplanning, lesvoorbereiding en kwaliteitszorg voor het basisonderwijs.",
  // De demo hoort niet in zoekmachines.
  robots: process.env.DEMO_MODE === "1" ? { index: false, follow: false } : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {process.env.DEMO_MODE === "1" && (
          <div
            role="status"
            className="w-full text-center text-xs font-semibold tracking-wide py-1.5 print:hidden"
            style={{ background: "#E8B44A", color: "#1F1730" }}
          >
            DEMO-OMGEVING SHON · fictieve gegevens, niet de echte SHON-omgeving
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
