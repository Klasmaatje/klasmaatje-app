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
import { formatPeriode, parsePeriode } from "@/lib/week";
import { privacyMessage, scanFields } from "@/lib/privacy";
import { allowListForSchool } from "@/lib/school-allowlist";
import { generateClusterDraft, generateClusterEvaluation, type ClusterRequest } from "@/lib/ai/cluster";
import { pickProvider, AiNotConfiguredError } from "@/lib/ai";
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
  parseVervolgbesluit,
} from "@/lib/quality";

export type ClusterFormState = { error?: string; ok?: string } | undefined;
export type EvaluationProposalState = { error?: string; text?: string; source?: string } | undefined;

const MAX_SUBJECT = 60;
const MAX_TEXT = 2000;
const MAX_SOURCES = 6;
const FIELDS = ["analyse", "intensiefDoel", "intensiefAanpak", "basisDoel", "basisAanpak", "verrijkingDoel", "verrijkingAanpak"] as const;
const FIELD_LABEL: Record<(typeof FIELDS)[number], string> = {
  analyse: "Groepsanalyse",
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

/** De AI-aanbieder van het bestuur (SchoolConfig.aiProvider). */
async function providerFor(organizationId: string) {
  const config = await prisma.schoolConfig.findUnique({ where: { organizationId }, select: { aiProvider: true } });
  return pickProvider(config?.aiProvider);
}

/** Eén keer opnieuw proberen: een taalmodel geeft soms een onleesbaar antwoord. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AiNotConfiguredError) throw e;
    console.error("AI-poging mislukt, nog een keer:", e instanceof Error ? e.message : e);
    return await fn();
  }
}

type ReflectionRow = {
  id: string;
  basis: string | null;
  verlengd: string | null;
  verrijking: string | null;
  goed: string | null;
  aandacht: string | null;
  vervolg: string | null;
  weekPlan: { periode: string };
};

/**
 * Invoer voor de AI: groepsniveau, reflecties nieuwste eerst. Alle vrije tekst gaat
 * nogmaals door de privacycontrole (namen); bij een melding gaat er niets naar de AI.
 */
async function buildClusterRequest(
  schoolId: string,
  grades: number[],
  subject: string,
  startPeriode: string,
  evaluatiePeriode: string,
  qualityGoalId: string | null,
  reflections: ReflectionRow[]
): Promise<{ request?: ClusterRequest; error?: string }> {
  const allow = await allowListForSchool(schoolId);
  const texts: Record<string, string> = {};
  reflections.forEach((r, i) => {
    for (const [k, v] of [["goed", r.goed], ["aandacht", r.aandacht], ["vervolg", r.vervolg]] as const) if (v) texts[`Reflectie ${i + 1} (${k})`] = v;
  });
  const privacy = scanFields(texts, allow, ["block", "ai"]);
  if (privacy.length > 0) return { error: `Een groepsreflectie bevat mogelijk persoonsgegevens; pas die eerst aan. ${privacyMessage(privacy)}` };
  const goal = qualityGoalId
    ? await prisma.qualityGoal.findUnique({ where: { id: qualityGoalId }, select: { code: true, title: true, norm: true, source: true } })
    : null;
  const week = (p: string) => formatPeriode(p).split(" · ")[0].toLowerCase();
  return {
    request: {
      grades,
      subject,
      startWeek: week(startPeriode),
      evaluatieWeek: week(evaluatiePeriode),
      goal,
      reflections: reflections.map((r) => ({
        periode: r.weekPlan.periode,
        basis: parseLevel(r.basis),
        verlengd: parseLevel(r.verlengd),
        verrijking: parseLevel(r.verrijking),
        goed: r.goed,
        aandacht: r.aandacht,
        vervolg: r.vervolg,
      })),
    },
  };
}

function aiErrorMessage(e: unknown): string {
  if (e instanceof AiNotConfiguredError) return "De AI is voor dit bestuur nog niet ingesteld.";
  return "De AI kon nu geen concept maken. Probeer het over een minuut opnieuw.";
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
    let conceptBron: string | null = null;
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
      const grades = (await prisma.classGroup.findUniqueOrThrow({ where: { id: group.id }, select: { grades: true } })).grades;
      const built = await buildClusterRequest(group.schoolId, grades, subject, startPeriode, evaluatiePeriode, qualityGoalId, reflections);
      if (!built.request) return { error: built.error };
      try {
        const provider = await providerFor(group.organizationId);
        const result = await withRetry(() => generateClusterDraft(built.request!, provider));
        content = result.draft;
        conceptBron = result.source;
      } catch (e) {
        return { error: aiErrorMessage(e) };
      }
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
        conceptBron,
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

/**
 * Concept opnieuw laten schrijven door de AI (alleen bij een concept). Gebruikt de
 * groepsreflecties t/m de startweek en legt die opnieuw vast als bron.
 */
export async function regenerateClusterDraft(_prev: ClusterFormState, formData: FormData): Promise<ClusterFormState> {
  const id = String(formData.get("clusterPlanId") ?? "");
  try {
    const actor = await requireActor();
    const ref = await assertCanEditClusterPlan(prisma, actor, id);
    const current = await prisma.clusterPlan.findUniqueOrThrow({
      where: { id: ref.id },
      select: { status: true, subject: true, startPeriode: true, evaluatiePeriode: true, qualityGoalId: true, classGroup: { select: { grades: true } } },
    });
    if (current.status !== CP_DRAFT) return { error: "Alleen een concept kan opnieuw worden voorgesteld." };
    const reflections = await prisma.groupReflection.findMany({
      where: {
        AND: [
          groupReflectionScope(actor),
          { classGroupId: ref.classGroupId, subject: { equals: current.subject, mode: "insensitive" } },
          { weekPlan: { periode: { lte: current.startPeriode } } },
        ],
      },
      include: { weekPlan: { select: { periode: true } } },
      orderBy: { weekPlan: { periode: "desc" } },
      take: MAX_SOURCES,
    });
    const built = await buildClusterRequest(ref.schoolId, current.classGroup.grades, current.subject, current.startPeriode, current.evaluatiePeriode, current.qualityGoalId, reflections);
    if (!built.request) return { error: built.error };
    let result;
    try {
      const provider = await providerFor(ref.organizationId);
      result = await withRetry(() => generateClusterDraft(built.request!, provider));
    } catch (e) {
      return { error: aiErrorMessage(e) };
    }
    const res = await prisma.$transaction(async (tx) => {
      const upd = await tx.clusterPlan.updateMany({ where: { id: ref.id, status: CP_DRAFT }, data: { ...result.draft, conceptBron: result.source } });
      if (upd.count === 0) return 0;
      await tx.clusterPlanSource.deleteMany({ where: { clusterPlanId: ref.id } });
      if (reflections.length > 0) await tx.clusterPlanSource.createMany({ data: reflections.map((r) => ({ clusterPlanId: ref.id, reflectionId: r.id })) });
      return upd.count;
    });
    if (res === 0) return { error: "Het plan is net gewijzigd. Bekijk het opnieuw." };
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
  revalidateAll(id);
  return { ok: "Nieuw concept geschreven. Controleer en pas aan." };
}

/**
 * Concept-evaluatie laten schrijven (bij een vastgesteld plan). Wordt NIET opgeslagen:
 * de tekst komt in het formulier, de mens past aan en kiest uitvoering, effect en vervolg.
 */
export async function proposeEvaluation(_prev: EvaluationProposalState, formData: FormData): Promise<EvaluationProposalState> {
  const id = String(formData.get("clusterPlanId") ?? "");
  try {
    const actor = await requireActor();
    const ref = await assertCanEditClusterPlan(prisma, actor, id);
    const plan = await prisma.clusterPlan.findUniqueOrThrow({
      where: { id: ref.id },
      select: {
        status: true, subject: true, startPeriode: true, evaluatiePeriode: true, qualityGoalId: true,
        analyse: true, intensiefDoel: true, basisDoel: true, verrijkingDoel: true, classGroup: { select: { grades: true } },
      },
    });
    if (plan.status !== CP_FIXED) return { error: "Een evaluatie voorstellen kan bij een vastgesteld plan." };
    const reflections = await prisma.groupReflection.findMany({
      where: {
        AND: [
          groupReflectionScope(actor),
          { classGroupId: ref.classGroupId, subject: { equals: plan.subject, mode: "insensitive" } },
          { weekPlan: { periode: { gte: plan.startPeriode } } },
        ],
      },
      include: { weekPlan: { select: { periode: true } } },
      orderBy: { weekPlan: { periode: "desc" } },
      take: 12,
    });
    const built = await buildClusterRequest(ref.schoolId, plan.classGroup.grades, plan.subject, plan.startPeriode, plan.evaluatiePeriode, plan.qualityGoalId, reflections);
    if (!built.request) return { error: built.error };
    try {
      const provider = await providerFor(ref.organizationId);
      const result = await withRetry(() =>
        generateClusterEvaluation(built.request!, { analyse: plan.analyse, doelen: { intensief: plan.intensiefDoel, basis: plan.basisDoel, verrijking: plan.verrijkingDoel } }, provider)
      );
      return { text: result.text, source: result.source };
    } catch (e) {
      return { error: aiErrorMessage(e) };
    }
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
}

/** Evalueren (groepsleden en IB/directie): wat zie je terug en had de aanpak effect. Door een mens. */
export async function evaluateClusterPlan(_prev: ClusterFormState, formData: FormData): Promise<ClusterFormState> {
  const id = String(formData.get("clusterPlanId") ?? "");
  const evaluatie = String(formData.get("evaluatie") ?? "").trim();
  const effect = parseEffect(formData.get("effect"));
  const uitvoering = parseEffect(formData.get("uitvoering"));
  const vervolgbesluit = parseVervolgbesluit(formData.get("vervolgbesluit"));
  const volgendeControle = String(formData.get("volgendeControle") ?? "");
  if (!evaluatie) return { error: "Beschrijf kort wat je terugziet." };
  if (evaluatie.length > MAX_TEXT) return { error: `Evaluatie mag maximaal ${MAX_TEXT} tekens zijn.` };
  if (!uitvoering) return { error: "Kies of de aanpak is uitgevoerd." };
  if (!effect) return { error: "Kies of de aanpak effect had." };
  if (!vervolgbesluit) return { error: "Kies het vervolgbesluit." };
  if (vervolgbesluit !== "AFRONDEN" && !parsePeriode(volgendeControle)) return { error: "Kies de week van de volgende controle." };

  try {
    const actor = await requireActor();
    const ref = await assertCanEditClusterPlan(prisma, actor, id);
    const privacy = scanFields({ Evaluatie: evaluatie }, await allowListForSchool(ref.schoolId), ["block", "ai"]);
    if (privacy.length > 0) return { error: privacyMessage(privacy) };
    const res = await prisma.clusterPlan.updateMany({
      where: { id: ref.id, status: CP_FIXED },
      data: {
        evaluatie, effect, uitvoering, vervolgbesluit,
        volgendeControle: vervolgbesluit === "AFRONDEN" ? null : volgendeControle,
        status: CP_EVALUATED, geevalueerdAt: new Date(),
      },
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
