"use server";

// Lespakketten (EDI-lesvoorbereiding door AI). Altijd een concept: de leerkracht
// controleert en past aan. Alleen groepsleden maken en verwijderen een pakket.
// Naar de AI gaat alleen groepsinformatie die door de privacycontrole is gegaan.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanEditClassGroupContent, assertCanManageLessonPackage, groupReflectionScope, weekPlanScope, type Actor } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { privacyMessage, scanFields } from "@/lib/privacy";
import { allowListForSchool } from "@/lib/school-allowlist";
import { toMinutes } from "@/lib/schedule-items";
import { AiNotConfiguredError, generateLessonPackage, pickProvider } from "@/lib/ai";
import type { LessonRequest } from "@/lib/ai/lesson";

export type PackageFormState = { error?: string } | undefined;

const MAX_GOAL = 300;
const MAX_FOCUS = 300;
const MAX_SUBJECT = 60;
const MAX_METHOD = 80;

async function providerFor(organizationId: string) {
  const config = await prisma.schoolConfig.findUnique({ where: { organizationId }, select: { aiProvider: true } });
  return pickProvider(config?.aiProvider);
}

/** Laatste aandachtspunt uit een groepsreflectie op dit vak (groepsniveau), als aanknopingspunt. */
async function latestFocus(actor: Actor, classGroupId: string, subject: string): Promise<string | null> {
  const r = await prisma.groupReflection.findFirst({
    where: { AND: [groupReflectionScope(actor), { classGroupId, subject: { equals: subject, mode: "insensitive" } }, { aandacht: { not: null } }] },
    orderBy: { weekPlan: { periode: "desc" } },
    select: { aandacht: true },
  });
  return r?.aandacht?.trim().slice(0, MAX_FOCUS) || null;
}

/** Maakt het pakket en slaat het op. Geeft het id terug, of een foutmelding. */
async function makePackage(
  actor: Actor,
  group: { id: string; schoolId: string; organizationId: string },
  request: LessonRequest,
  lessonId: string | null
): Promise<{ id?: string; error?: string }> {
  const privacy = scanFields(
    { Vak: request.subject, Leerdoel: request.learningGoal, Methode: request.method ?? "", Aandachtspunt: request.focus ?? "" },
    await allowListForSchool(group.schoolId),
    ["block", "ai"]
  );
  if (privacy.length > 0) return { error: privacyMessage(privacy) };

  let result;
  try {
    const provider = await providerFor(group.organizationId);
    try {
      result = await generateLessonPackage(request, provider);
    } catch (e) {
      if (e instanceof AiNotConfiguredError) throw e;
      console.error("Lespakket: eerste poging mislukt, nog een keer:", e instanceof Error ? e.message : e);
      result = await generateLessonPackage(request, provider);
    }
    const pkg = await prisma.lessonPackage.create({
      data: {
        organizationId: group.organizationId,
        schoolId: group.schoolId,
        classGroupId: group.id,
        lessonId,
        createdById: actor.userId,
        grades: request.grades,
        subject: request.subject,
        learningGoal: request.learningGoal,
        method: request.method,
        minutes: request.minutes,
        focus: request.focus,
        content: result.pkg,
        checks: result.notes,
        provider: result.provider,
        model: provider.model,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
      },
      select: { id: true },
    });
    return { id: pkg.id };
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return { error: "De AI is voor dit bestuur nog niet ingesteld." };
    console.error("Lespakket mislukt:", e instanceof Error ? e.message : e);
    return { error: "De AI kon nu geen lespakket maken. Probeer het over een minuut opnieuw." };
  }
}

/** "09:00-10:00" -> 60; onbekend -> 45. Begrensd op 10-180 minuten. */
function minutesFromSlot(slot: string | null): number {
  const m = slot ? /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(slot) : null;
  const n = m ? toMinutes(m[2]) - toMinutes(m[1]) : 45;
  return Math.min(180, Math.max(10, Number.isFinite(n) ? n : 45));
}

/** Mijn Week: lespakket bij een les. Alles is al bekend; de leerkracht vult niets in. */
export async function createPackageForLesson(_prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const lessonId = String(formData.get("lessonId") ?? "");
  let id: string | undefined;
  try {
    const actor = await requireActor();
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, weekPlan: weekPlanScope(actor) },
      select: {
        id: true, subject: true, timeSlot: true, goalBasis: true, type: true,
        weekPlan: { select: { classGroupId: true, method: { select: { name: true } }, classGroup: { select: { grades: true } } } },
      },
    });
    if (!lesson) return { error: "Les niet gevonden." };
    const group = await assertCanEditClassGroupContent(prisma, actor, lesson.weekPlan.classGroupId);
    const subject = lesson.subject.trim().slice(0, MAX_SUBJECT);
    const request: LessonRequest = {
      grades: lesson.weekPlan.classGroup.grades,
      subject,
      learningGoal: (lesson.goalBasis?.trim() || `Lesdoel ${subject.toLowerCase()}`).slice(0, MAX_GOAL),
      method: lesson.weekPlan.method?.name ?? null,
      minutes: minutesFromSlot(lesson.timeSlot),
      focus: await latestFocus(actor, group.id, subject),
    };
    const res = await makePackage(actor, group, request, lesson.id);
    if (res.error) return { error: res.error };
    id = res.id;
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
  revalidatePath("/materiaal");
  redirect(`/materiaal/${id}`);
}

/** Lesassistent: los een les laten maken (groep, vak, leerdoel). */
export async function createPackage(_prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const classGroupId = String(formData.get("classGroupId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const learningGoal = String(formData.get("learningGoal") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim();
  const focus = String(formData.get("focus") ?? "").trim();
  const minutes = Number(formData.get("minutes"));
  if (!subject || subject.length > MAX_SUBJECT) return { error: `Vul een vak in (maximaal ${MAX_SUBJECT} tekens).` };
  if (!learningGoal || learningGoal.length > MAX_GOAL) return { error: `Vul een leerdoel in (maximaal ${MAX_GOAL} tekens).` };
  if (method.length > MAX_METHOD || focus.length > MAX_FOCUS) return { error: "Methode of aandachtspunt is te lang." };
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 180) return { error: "Kies een lesduur tussen 10 en 180 minuten." };

  let id: string | undefined;
  try {
    const actor = await requireActor();
    const group = await assertCanEditClassGroupContent(prisma, actor, classGroupId);
    const grades = (await prisma.classGroup.findUniqueOrThrow({ where: { id: group.id }, select: { grades: true } })).grades;
    const res = await makePackage(actor, group, { grades, subject, learningGoal, method: method || null, minutes, focus: focus || null }, null);
    if (res.error) return { error: res.error };
    id = res.id;
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
  revalidatePath("/materiaal");
  redirect(`/materiaal/${id}`);
}

/** Lespakket verwijderen (groepsleden). */
export async function deletePackage(formData: FormData): Promise<void> {
  const id = String(formData.get("packageId") ?? "");
  const actor = await requireActor();
  const pkg = await assertCanManageLessonPackage(prisma, actor, id);
  await prisma.lessonPackage.delete({ where: { id: pkg.id } });
  revalidatePath("/materiaal");
  redirect("/materiaal");
}
