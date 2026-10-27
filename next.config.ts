import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // De demo-omgeving (npm run dev:demo, DEMO_MODE=1) bouwt in een eigen map,
  // zodat hij naast de gewone app kan draaien zonder elkaars bestanden te raken.
  // Op Vercel altijd de standaardmap.
  distDir: process.env.DEMO_MODE === "1" && !process.env.VERCEL ? ".next-demo" : ".next",
  // Alleen de vlag "demo ja/nee" gaat naar de browser (voor de loginpagina), geen geheimen.
  env: { NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE === "1" ? "1" : "" },
};

export default nextConfig;
