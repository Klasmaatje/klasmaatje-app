"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  AccessError,
  assertCanEditClassGroupContent,
  assertCanEditWeekPlan,
  weekPlanScope,
} from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { resolveDayForGroup } from "@/lib/schedule-items";
import { WEEKDAYS, parsePeriode } from "@/lib/week";

export type FormState = { error?: string; ok?: string } | undefined;

const MAX_THEMA = 120;
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
          status: "DRAFT",
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

  try {
    const actor = await requireActor();
    const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
    await prisma.weekPlan.update({
      where: { id: plan.id },
      data: { thema: thema || null, bijzonderheden: bijzonderheden || null },
    });
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/mijn-week/${weekPlanId}`);
  revalidatePath("/mijn-week");
  return { ok: "Opgeslagen." };
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

  try {
    const actor = await requireActor();
    const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
    const day = await prisma.schoolDaySchedule.findUnique({
      where: { schoolId_dayOfWeek: { schoolId: plan.schoolId, dayOfWeek: dag as (typeof WEEKDAYS)[number] } },
      select: { startTime: true, endTime: true },
    });
    if (!day) return { error: "Op die dag is er geen school." };
    if (start < day.startTime || end > day.endTime) {
      return { error: `Die dag duurt van ${day.startTime} tot ${day.endTime}.` };
    }
    await prisma.lesson.create({
      data: { weekPlanId: plan.id, dag, timeSlot: `${start}-${end}`, type, subject, ...goals },
    });
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/mijn-week/${weekPlanId}`);
  return { ok: "Les toegevoegd." };
}

/** Een les of vast moment uit een weekplan halen (alleen groepsleden). */
export async function deleteLesson(formData: FormData): Promise<void> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  const lessonId = String(formData.get("lessonId") ?? "");
  const actor = await requireActor();
  const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
  // weekPlanId in het filter: zo kan nooit een les uit een ander plan verdwijnen.
  await prisma.lesson.deleteMany({ where: { id: lessonId, weekPlanId: plan.id } });
  revalidatePath(`/mijn-week/${weekPlanId}`);
}

/** Een concept-weekplan verwijderen (alleen groepsleden, alleen status Concept). */
export async function deleteWeekPlan(formData: FormData): Promise<void> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  const actor = await requireActor();
  const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
  const current = await prisma.weekPlan.findUniqueOrThrow({ where: { id: plan.id }, select: { status: true } });
  if (current.status !== "DRAFT") {
    throw new AccessError(403, "Alleen een concept-weekplan kan worden verwijderd.");
  }
  await prisma.weekPlan.delete({ where: { id: plan.id } }); // lessen gaan mee (cascade)
  revalidatePath("/mijn-week");
  redirect("/mijn-week");
}
