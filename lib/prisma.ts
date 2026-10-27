import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { demoDatabaseProblem } from "./demo-guard.mjs";

// Veiligheid: demo alleen op de expliciet toegestane demodatabase, nooit op SHON;
// Vercel voorlopig uitsluitend demo. Zie lib/demo-guard.mjs.
const problem = demoDatabaseProblem(process.env);
if (problem) throw new Error(problem);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
