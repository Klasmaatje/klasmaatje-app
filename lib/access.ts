// Toegangsmodel Klasmaatje: rol x scope, server-side afgedwongen.
//
// Rol bepaalt WAT iemand mag, scope bepaalt WAAROVER:
//   TEACHER        -> alleen groepen waar hij lid van is (ClassGroupMembership)
//   IB             -> alle groepen van de eigen school (lezen + ondersteunen)
//   SCHOOL_ADMIN   -> alle groepen van de eigen school + groepen/leden beheren
//   QUALITY_STAFF  -> alle groepen van alle scholen van het eigen bestuur (lezen)
//   BOARD          -> geen operationele groepsdetails; alleen resultaten/trends
//   PLATFORM_ADMIN -> alles
//
// Bewerken van groepsinhoud (weekplannen) mag ALLEEN wie lid is van de groep,
// ongeacht rol. IB/directie/kwaliteit kijken mee, maar schrijven niet in het
// plan van de leerkracht.
//
// Dit bestand importeert niets uit Next.js, zodat het ook in scripts en tests
// draait. De ingelogde gebruiker ophalen gebeurt in lib/current-actor.ts.
//
// Regel voor alle code die data ophaalt: ALTIJD via een scope hieronder of een
// assert-functie. Nooit een losse findMany/findUnique op operationele data.

import type { Prisma, PrismaClient, Role } from "../app/generated/prisma/client";

export type Db = PrismaClient | Prisma.TransactionClient;

export type Actor = {
  userId: string;
  role: Role;
  organizationId: string | null;
  schoolId: string | null;
};

export class AccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string
  ) {
    super(message);
    this.name = "AccessError";
  }
}

// Een filter dat nooit iets oplevert. Gebruikt als "geen toegang".
const NOTHING = { id: { in: [] as string[] } };

// ---------- Scopes (Prisma where-filters) ----------

/** Welke groepen deze gebruiker mag ZIEN. */
export function classGroupScope(actor: Actor): Prisma.ClassGroupWhereInput {
  const { role, organizationId, schoolId, userId } = actor;

  switch (role) {
    case "PLATFORM_ADMIN":
      return {};

    case "TEACHER":
      if (!organizationId) return NOTHING;
      return { organizationId, memberships: { some: { userId } } };

    case "IB":
    case "SCHOOL_ADMIN":
      if (!organizationId || !schoolId) return NOTHING;
      return { organizationId, schoolId };

    case "QUALITY_STAFF":
      if (!organizationId) return NOTHING;
      return { organizationId };

    case "BOARD":
      // Bestuur ziet geen operationele groepsdetails, alleen aggregaties
      // (zie schoolResultScope).
      return NOTHING;

    default:
      return assertNever(role);
  }
}

/** Welke weekplannen deze gebruiker mag ZIEN: die van groepen die hij mag zien. */
export function weekPlanScope(actor: Actor): Prisma.WeekPlanWhereInput {
  if (actor.role === "PLATFORM_ADMIN") return {};
  if (actor.role === "BOARD" || !actor.organizationId) return NOTHING;
  return {
    organizationId: actor.organizationId,
    classGroup: classGroupScope(actor),
  };
}

/** Welke groepsgemiddelden (SchoolResult) deze gebruiker mag zien. Geen leerlingdata. */
export function schoolResultScope(actor: Actor): Prisma.SchoolResultWhereInput {
  const { role, organizationId, schoolId } = actor;

  switch (role) {
    case "PLATFORM_ADMIN":
      return {};

    case "BOARD":
    case "QUALITY_STAFF":
      if (!organizationId) return NOTHING;
      return { organizationId };

    case "IB":
    case "SCHOOL_ADMIN":
      if (!organizationId || !schoolId) return NOTHING;
      return { organizationId, schoolId };

    case "TEACHER":
      return NOTHING;

    default:
      return assertNever(role);
  }
}

// ---------- Asserts (gooien AccessError) ----------
// 404 als iets buiten je scope valt: we verraden niet dat het bestaat.
// 403 als je het wel mag zien, maar deze actie niet mag doen.

type GroupRef = { id: string; schoolId: string; organizationId: string };

/** Mag deze gebruiker deze groep zien? Geeft de groep terug. */
export async function assertCanViewClassGroup(
  db: Db,
  actor: Actor,
  classGroupId: string
): Promise<GroupRef> {
  const group = await db.classGroup.findFirst({
    where: { AND: [{ id: classGroupId }, classGroupScope(actor)] },
    select: { id: true, schoolId: true, organizationId: true },
  });
  if (!group) throw new AccessError(404, "Groep niet gevonden.");
  return group;
}

/**
 * Mag deze gebruiker inhoud (weekplannen) voor deze groep maken of wijzigen?
 * Alleen leden van de groep. Gebruik de teruggegeven schoolId/organizationId
 * bij het aanmaken van een WeekPlan, NOOIT waarden uit het formulier.
 */
export async function assertCanEditClassGroupContent(
  db: Db,
  actor: Actor,
  classGroupId: string
): Promise<GroupRef> {
  const group = await assertCanViewClassGroup(db, actor, classGroupId);

  const membership = await db.classGroupMembership.findUnique({
    where: { userId_classGroupId: { userId: actor.userId, classGroupId } },
    select: { id: true },
  });
  if (!membership || group.organizationId !== actor.organizationId) {
    throw new AccessError(
      403,
      "Alleen leerkrachten van deze groep kunnen dit bewerken."
    );
  }
  return group;
}

/** Mag deze gebruiker dit weekplan zien? */
export async function assertCanViewWeekPlan(db: Db, actor: Actor, weekPlanId: string) {
  const plan = await db.weekPlan.findFirst({
    where: { AND: [{ id: weekPlanId }, weekPlanScope(actor)] },
    select: { id: true, classGroupId: true, schoolId: true, organizationId: true },
  });
  if (!plan) throw new AccessError(404, "Weekplan niet gevonden.");
  return plan;
}

/** Mag deze gebruiker dit weekplan wijzigen? */
export async function assertCanEditWeekPlan(db: Db, actor: Actor, weekPlanId: string) {
  const plan = await assertCanViewWeekPlan(db, actor, weekPlanId);
  await assertCanEditClassGroupContent(db, actor, plan.classGroupId);
  return plan;
}

/**
 * Mag deze gebruiker dit weekplan goedkeuren?
 * IB of SCHOOL_ADMIN van de school van het plan, of PLATFORM_ADMIN.
 * Kwaliteit en bestuur kijken alleen mee. Wie zelf lid is van de groep keurt
 * zijn eigen plan niet goed. Buiten je scope: 404 (via assertCanViewWeekPlan).
 * Of de STATUS goedkeuren toelaat, controleert de actie (lib/weekplan-status.ts).
 */
export async function assertCanApproveWeekPlan(db: Db, actor: Actor, weekPlanId: string) {
  const plan = await assertCanViewWeekPlan(db, actor, weekPlanId);

  const sameSchool =
    actor.role === "PLATFORM_ADMIN" ||
    ((actor.role === "IB" || actor.role === "SCHOOL_ADMIN") &&
      actor.schoolId === plan.schoolId &&
      actor.organizationId === plan.organizationId);
  if (!sameSchool) {
    throw new AccessError(403, "Alleen IB of directie van deze school kan een weekplan goedkeuren.");
  }

  const membership = await db.classGroupMembership.findUnique({
    where: { userId_classGroupId: { userId: actor.userId, classGroupId: plan.classGroupId } },
    select: { id: true },
  });
  if (membership) {
    throw new AccessError(403, "Je kunt een weekplan van je eigen groep niet zelf goedkeuren.");
  }
  return plan;
}

/**
 * Schoolbeheer: SCHOOL_ADMIN van die school, of PLATFORM_ADMIN.
 * Buiten het eigen bestuur doen we alsof de school niet bestaat (404);
 * binnen het bestuur maar zonder beheerrecht: 403 met `forbiddenMessage`.
 */
async function assertSchoolAdmin(
  db: Db,
  actor: Actor,
  schoolId: string,
  forbiddenMessage: string
): Promise<{ id: string; organizationId: string }> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, organizationId: true },
  });

  if (actor.role === "PLATFORM_ADMIN") {
    if (!school) throw new AccessError(404, "School niet gevonden.");
    return school;
  }

  if (!school || school.organizationId !== actor.organizationId) {
    throw new AccessError(404, "School niet gevonden.");
  }
  if (actor.role !== "SCHOOL_ADMIN" || actor.schoolId !== schoolId) {
    throw new AccessError(403, forbiddenMessage);
  }
  return school;
}

/**
 * Mag deze gebruiker groepen en groepsleden beheren op deze school?
 * SCHOOL_ADMIN van die school, of PLATFORM_ADMIN. Geeft de school terug;
 * gebruik school.organizationId bij het aanmaken van een ClassGroup.
 */
export function assertCanManageSchoolGroups(db: Db, actor: Actor, schoolId: string) {
  return assertSchoolAdmin(db, actor, schoolId, "Alleen de schoolleiding kan groepen beheren.");
}

/**
 * Mag deze gebruiker het schoolrooster beheren (schooltijden per dag en vaste
 * dagonderdelen)? Zelfde regel als groepen beheren.
 */
export function assertCanManageSchoolSchedule(db: Db, actor: Actor, schoolId: string) {
  return assertSchoolAdmin(db, actor, schoolId, "Alleen de schoolleiding kan het schoolrooster aanpassen.");
}

/**
 * Mag deze gebruiker dit vaste dagonderdeel wijzigen of verwijderen?
 * De school komt uit het item zelf, nooit uit het formulier.
 */
export async function assertCanManageScheduleItem(
  db: Db,
  actor: Actor,
  scheduleItemId: string
): Promise<{ id: string; schoolId: string }> {
  const item = await db.scheduleItem.findUnique({
    where: { id: scheduleItemId },
    select: { id: true, schoolId: true },
  });
  if (!item) throw new AccessError(404, "Dagonderdeel niet gevonden.");
  await assertCanManageSchoolSchedule(db, actor, item.schoolId);
  return item;
}

// ---------- Kwaliteitslaag: groepsreflectie en clusterplannen ----------
// Groepsniveau, geen leerlingdata. Zien: zelfde scope als weekplannen.
// Groepsreflectie schrijven: alleen groepsleden (het is de reflectie van de leerkracht).
// Clusterplan schrijven: groepsleden EN IB/directie van de school (samen opstellen).
// Clusterplan vaststellen: IB/directie van de school, niet als groepslid.

/** Welke groepsreflecties deze gebruiker mag ZIEN. */
export function groupReflectionScope(actor: Actor): Prisma.GroupReflectionWhereInput {
  if (actor.role === "PLATFORM_ADMIN") return {};
  if (actor.role === "BOARD" || !actor.organizationId) return NOTHING;
  return { organizationId: actor.organizationId, classGroup: classGroupScope(actor) };
}

/** Welke clusterplannen deze gebruiker mag ZIEN. */
export function clusterPlanScope(actor: Actor): Prisma.ClusterPlanWhereInput {
  if (actor.role === "PLATFORM_ADMIN") return {};
  if (actor.role === "BOARD" || !actor.organizationId) return NOTHING;
  return { organizationId: actor.organizationId, classGroup: classGroupScope(actor) };
}

/** Mag deze gebruiker deze groepsreflectie zien? */
export async function assertCanViewGroupReflection(db: Db, actor: Actor, reflectionId: string) {
  const reflection = await db.groupReflection.findFirst({
    where: { AND: [{ id: reflectionId }, groupReflectionScope(actor)] },
    select: { id: true, weekPlanId: true, classGroupId: true, schoolId: true, organizationId: true },
  });
  if (!reflection) throw new AccessError(404, "Reflectie niet gevonden.");
  return reflection;
}

/** Mag deze gebruiker deze groepsreflectie wijzigen of verwijderen? Alleen groepsleden. */
export async function assertCanEditGroupReflection(db: Db, actor: Actor, reflectionId: string) {
  const reflection = await assertCanViewGroupReflection(db, actor, reflectionId);
  await assertCanEditClassGroupContent(db, actor, reflection.classGroupId);
  return reflection;
}

/** IB of directie van de school van deze groep (of PLATFORM_ADMIN). */
function isSchoolSupport(actor: Actor, group: { schoolId: string; organizationId: string }) {
  return (
    actor.role === "PLATFORM_ADMIN" ||
    ((actor.role === "IB" || actor.role === "SCHOOL_ADMIN") &&
      actor.schoolId === group.schoolId &&
      actor.organizationId === group.organizationId)
  );
}

/**
 * Mag deze gebruiker een clusterplan voor deze groep maken of wijzigen?
 * Groepsleden en IB/directie van de school. Kwaliteit en bestuur lezen alleen.
 */
export async function assertCanWriteClusterPlanForGroup(
  db: Db,
  actor: Actor,
  classGroupId: string
): Promise<GroupRef> {
  const group = await assertCanViewClassGroup(db, actor, classGroupId);
  if (isSchoolSupport(actor, group)) return group;

  const membership = await db.classGroupMembership.findUnique({
    where: { userId_classGroupId: { userId: actor.userId, classGroupId } },
    select: { id: true },
  });
  if (!membership || group.organizationId !== actor.organizationId) {
    throw new AccessError(403, "Alleen de leerkrachten van deze groep en IB of directie kunnen dit clusterplan bewerken.");
  }
  return group;
}

/** Mag deze gebruiker dit clusterplan zien? */
export async function assertCanViewClusterPlan(db: Db, actor: Actor, clusterPlanId: string) {
  const plan = await db.clusterPlan.findFirst({
    where: { AND: [{ id: clusterPlanId }, clusterPlanScope(actor)] },
    select: { id: true, classGroupId: true, schoolId: true, organizationId: true },
  });
  if (!plan) throw new AccessError(404, "Clusterplan niet gevonden.");
  return plan;
}

/** Mag deze gebruiker dit clusterplan wijzigen of evalueren? */
export async function assertCanEditClusterPlan(db: Db, actor: Actor, clusterPlanId: string) {
  const plan = await assertCanViewClusterPlan(db, actor, clusterPlanId);
  await assertCanWriteClusterPlanForGroup(db, actor, plan.classGroupId);
  return plan;
}

/**
 * Mag deze gebruiker dit clusterplan vaststellen?
 * IB of directie van de school (of PLATFORM_ADMIN), en niet als lid van de groep.
 * Of de STATUS vaststellen toelaat, controleert de actie (lib/quality.ts).
 */
export async function assertCanFixClusterPlan(db: Db, actor: Actor, clusterPlanId: string) {
  const plan = await assertCanViewClusterPlan(db, actor, clusterPlanId);
  if (!isSchoolSupport(actor, plan)) {
    throw new AccessError(403, "Alleen IB of directie van deze school kan een clusterplan vaststellen.");
  }
  const membership = await db.classGroupMembership.findUnique({
    where: { userId_classGroupId: { userId: actor.userId, classGroupId: plan.classGroupId } },
    select: { id: true },
  });
  if (membership) {
    throw new AccessError(403, "Je kunt een clusterplan van je eigen groep niet zelf vaststellen.");
  }
  return plan;
}

// ---------- Rolregels voor menu's en pagina's ----------
// Alleen voor wat zichtbaar is; de echte check zit in de scopes en asserts.

/** Schoolbeheer (groepen, schoolrooster). */
export function canManageSchool(role: Role): boolean {
  return role === "SCHOOL_ADMIN" || role === "PLATFORM_ADMIN";
}

/** Meekijken met alle weekplannen van de school (of het bestuur). */
export function canViewWeekPlanOverview(role: Role): boolean {
  return role === "IB" || role === "SCHOOL_ADMIN" || role === "QUALITY_STAFF" || role === "PLATFORM_ADMIN";
}

/** IB-overzicht (kwaliteitslaag): zelfde groep als meekijken met weekplannen. */
export function canViewQualityOverview(role: Role): boolean {
  return canViewWeekPlanOverview(role);
}

// ---------- Lespakketten (AI-lesvoorbereiding) ----------
// Zien: zelfde scope als weekplannen (groepen die je mag zien; bestuur niets).
// Maken en verwijderen: alleen groepsleden (het is de les van de leerkracht).

/** Welke lespakketten deze gebruiker mag ZIEN. */
export function lessonPackageScope(actor: Actor): Prisma.LessonPackageWhereInput {
  if (actor.role === "PLATFORM_ADMIN") return {};
  if (actor.role === "BOARD" || !actor.organizationId) return NOTHING;
  return { organizationId: actor.organizationId, classGroup: classGroupScope(actor) };
}

/** Mag deze gebruiker dit lespakket zien? */
export async function assertCanViewLessonPackage(db: Db, actor: Actor, packageId: string) {
  const pkg = await db.lessonPackage.findFirst({
    where: { AND: [{ id: packageId }, lessonPackageScope(actor)] },
    select: { id: true, classGroupId: true, schoolId: true, organizationId: true },
  });
  if (!pkg) throw new AccessError(404, "Lespakket niet gevonden.");
  return pkg;
}

/** Mag deze gebruiker dit lespakket verwijderen? Alleen groepsleden. */
export async function assertCanManageLessonPackage(db: Db, actor: Actor, packageId: string) {
  const pkg = await assertCanViewLessonPackage(db, actor, packageId);
  await assertCanEditClassGroupContent(db, actor, pkg.classGroupId);
  return pkg;
}

/**
 * Kwaliteitsdoelen (PDCA per doel): IB/directie (eigen school), kwaliteit en
 * bestuur (alle scholen). Het bestuur krijgt alleen tellingen per school, geen
 * groepsnamen of teksten (zie lib/pdca.ts, loadPdca).
 */
export function canViewQualityGoals(role: Role): boolean {
  return role === "IB" || role === "SCHOOL_ADMIN" || role === "QUALITY_STAFF" || role === "BOARD" || role === "PLATFORM_ADMIN";
}

/**
 * Clusterplannen die meetellen in de AGGREGATIES van Kwaliteitsdoelen.
 * Bestuur: alle plannen van het eigen bestuur, maar alleen om te tellen.
 * Overige rollen: dezelfde scope als zien (clusterPlanScope). Leerkracht: niets.
 */
export function clusterPlanAggregateScope(actor: Actor): Prisma.ClusterPlanWhereInput {
  if (actor.role === "BOARD") return actor.organizationId ? { organizationId: actor.organizationId } : NOTHING;
  if (actor.role === "TEACHER") return NOTHING;
  return clusterPlanScope(actor);
}

/** Groepsreflecties die meetellen in de aggregaties (alleen tellen bij bestuur). */
export function groupReflectionAggregateScope(actor: Actor): Prisma.GroupReflectionWhereInput {
  if (actor.role === "BOARD") return actor.organizationId ? { organizationId: actor.organizationId } : NOTHING;
  if (actor.role === "TEACHER") return NOTHING;
  return groupReflectionScope(actor);
}

/** Kwaliteitslaag in het menu (reflectie, clusterplannen): iedereen behalve bestuur. */
export function canUseQualityLayer(role: Role): boolean {
  return role !== "BOARD";
}

/** Weekplannen goedkeuren (eigen school). Kwaliteit en bestuur alleen lezen. */
export function canApproveWeekPlans(role: Role): boolean {
  return role === "IB" || role === "SCHOOL_ADMIN" || role === "PLATFORM_ADMIN";
}

/**
 * Mag deze gebruiker `memberUserId` aan deze groep koppelen?
 * Beheerrecht op de school van de groep, en het nieuwe lid hoort bij
 * dezelfde school (en dus hetzelfde bestuur). Zo kan een koppeling nooit
 * een lek tussen scholen of besturen openen.
 */
export async function assertCanAddGroupMember(
  db: Db,
  actor: Actor,
  classGroupId: string,
  memberUserId: string
): Promise<GroupRef> {
  const group = await db.classGroup.findUnique({
    where: { id: classGroupId },
    select: { id: true, schoolId: true, organizationId: true },
  });
  if (!group) throw new AccessError(404, "Groep niet gevonden.");

  await assertCanManageSchoolGroups(db, actor, group.schoolId);

  const member = await db.user.findUnique({
    where: { id: memberUserId },
    select: { organizationId: true, schoolId: true },
  });
  if (
    !member ||
    member.organizationId !== group.organizationId ||
    member.schoolId !== group.schoolId
  ) {
    throw new AccessError(
      403,
      "Deze gebruiker hoort niet bij de school van deze groep."
    );
  }
  return group;
}

function assertNever(x: never): never {
  throw new Error(`Onbekende rol: ${String(x)}`);
}
