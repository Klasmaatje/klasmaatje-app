"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanEditGroupReflection, assertCanEditWeekPlan } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { privacyMessage, scanFields } from "@/lib/privacy";
import { allowListForSchool } from "@/lib/school-allowlist";
import { parseLevel } from "@/lib/quality";
import { Prisma } from "@/app/generated/prisma/client";

export type ReflectionFormState = { error?: string; ok?: string } | undefined;

const MAX_SUBJECT = 60;
const MAX_TEXT = 1000;

function revalidateAll(weekPlanId: string) {
  revalidatePath(`/mijn-week/${weekPlanId}`);
  revalidatePath("/micro-analyse");
  revalidatePath("/ib-overzicht");
}

/**
 * Groepsreflectie opslaan (nieuw of wijzigen). Alleen groepsleden.
 * School, groep en bestuur komen uit het weekplan, nooit uit het formulier.
 * Vrije tekst gaat door de privacycontrole, ook op mogelijke namen ("ai"-niveau),
 * omdat reflecties later de basis zijn voor AI-voorstellen (clusterplannen).
 * De reflectie verandert de status van het weekplan niet.
 */
export async function saveReflection(_prev: ReflectionFormState, formData: FormData): Promise<ReflectionFormState> {
  const weekPlanId = String(formData.get("weekPlanId") ?? "");
  const reflectionId = String(formData.get("reflectionId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const basis = parseLevel(formData.get("basis"));
  const verlengd = parseLevel(formData.get("verlengd"));
  const verrijking = parseLevel(formData.get("verrijking"));
  const goed = String(formData.get("goed") ?? "").trim();
  const aandacht = String(formData.get("aandacht") ?? "").trim();
  const vervolg = String(formData.get("vervolg") ?? "").trim();

  if (!subject) return { error: "Kies of typ een vak." };
  if (subject.length > MAX_SUBJECT) return { error: `Vak mag maximaal ${MAX_SUBJECT} tekens zijn.` };
  if ([goed, aandacht, vervolg].some((t) => t.length > MAX_TEXT)) {
    return { error: `Elk tekstveld mag maximaal ${MAX_TEXT} tekens zijn.` };
  }
  if (!basis && !verlengd && !verrijking && !goed && !aandacht && !vervolg) {
    return { error: "Vul minstens een inschatting of een korte tekst in." };
  }

  try {
    const actor = await requireActor();
    const plan = await assertCanEditWeekPlan(prisma, actor, weekPlanId);
    if (reflectionId) {
      const existing = await assertCanEditGroupReflection(prisma, actor, reflectionId);
      if (existing.weekPlanId !== plan.id) throw new AccessError(404, "Reflectie niet gevonden.");
    }

    const privacy = scanFields(
      { Vak: subject, "Wat ging goed": goed, "Wat vraagt aandacht": aandacht, "Wat neem ik mee": vervolg },
      await allowListForSchool(plan.schoolId),
      ["block", "ai"]
    );
    if (privacy.length > 0) return { error: privacyMessage(privacy) };

    const data = {
      subject,
      basis,
      verlengd,
      verrijking,
      goed: goed || null,
      aandacht: aandacht || null,
      vervolg: vervolg || null,
    };
    if (reflectionId) {
      await prisma.groupReflection.update({ where: { id: reflectionId }, data: { ...data, userId: actor.userId } });
    } else {
      await prisma.groupReflection.create({
        data: {
          ...data,
          weekPlanId: plan.id,
          classGroupId: plan.classGroupId,
          schoolId: plan.schoolId,
          organizationId: plan.organizationId,
          userId: actor.userId,
        },
      });
    }
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `Er is deze week al een reflectie voor ${subject}. Pas die aan.` };
    }
    throw e;
  }

  revalidateAll(weekPlanId);
  return { ok: reflectionId ? "Reflectie bijgewerkt." : "Reflectie opgeslagen." };
}

/** Groepsreflectie verwijderen. Alleen groepsleden. */
export async function deleteReflection(formData: FormData): Promise<void> {
  const reflectionId = String(formData.get("reflectionId") ?? "");
  const actor = await requireActor();
  const reflection = await assertCanEditGroupReflection(prisma, actor, reflectionId);
  // Herleidbaarheid: een reflectie die als basis van een clusterplan dient, blijft bestaan.
  if ((await prisma.clusterPlanSource.count({ where: { reflectionId: reflection.id } })) > 0) {
    throw new AccessError(403, "Deze reflectie is de basis van een clusterplan en kan niet worden verwijderd.");
  }
  await prisma.groupReflection.delete({ where: { id: reflection.id } });
  revalidateAll(reflection.weekPlanId);
}
