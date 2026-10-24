"use server";

// Schoolrooster beheren: schooltijden per dag en vaste dagonderdelen.
// Alleen de schoolleiding van de school (of Klasmaatje-beheer).
// Wijzigingen gelden voor NIEUWE weekplannen; bestaande plannen hebben hun
// eigen snapshot van de vaste momenten (zie createWeekPlan).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  AccessError,
  assertCanManageScheduleItem,
  assertCanManageSchoolSchedule,
} from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { WEEKDAYS, WEEKDAY_NL } from "@/lib/week";
import type { DaySchedule } from "@/lib/schedule-items";
import {
  MAX_AI_HINT,
  MAX_LABEL,
  type MomentKind,
  cleanGrades,
  composeMoment,
  isCategory,
  validateDay,
} from "@/lib/schedule-admin";
import { privacyMessage, scanFields } from "@/lib/privacy";
import { allowListForSchool } from "@/lib/school-allowlist";

export type FormState = { error?: string; ok?: string } | undefined;

const MOMENT_KINDS: MomentKind[] = ["start", "end", "clock", "midday", "weekly"];

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function revalidate() {
  revalidatePath("/schoolrooster");
  revalidatePath("/mijn-week");
}

/** Schooltijden van ma t/m vr in één keer opslaan (alles of niets). */
export async function saveDaySchedules(_prev: FormState, formData: FormData): Promise<FormState> {
  const schoolId = text(formData, "schoolId");

  const days: { weekday: (typeof WEEKDAYS)[number]; day: DaySchedule | null }[] = [];
  for (const weekday of WEEKDAYS) {
    const result = validateDay(
      {
        open: formData.get(`${weekday}.open`) === "on",
        startTime: text(formData, `${weekday}.start`),
        endTime: text(formData, `${weekday}.end`),
        breakStart: text(formData, `${weekday}.breakStart`),
        breakEnd: text(formData, `${weekday}.breakEnd`),
      },
      WEEKDAY_NL[weekday]
    );
    if (!result.ok) return { error: result.error };
    days.push({ weekday, day: result.day });
  }
  if (days.every((d) => d.day === null)) return { error: "Kies minstens één schooldag." };

  try {
    const actor = await requireActor();
    const school = await assertCanManageSchoolSchedule(prisma, actor, schoolId);

    await prisma.$transaction(async (tx) => {
      for (const { weekday, day } of days) {
        if (day === null) {
          await tx.schoolDaySchedule.deleteMany({ where: { schoolId: school.id, dayOfWeek: weekday } });
        } else {
          await tx.schoolDaySchedule.upsert({
            where: { schoolId_dayOfWeek: { schoolId: school.id, dayOfWeek: weekday } },
            update: day,
            create: { schoolId: school.id, dayOfWeek: weekday, ...day },
          });
        }
      }
    });
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidate();
  return { ok: "Schooltijden opgeslagen. Ze gelden voor nieuwe weekplannen." };
}

/** Vast dagonderdeel toevoegen (zonder id) of wijzigen (met id). */
export async function saveScheduleItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const label = text(formData, "label");
  const aiHint = text(formData, "aiHint");
  const category = text(formData, "category");
  const kindInput = text(formData, "kind");
  const kind = (MOMENT_KINDS as string[]).includes(kindInput) ? (kindInput as MomentKind) : null;

  if (!label) return { error: "Geef het dagonderdeel een naam." };
  if (label.length > MAX_LABEL) return { error: `De naam mag maximaal ${MAX_LABEL} tekens zijn.` };
  if (aiHint.length > MAX_AI_HINT) return { error: `De toelichting mag maximaal ${MAX_AI_HINT} tekens zijn.` };
  if (!isCategory(category)) return { error: "Kies een soort." };
  if (!kind) return { error: "Kies wanneer het dagonderdeel plaatsvindt." };

  const moment = composeMoment({
    kind,
    offset: Number(text(formData, "offset") || 0),
    clock: text(formData, "clock"),
    duration: Number(text(formData, "duration") || 0),
  });
  if (!moment.ok) return { error: moment.error };
  const targetGrades = cleanGrades(formData.getAll("grades").map(String));

  try {
    const actor = await requireActor();
    // School uit het bestaande item of uit de beheercheck, nooit blind uit het formulier.
    const schoolId = id
      ? (await assertCanManageScheduleItem(prisma, actor, id)).schoolId
      : (await assertCanManageSchoolSchedule(prisma, actor, text(formData, "schoolId"))).id;

    // Naam en toelichting gaan mee naar de AI: dezelfde privacycontrole als vóór een AI-aanroep.
    const privacy = scanFields(
      { Naam: label, "Toelichting voor de AI": aiHint },
      await allowListForSchool(schoolId),
      ["block", "ai"]
    );
    if (privacy.length > 0) return { error: privacyMessage(privacy) };

    const sameName = await prisma.scheduleItem.findFirst({
      where: { schoolId, label: { equals: label, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) },
      select: { id: true },
    });
    if (sameName) return { error: `Er is al een dagonderdeel met de naam "${label}".` };

    const data = { label, defaultTime: moment.defaultTime, category, targetGrades, aiHint: aiHint || null };
    if (id) {
      await prisma.scheduleItem.update({ where: { id }, data });
    } else {
      const last = await prisma.scheduleItem.aggregate({ where: { schoolId }, _max: { sortOrder: true } });
      await prisma.scheduleItem.create({
        data: { ...data, schoolId, sortOrder: (last._max.sortOrder ?? 0) + 10 },
      });
    }
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidate();
  return { ok: id ? "Opgeslagen." : "Toegevoegd." };
}

/** Vast dagonderdeel verwijderen. Bestaande weekplannen houden hun snapshot. */
export async function deleteScheduleItem(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const actor = await requireActor();
  await assertCanManageScheduleItem(prisma, actor, id);
  await prisma.scheduleItem.delete({ where: { id } });
  revalidate();
}
