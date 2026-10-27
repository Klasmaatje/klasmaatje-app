import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma";

// Demo-omgeving (DEMO_MODE=1): registreren staat uit; alleen de demo-accounts uit de seed.
const DEMO = process.env.DEMO_MODE === "1";

// Op Vercel: het vaste projectdomein, de branch-URL en de URL van deze deployment zijn vertrouwde herkomsten
// (Better Auth weigert anders inloggen vanaf een andere host dan BETTER_AUTH_URL).
const vercelOrigins = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
  .filter((h): h is string => Boolean(h))
  .map((h) => `https://${h}`);

export const auth = betterAuth({
  trustedOrigins: vercelOrigins,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: DEMO,
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
      schoolId: {
        type: "string",
        required: true,
        input: true, // leerkracht kiest zijn school bij registratie
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
      // De school bepaalt de scope (IB/directie zien de hele school). Die mag een
      // gebruiker na registratie NIET zelf wijzigen via /api/auth/update-user;
      // een schoolwissel doet beheer rechtstreeks in de database.
      update: {
        before: async (data) => {
          if (data && typeof data === "object" && ("schoolId" in data || "organizationId" in data || "role" in data)) {
            throw new APIError("FORBIDDEN", { message: "School, bestuur en rol kun je niet zelf wijzigen." });
          }
          return { data };
        },
      },
      create: {
        before: async (user) => {
          // De leerkracht kiest bij registratie een school. We vertrouwen de
          // meegestuurde schoolId NIET blind: we valideren serverside dat de
          // school bestaat en leiden de organisatie eruit af. Zo kan niemand
          // zich aan een verkeerde organisatie of een niet-bestaande school
          // koppelen. Werkt automatisch mee als er ooit een tweede bestuur
          // bijkomt.
          const schoolId = (user as { schoolId?: string }).schoolId;

          const school = schoolId
            ? await prisma.school.findUnique({
                where: { id: schoolId },
                select: { id: true, organizationId: true },
              })
            : null;

          if (!school) {
            throw new APIError("BAD_REQUEST", {
              message: "Kies een geldige school om te registreren.",
            });
          }

          return {
            data: {
              ...user,
              schoolId: school.id,
              organizationId: school.organizationId,
              role: "TEACHER",
            },
          };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
