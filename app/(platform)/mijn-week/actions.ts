"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  AccessError,
  assertCanApproveWeekPlan,
  assertCanEditClassGroupContent,
  assertCanEditWeekPlan,
  weekPlanScope,
} from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { resolveDayForGroup } from "@/lib/schedule-items";
import { WEEKDAYS, WEEKDAY_NL, formatPeriode, formatShortDate, parsePeriode, weekdayDates } from "@/lib/week";
import { privacyMessage, scanFields } from "@/lib/privacy";
import { allowListForSchool } from "@/lib/school-allowlist";
import { AiNotConfiguredError, generateWeekPlanDraft, pickProvider } from "@/lib/ai";
import { freeBlocks, parseSlot } from "@/lib/ai/free-blocks";
import type { DraftDay } from "@/lib/ai/types";
import { APPROVED, DRAFT, SUBMITTED, canApprove, canDelete, canSubmit, statusAfterEdit } from "@/lib/weekplan-status";

export type FormState = { error?: string; ok?: string } | undefined;

const MAX_THEMA = 120;

const SNAPSHOT_TYPES = ["routine", "pauze"];
const REOPENED = " Het plan staat weer op concept; dien het opnieuw in als je klaar bent.";

/**
 * De leerkracht blijft eindredacteur: een wijziging in een ingediend of
 * goedgekeurd plan zet het terug op Concept. Geeft de query terug, zodat hij
 * in dezelfde transactie als de wijziging zelf kan.
 */
function reopenQuery(weekPlanId: string) {
  return prisma.weekPlan.updateMany({
    where: { id: weekPlanId, status: { not: DRAFT } },
    data: { status: statusAfterEdit() },
  });
}
const MAX_BIJZONDERHEDEN = 2000;

/**
 * Maakt een concept-weekplan (DRAFT) voor een groep en een week.
 * Bestaat er al een plan voor die groep en week, dan gaan we daarheen.
 * School en bestuur komen uit de groep (via de toegangscheck), nooit uit het formulier.
 *
 * Rooster-snapshot: de vaste dagonderdelen worden met de tijden van NU als
 * Lesson-regels (type routine/pauze) in het plan vastgelegd. Wijzigt het
 * dagrooster van de school later, dan blijft dit plan zoals het was.
 */
export async function createWeekPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const classGroupId = String(formData.get("classGroupId") ?? "");
  const periode = String(formData.get("periode") ?? "");
  if (!parsePeriode(periode)) return { error: "Kies een week." };

  let planId: string;
  try {
    const actor = await requireActor();
    const group = await assertCanEditClassGroupContent(prisma, actor, classGroupId);

    const existing = await prisma.weekPlan.findFirst({
      where: { AND: [weekPlanScope(actor), { classGroupId: group.id, periode }] },
      select: { id: true },
    });

    if (existing) {
      planId = existing.id;
    } else {
      const [groupInfo, school] = await Promise.all([
        prisma.classGroup.findUniqueOrThrow({ where: { id: group.id }, select: { grades: true } }),
        prisma.school.findUniqueOrThrow({
          where: { id: group.schoolId },
          select: { daySchedules: true, scheduleItems: true },
        }),
      ]);

      const snapshot = WEEKDAYS.flatMap((weekday) => {
        const day = school.daySchedules.find((d) => d.dayOfWeek === weekday);
        if (!day) return [];
        return resolveDayForGroup(school.scheduleItems, day, groupInfo.grades).slots.map((s) => ({
          dag: weekday,
          timeSlot: `${s.start}-${s.end}`,
          type: s.item.category,
          subject: s.item.label,
        }));
      });

      const plan = await prisma.weekPlan.create({
        data: {
          organizationId: group.organizationId,
          schoolId: group.schoolId,
          classGroupId: group.id,
          userId: actor.userId,
          periode,
          status: DRAFT,
          lessons: { create: snapshot },
        },
        select: { id: true },
      });
      planId = plan.id;
    }
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidatePath("/mijn-week");
  redirect(`/mijn-week/${planId}`);
}

/** Thema en bijzonderheden van een weekplan opslaan (alleen groepsleden). */
export async function updateWeekPlanDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  const thema = String(formData.get("thema") ?? "").trim();
  const bijzonderheden = String(formData.get("bijzonderheden") ?? "").trim();

  if (thema.length > MAX_THEMA) return { error: `Thema mag maximaal ${MAX_THEMA} tekens zijn.` };
  if (bijzonderheden.length > MAX_BIJZONDERHEDEN) {
    return { error: `Bijzonderheden mag maximaal ${MAX_BIJZONDERHEDEN} tekens zijn.` };
  }

  let reopened = false;
  try {
    const actor = await requireActor();
    const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
    const privacy = scanFields({ Thema: thema, Bijzonderheden: bijzonderheden }, await allowListForSchool(plan.schoolId), ["block"]);
    if (privacy.length > 0) return { error: privacyMessage(privacy) };
    const current = await prisma.weekPlan.findUniqueOrThrow({
      where: { id: plan.id },
      select: { thema: true, bijzonderheden: true, status: true },
    });
    if ((current.thema ?? "") === thema && (current.bijzonderheden ?? "") === bijzonderheden) {
      return { ok: "Niets gewijzigd." };
    }
    await prisma.weekPlan.update({
      where: { id: plan.id },
      data: { thema: thema || null, bijzonderheden: bijzonderheden || null, status: statusAfterEdit() },
    });
    reopened = current.status !== DRAFT;
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/mijn-week/${weekPlanId}`);
  revalidatePath("/mijn-week");
  revalidatePath("/weekplannen");
  return { ok: reopened ? `Opgeslagen.${REOPENED}` : "Opgeslagen." };
}

// ---------- Lessen ----------

const LESSON_TYPES = ["les", "vakles", "toets"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_GOAL = 500;

/** Les met de hand toevoegen aan een weekplan (alleen groepsleden). */
export async function addLesson(_prev: FormState, formData: FormData): Promise<FormState> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  const dag = String(formData.get("dag") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const typeInput = String(formData.get("type") ?? "les");
  const type = (LESSON_TYPES as readonly string[]).includes(typeInput) ? typeInput : "les";
  const goals = {
    goalBasis: String(formData.get("goalBasis") ?? "").trim() || null,
    goalVerlengd: String(formData.get("goalVerlengd") ?? "").trim() || null,
    goalVerrijking: String(formData.get("goalVerrijking") ?? "").trim() || null,
  };

  if (!(WEEKDAYS as readonly string[]).includes(dag)) return { error: "Kies een dag." };
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { error: "Vul een begin- en eindtijd in." };
  if (end <= start) return { error: "De eindtijd moet na de begintijd liggen." };
  if (!subject || subject.length > 80) return { error: "Vul een vak of activiteit in (maximaal 80 tekens)." };
  if (Object.values(goals).some((g) => g !== null && g.length > MAX_GOAL)) {
    return { error: `Een doel mag maximaal ${MAX_GOAL} tekens zijn.` };
  }

  let reopened = false;
  try {
    const actor = await requireActor();
    const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
    const day = await prisma.schoolDaySchedule.findUnique({
      where: { schoolId_dayOfWeek: { schoolId: plan.schoolId, dayOfWeek: dag as (typeof WEEKDAYS)[number] } },
      select: { startTime: true, endTime: true },
    });
    if (!day) return { error: "Op die dag is er geen school." };
    const privacy = scanFields(
      { Vak: subject, Basis: goals.goalBasis, Verlengd: goals.goalVerlengd, Verrijking: goals.goalVerrijking },
      await allowListForSchool(plan.schoolId),
      ["block"]
    );
    if (privacy.length > 0) return { error: privacyMessage(privacy) };
    if (start < day.startTime || end > day.endTime) {
      return { error: `Die dag duurt van ${day.startTime} tot ${day.endTime}.` };
    }
    const [, reopen] = await prisma.$transaction([
      prisma.lesson.create({
        data: { weekPlanId: plan.id, dag, timeSlot: `${start}-${end}`, type, subject, ...goals },
      }),
      reopenQuery(plan.id),
    ]);
    reopened = reopen.count > 0;
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/mijn-week/${weekPlanId}`);
  revalidatePath("/weekplannen");
  return { ok: reopened ? `Les toegevoegd.${REOPENED}` : "Les toegevoegd." };
}

/** Een les of vast moment uit een weekplan halen (alleen groepsleden). */
export async function deleteLesson(formData: FormData): Promise<void> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  const lessonId = String(formData.get("lessonId") ?? "");
  const actor = await requireActor();
  const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
  // weekPlanId in het filter: zo kan nooit een les uit een ander plan verdwijnen.
  await prisma.$transaction(async (tx) => {
    const removed = await tx.lesson.deleteMany({ where: { id: lessonId, weekPlanId: plan.id } });
    if (removed.count > 0) {
      await tx.weekPlan.updateMany({
        where: { id: plan.id, status: { not: DRAFT } },
        data: { status: statusAfterEdit() },
      });
    }
  });
  revalidatePath(`/mijn-week/${weekPlanId}`);
  revalidatePath("/weekplannen");
}

/** Een concept-weekplan verwijderen (alleen groepsleden, alleen status Concept). */
export async function deleteWeekPlan(formData: FormData): Promise<void> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  const actor = await requireActor();
  const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
  const current = await prisma.weekPlan.findUniqueOrThrow({ where: { id: plan.id }, select: { status: true } });
  if (!canDelete(current.status)) {
    throw new AccessError(403, "Alleen een concept-weekplan kan worden verwijderd.");
  }
  // Een plan met groepsreflectie blijft bewaard (de reflectie verwijst ernaar).
  if ((await prisma.groupReflection.count({ where: { weekPlanId: plan.id } })) > 0) {
    throw new AccessError(403, "Dit weekplan heeft een groepsreflectie en kan daarom niet worden verwijderd.");
  }
  await prisma.weekPlan.delete({ where: { id: plan.id } }); // lessen gaan mee (cascade)
  revalidatePath("/mijn-week");
  redirect("/mijn-week");
}

// ---------- AI-concept ----------

/**
 * Laat de AI lessen voorstellen voor de vrije blokken van dit weekplan.
 * Volgorde: toegang -> privacycontrole op ALLE vrije tekst die meegaat ->
 * aanbieder kiezen -> voorstel -> controle -> opslaan als gewone lessen.
 * Bestaande lessen en vaste momenten blijven staan; het plan blijft Concept.
 */
export async function generateDraftLessons(_prev: FormState, formData: FormData): Promise<FormState> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  try {
    const actor = await requireActor();
    const ref = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
    const plan = await prisma.weekPlan.findUniqueOrThrow({
      where: { id: ref.id },
      include: {
        classGroup: { select: { name: true, grades: true } },
        lessons: { select: { dag: true, timeSlot: true, subject: true } },
        organization: { select: { config: { select: { aiProvider: true } } } },
        school: {
          select: {
            daySchedules: true,
            methods: { select: { method: { select: { name: true, subject: true } } } },
          },
        },
      },
    });
    if (plan.status !== DRAFT) return { error: "Alleen een concept-weekplan kan een voorstel krijgen." };

    // 1. Privacy: alles wat naar de aanbieder gaat, met het strengste niveau.
    const privacy = scanFields(
      { Thema: plan.thema, Bijzonderheden: plan.bijzonderheden },
      await allowListForSchool(plan.schoolId),
      ["block", "ai"]
    );
    if (privacy.length > 0) return { error: privacyMessage(privacy) };

    // 2. Dagen met vaste momenten en vrije blokken.
    const days: DraftDay[] = [];
    for (const { weekday, date } of weekdayDates(plan.periode)) {
      const sched = plan.school.daySchedules.find((d) => d.dayOfWeek === weekday);
      if (!sched) continue;
      const taken = plan.lessons.filter((l) => l.dag === weekday && l.timeSlot);
      const occupied = taken.map((l) => parseSlot(l.timeSlot!)).filter((b): b is NonNullable<typeof b> => b !== null);
      days.push({
        weekday,
        label: `${WEEKDAY_NL[weekday]} ${formatShortDate(date)}`,
        startTime: sched.startTime,
        endTime: sched.endTime,
        fixed: taken
          .map((l) => ({ time: l.timeSlot!, label: l.subject }))
          .sort((a, b) => a.time.localeCompare(b.time)),
        free: freeBlocks(sched.startTime, sched.endTime, occupied),
      });
    }
    if (days.every((d) => d.free.length === 0)) {
      return { error: "Er is geen vrije tijd meer in dit plan om lessen voor te stellen." };
    }

    // 3. Aanbieder en voorstel.
    const provider = pickProvider(plan.organization.config?.aiProvider);
    const result = await generateWeekPlanDraft(
      {
        groupName: plan.classGroup.name,
        grades: plan.classGroup.grades,
        weekLabel: formatPeriode(plan.periode),
        thema: plan.thema,
        bijzonderheden: plan.bijzonderheden,
        methods: plan.school.methods.map((m) => m.method),
        days,
      },
      provider
    );

    // 4. Opslaan als gewone lessen in het concept.
    if (result.lessons.length > 0) {
      await prisma.lesson.createMany({
        data: result.lessons.map((l) => ({
          weekPlanId: plan.id,
          dag: l.dag,
          timeSlot: `${l.start}-${l.end}`,
          type: "les",
          subject: l.subject,
          goalBasis: l.goalBasis || null,
          goalVerlengd: l.goalVerlengd || null,
          goalVerrijking: l.goalVerrijking || null,
          didacticStrategy: "EDI",
        })),
      });
    }
    revalidatePath(`/mijn-week/${plan.id}`);
    const extra = result.skipped > 0 ? ` ${result.skipped} voorstel(len) vielen buiten de vrije tijd en zijn weggelaten.` : "";
    return {
      ok: `${result.lessons.length} lessen voorgesteld (${result.provider}). Controleer en pas aan; het plan blijft een concept.${extra}`,
    };
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    if (e instanceof AiNotConfiguredError) return { error: e.message };
    console.error("AI-voorstel mislukt", e);
    return { error: "Het voorstel kon niet worden gemaakt. Probeer het later opnieuw." };
  }
}

// ---------- Status: indienen en goedkeuren ----------

/**
 * Leerkracht dient een concept in (alleen groepsleden, minstens een les).
 * Daarna zien IB en directie dat het plan klaar is om te bekijken.
 */
export async function submitWeekPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  try {
    const actor = await requireActor();
    const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
    const current = await prisma.weekPlan.findUniqueOrThrow({
      where: { id: plan.id },
      select: {
        status: true,
        _count: { select: { lessons: { where: { type: { notIn: SNAPSHOT_TYPES } } } } },
      },
    });
    if (current.status !== DRAFT) return { error: "Dit plan is al ingediend." };
    if (!canSubmit(current.status, current._count.lessons)) {
      return { error: "Voeg eerst minstens een les toe voordat je het plan indient." };
    }
    // Voorwaardelijk bijwerken: alleen als het plan intussen nog Concept is.
    const res = await prisma.weekPlan.updateMany({
      where: { id: plan.id, status: DRAFT },
      data: { status: SUBMITTED },
    });
    if (res.count === 0) return { error: "Het plan is intussen gewijzigd. Vernieuw de pagina en probeer het opnieuw." };
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/mijn-week/${weekPlanId}`);
  revalidatePath("/mijn-week");
  revalidatePath("/weekplannen");
  return { ok: "Ingediend." };
}

/** IB of directie van de school keurt een ingediend plan goed (een klik). */
export async function approveWeekPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  try {
    const actor = await requireActor();
    const plan = await assertCanApproveWeekPlan(prisma, actor, weekPlanId);
    const current = await prisma.weekPlan.findUniqueOrThrow({ where: { id: plan.id }, select: { status: true } });
    if (current.status === APPROVED) return { ok: "Dit plan is al goedgekeurd." };
    if (!canApprove(current.status)) return { error: "Alleen een ingediend plan kan worden goedgekeurd." };
    // Voorwaardelijk: past de leerkracht net iets aan, dan wint die wijziging.
    const res = await prisma.weekPlan.updateMany({
      where: { id: plan.id, status: SUBMITTED },
      data: { status: APPROVED },
    });
    if (res.count === 0) {
      return { error: "De leerkracht heeft het plan intussen aangepast. Vernieuw de pagina." };
    }
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/mijn-week/${weekPlanId}`);
  revalidatePath("/mijn-week");
  revalidatePath("/weekplannen");
  return { ok: "Goedgekeurd." };
}
