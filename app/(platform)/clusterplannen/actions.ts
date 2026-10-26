"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  AccessError,
  assertCanEditClusterPlan,
  assertCanFixClusterPlan,
  assertCanWriteClusterPlanForGroup,
  groupReflectionScope,
} from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { parsePeriode } from "@/lib/week";
import { privacyMessage, scanFields } from "@/lib/privacy";
import { allowListForSchool } from "@/lib/school-allowlist";
import { draftClusterPlan } from "@/lib/cluster-draft";
import {
  CP_DRAFT,
  CP_EVALUATED,
  CP_FIXED,
  canEditClusterContent,
  canEvaluateClusterPlan,
  canFixClusterPlan,
  clusterStatusAfterEdit,
  parseEffect,
  parseLevel,
} from "@/lib/quality";

export type ClusterFormState = { error?: string; ok?: string } | undefined;

const MAX_SUBJECT = 60;
const MAX_TEXT = 1000;
const MAX_SOURCES = 6;
const FIELDS = ["intensiefDoel", "intensiefAanpak", "basisDoel", "basisAanpak", "verrijkingDoel", "verrijkingAanpak"] as const;
const FIELD_LABEL: Record<(typeof FIELDS)[number], string> = {
  intensiefDoel: "Intensief: doel",
  intensiefAanpak: "Intensief: aanpak",
  basisDoel: "Basis: doel",
  basisAanpak: "Basis: aanpak",
  verrijkingDoel: "Verrijking: doel",
  verrijkingAanpak: "Verrijking: aanpak",
};

function revalidateAll(id?: string) {
  revalidatePath("/clusterplannen");
  if (id) revalidatePath(`/clusterplannen/${id}`);
  revalidatePath("/ib-overzicht");
  revalidatePath("/micro-analyse");
}

/** Kwaliteitsdoel alleen van het eigen bestuur en actief; anders null. */
async function resolveGoal(goalId: string, organizationId: string): Promise<string | null> {
  if (!goalId) return null;
  const goal = await prisma.qualityGoal.findFirst({ where: { id: goalId, organizationId, active: true }, select: { id: true } });
  if (!goal) throw new AccessError(404, "Kwaliteitsdoel niet gevonden.");
  return goal.id;
}

function checkPeriods(start: string, evaluatie: string): string | null {
  if (!parsePeriode(start) || !parsePeriode(evaluatie)) return "Kies een startweek en een evaluatieweek.";
  if (evaluatie < start) return "De evaluatieweek ligt niet voor de startweek.";
  return null;
}

/**
 * Nieuw clusterplan (DRAFT). Met "voorstellen" wordt het concept opgesteld uit
 * de groepsreflecties van deze groep en dit vak (t/m de startweek), en worden
 * die reflecties als bron vastgelegd (herleidbaarheid).
 */
export async function createClusterPlan(_prev: ClusterFormState, formData: FormData): Promise<ClusterFormState> {
  const classGroupId = String(formData.get("classGroupId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const startPeriode = String(formData.get("startPeriode") ?? "");
  const evaluatiePeriode = String(formData.get("evaluatiePeriode") ?? "");
  const goalId = String(formData.get("qualityGoalId") ?? "");
  const propose = formData.get("propose") === "on";

  if (!subject) return { error: "Vul een vak in." };
  if (subject.length > MAX_SUBJECT) return { error: `Vak mag maximaal ${MAX_SUBJECT} tekens zijn.` };
  const periodError = checkPeriods(startPeriode, evaluatiePeriode);
  if (periodError) return { error: periodError };

  let id: string;
  try {
    const actor = await requireActor();
    const group = await assertCanWriteClusterPlanForGroup(prisma, actor, classGroupId);
    const privacy = scanFields({ Vak: subject }, await allowListForSchool(group.schoolId), ["block", "ai"]);
    if (privacy.length > 0) return { error: privacyMessage(privacy) };
    const qualityGoalId = await resolveGoal(goalId, group.organizationId);

    let content = {};
    let sourceIds: string[] = [];
    if (propose) {
      const reflections = await prisma.groupReflection.findMany({
        where: {
          AND: [
            groupReflectionScope(actor),
            { classGroupId: group.id, subject: { equals: subject, mode: "insensitive" } },
            { weekPlan: { periode: { lte: startPeriode } } },
          ],
        },
        include: { weekPlan: { select: { periode: true } } },
        orderBy: { weekPlan: { periode: "desc" } },
        take: MAX_SOURCES,
      });
      const goal = qualityGoalId
        ? await prisma.qualityGoal.findUnique({ where: { id: qualityGoalId }, select: { title: true } })
        : null;
      content = draftClusterPlan(
        subject,
        reflections.map((r) => ({
          periode: r.weekPlan.periode,
          basis: parseLevel(r.basis),
          verlengd: parseLevel(r.verlengd),
          verrijking: parseLevel(r.verrijking),
          aandacht: r.aandacht,
          vervolg: r.vervolg,
        })),
        goal?.title
      );
      sourceIds = reflections.map((r) => r.id);
    }

    const plan = await prisma.clusterPlan.create({
      data: {
        organizationId: group.organizationId,
        schoolId: group.schoolId,
        classGroupId: group.id,
        createdById: actor.userId,
        subject,
        startPeriode,
        evaluatiePeriode,
        qualityGoalId,
        status: CP_DRAFT,
        ...content,
        sources: { create: sourceIds.map((reflectionId) => ({ reflectionId })) },
      },
      select: { id: true },
    });
    id = plan.id;
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidateAll(id);
  redirect(`/clusterplannen/${id}`);
}

/** Inhoud wijzigen (groepsleden en IB/directie). Een vastgesteld plan wordt weer concept. */
export async function updateClusterPlan(_prev: ClusterFormState, formData: FormData): Promise<ClusterFormState> {
  const id = String(formData.get("clusterPlanId") ?? "");
  const startPeriode = String(formData.get("startPeriode") ?? "");
  const evaluatiePeriode = String(formData.get("evaluatiePeriode") ?? "");
  const goalId = String(formData.get("qualityGoalId") ?? "");
  const values = Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "").trim()])) as Record<(typeof FIELDS)[number], string>;

  if (FIELDS.some((f) => values[f].length > MAX_TEXT)) return { error: `Elk veld mag maximaal ${MAX_TEXT} tekens zijn.` };
  const periodError = checkPeriods(startPeriode, evaluatiePeriode);
  if (periodError) return { error: periodError };

  let reopened = false;
  try {
    const actor = await requireActor();
    const ref = await assertCanEditClusterPlan(prisma, actor, id);
    const current = await prisma.clusterPlan.findUniqueOrThrow({ where: { id: ref.id } });
    if (!canEditClusterContent(current.status)) return { error: "Een geëvalueerd clusterplan wordt niet meer gewijzigd. Maak zo nodig een nieuw plan." };

    const privacy = scanFields(
      Object.fromEntries(FIELDS.map((f) => [FIELD_LABEL[f], values[f]])),
      await allowListForSchool(ref.schoolId),
      ["block", "ai"]
    );
    if (privacy.length > 0) return { error: privacyMessage(privacy) };
    const qualityGoalId = await resolveGoal(goalId, ref.organizationId);

    const unchanged =
      FIELDS.every((f) => (current[f] ?? "") === values[f]) &&
      current.startPeriode === startPeriode &&
      current.evaluatiePeriode === evaluatiePeriode &&
      (current.qualityGoalId ?? null) === qualityGoalId;
    if (unchanged) return { ok: "Niets gewijzigd." };

    await prisma.clusterPlan.update({
      where: { id: ref.id },
      data: {
        ...Object.fromEntries(FIELDS.map((f) => [f, values[f] || null])),
        startPeriode,
        evaluatiePeriode,
        qualityGoalId,
        status: clusterStatusAfterEdit(),
        vastgesteldById: null,
        vastgesteldAt: null,
      },
    });
    reopened = current.status === CP_FIXED;
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidateAll(id);
  return { ok: reopened ? "Opgeslagen. Het plan is weer een concept; laat het opnieuw vaststellen." : "Opgeslagen." };
}

/** Vaststellen (IB/directie van de school, niet als groepslid). Alleen bij een concept. */
export async function fixClusterPlan(_prev: ClusterFormState, formData: FormData): Promise<ClusterFormState> {
  const id = String(formData.get("clusterPlanId") ?? "");
  try {
    const actor = await requireActor();
    const ref = await assertCanFixClusterPlan(prisma, actor, id);
    const current = await prisma.clusterPlan.findUniqueOrThrow({
      where: { id: ref.id },
      select: { status: true, intensiefDoel: true, basisDoel: true, verrijkingDoel: true },
    });
    if (!canFixClusterPlan(current.status)) return { error: "Alleen een concept kan worden vastgesteld." };
    if (!current.intensiefDoel && !current.basisDoel && !current.verrijkingDoel) {
      return { error: "Vul eerst minstens één clusterdoel in." };
    }
    // Voorwaardelijk: wijzigt iemand tegelijk de inhoud, dan wint die wijziging.
    const res = await prisma.clusterPlan.updateMany({
      where: { id: ref.id, status: CP_DRAFT },
      data: { status: CP_FIXED, vastgesteldById: actor.userId, vastgesteldAt: new Date() },
    });
    if (res.count === 0) return { error: "Het plan is net gewijzigd. Bekijk het opnieuw." };
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
  revalidateAll(id);
  return { ok: "Vastgesteld." };
}

/** Evalueren (groepsleden en IB/directie): wat zie je terug en had de aanpak effect. Door een mens. */
export async function evaluateClusterPlan(_prev: ClusterFormState, formData: FormData): Promise<ClusterFormState> {
  const id = String(formData.get("clusterPlanId") ?? "");
  const evaluatie = String(formData.get("evaluatie") ?? "").trim();
  const effect = parseEffect(formData.get("effect"));
  if (!evaluatie) return { error: "Beschrijf kort wat je terugziet." };
  if (evaluatie.length > MAX_TEXT) return { error: `Evaluatie mag maximaal ${MAX_TEXT} tekens zijn.` };
  if (!effect) return { error: "Kies of de aanpak effect had." };

  try {
    const actor = await requireActor();
    const ref = await assertCanEditClusterPlan(prisma, actor, id);
    const privacy = scanFields({ Evaluatie: evaluatie }, await allowListForSchool(ref.schoolId), ["block", "ai"]);
    if (privacy.length > 0) return { error: privacyMessage(privacy) };
    const res = await prisma.clusterPlan.updateMany({
      where: { id: ref.id, status: CP_FIXED },
      data: { evaluatie, effect, status: CP_EVALUATED, geevalueerdAt: new Date() },
    });
    if (res.count === 0) {
      const current = await prisma.clusterPlan.findUniqueOrThrow({ where: { id: ref.id }, select: { status: true } });
      return { error: canEvaluateClusterPlan(current.status) ? "Probeer het opnieuw." : "Alleen een vastgesteld plan kan worden geëvalueerd." };
    }
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
  revalidateAll(id);
  return { ok: "Evaluatie opgeslagen." };
}

/** Concept verwijderen (groepsleden en IB/directie). Bronkoppelingen gaan mee; reflecties blijven. */
export async function deleteClusterPlan(formData: FormData): Promise<void> {
  const id = String(formData.get("clusterPlanId") ?? "");
  const actor = await requireActor();
  const ref = await assertCanEditClusterPlan(prisma, actor, id);
  const res = await prisma.clusterPlan.deleteMany({ where: { id: ref.id, status: CP_DRAFT } });
  if (res.count === 0) throw new AccessError(403, "Alleen een concept-clusterplan kan worden verwijderd.");
  revalidateAll();
  redirect("/clusterplannen");
}
