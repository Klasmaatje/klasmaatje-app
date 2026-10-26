import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // De demo-omgeving (npm run dev:demo, DEMO_MODE=1) bouwt in een eigen map,
  // zodat hij naast de gewone app kan draaien zonder elkaars bestanden te raken.
  distDir: process.env.DEMO_MODE === "1" ? ".next-demo" : ".next",
};

export default nextConfig;
