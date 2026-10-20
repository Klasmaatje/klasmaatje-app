// De ingelogde gebruiker als "Actor" voor de toegangschecks in lib/access.ts.
// Alleen te gebruiken in server components, server actions en route handlers.

import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { AccessError, type Actor } from "./access";

/**
 * Haalt de ingelogde gebruiker op, of null als niemand is ingelogd.
 * Rol en scope komen ALTIJD vers uit de database, niet uit de sessie:
 * als een rol of school wijzigt, geldt dat direct.
 * Per request maar 1x opgehaald (React cache).
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, organizationId: true, schoolId: true },
  });
  if (!user) return null;

  return {
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
    schoolId: user.schoolId,
  };
});

/** Zoals getActor, maar gooit een AccessError(401) als niemand is ingelogd. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AccessError(401, "Je bent niet ingelogd.");
  return actor;
}
