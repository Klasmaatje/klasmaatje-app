import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      organizationId: {
        type: "string",
        required: false,
        input: false, // client kan dit NIET zelf instellen
      },
      role: {
        type: "string",
        required: false,
        input: false, // client kan dit NIET zelf instellen
      },
      groep: {
        type: "string",
        required: false,
        input: true, // leerkracht mag dit zelf invullen
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Fase 1: er is nog maar één school, dus elke registratie
          // wordt automatisch aan SHON gekoppeld. Zodra er een tweede
          // school bijkomt, vervangen we dit door een keuzemenu.
          const shon = await prisma.organization.findUnique({ where: { slug: "shon" } });
          return {
            data: {
              ...user,
              organizationId: shon?.id ?? null,
              role: "TEACHER",
            },
          };
        },
      },
    },
  },
  plugins: [nextCookies()],
});