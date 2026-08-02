import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
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
