// Kern van het resetten van de demo-toegang (los van het startscript, zodat het
// ook te testen is). Gebruik het script prisma/scripts/demo-reset-access.ts.
//
// Waarom deze volgorde:
// Better Auth leest bij inloggen eerst de wachtwoordhash, controleert die en
// maakt DAARNA een sessie aan. Een inlogpoging die net vóór de reset de oude
// hash heeft gelezen, kan dus pas ná het intrekken van de sessies een nieuwe
// sessie wegschrijven. Daarom:
//   1. de nieuwe hash wordt VOORAF berekend (geen langzame stap tussen de wijzigingen);
//   2. nieuw wachtwoord en het intrekken van alle sessies gebeuren in één transactie;
//   3. na een wachttijd (lopende inlogpogingen zijn dan klaar) worden alle
//      sessies van demo-accounts nogmaals ingetrokken. Daarna kan alleen nog
//      iemand met het NIEUWE wachtwoord inloggen.
// Wie tijdens de wachttijd al met het nieuwe wachtwoord inlogt, moet daarna
// opnieuw inloggen. De demo-testtoegang (deellink/bypass) hoort tijdens de reset dicht.

import type { PrismaClient } from "../../app/generated/prisma/client";

export const DEMO_SLUG = "shon-demo";
export const MAIL_SUFFIX = "@demo.klasmaatje.test";

export type ResetResult = {
  accounts: number;
  sessionsRevoked: number;
  passwordsChanged: number;
  sessionsRevokedAfterWait: number;
};

/** De demo-accounts: eigen demo-bestuur EN demo-e-mailadres. */
export async function demoUserIds(prisma: PrismaClient): Promise<string[]> {
  const org = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
  if (!org) throw new Error("Demo-bestuur niet gevonden.");
  const users = await prisma.user.findMany({
    where: { organizationId: org.id, email: { endsWith: MAIL_SUFFIX } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * @param passwordHash vooraf berekende hash van het nieuwe wachtwoord, of null voor alleen sessies intrekken
 * @param waitMs wachttijd vóór de tweede intrekronde
 */
export async function resetDemoAccess(
  prisma: PrismaClient,
  opts: { passwordHash: string | null; waitMs: number; log?: (m: string) => void }
): Promise<ResetResult> {
  const log = opts.log ?? (() => {});
  const ids = await demoUserIds(prisma);

  // Stap 2: wachtwoord en sessies in één transactie.
  const ops = [];
  if (opts.passwordHash) {
    ops.push(
      prisma.account.updateMany({
        where: { userId: { in: ids }, providerId: "credential" },
        data: { password: opts.passwordHash },
      })
    );
  }
  ops.push(prisma.session.deleteMany({ where: { userId: { in: ids } } }));
  const results = await prisma.$transaction(ops);
  const passwordsChanged = opts.passwordHash ? results[0].count : 0;
  const sessionsRevoked = results[results.length - 1].count;
  log(`${sessionsRevoked} sessies ingetrokken${opts.passwordHash ? `, nieuw wachtwoord voor ${passwordsChanged} accounts` : ""} (${ids.length} demo-accounts).`);

  // Stap 3: wachten op lopende inlogpogingen, dan nogmaals intrekken.
  log(`Wachten ${Math.round(opts.waitMs / 1000)} s op lopende inlogpogingen...`);
  await new Promise((r) => setTimeout(r, opts.waitMs));
  const again = await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  log(`Tweede ronde: ${again.count} sessies ingetrokken.`);

  return { accounts: ids.length, sessionsRevoked, passwordsChanged, sessionsRevokedAfterWait: again.count };
}
