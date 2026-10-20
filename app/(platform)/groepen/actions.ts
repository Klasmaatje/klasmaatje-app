"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  AccessError,
  assertCanAddGroupMember,
  assertCanManageSchoolGroups,
  classGroupScope,
} from "@/lib/access";
import { requireActor } from "@/lib/current-actor";

export type MemberFormState = { error?: string; ok?: string } | undefined;

const GROUP_ROLES = ["GROUP_TEACHER", "SUBSTITUTE"] as const;
type GroupRole = (typeof GROUP_ROLES)[number];

/** Leerkracht aan een groep koppelen (alleen schoolleiding van die school). */
export async function addGroupMember(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const classGroupId = String(formData.get("classGroupId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const roleInput = String(formData.get("role") ?? "GROUP_TEACHER");
  const role: GroupRole = (GROUP_ROLES as readonly string[]).includes(roleInput)
    ? (roleInput as GroupRole)
    : "GROUP_TEACHER";
  if (!classGroupId || !userId) return { error: "Kies een groep en een collega." };

  try {
    const actor = await requireActor();
    await assertCanAddGroupMember(prisma, actor, classGroupId, userId);
    await prisma.classGroupMembership.upsert({
      where: { userId_classGroupId: { userId, classGroupId } },
      update: { role },
      create: { userId, classGroupId, role },
    });
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }

  revalidatePath("/groepen");
  revalidatePath("/mijn-week");
  return { ok: "Gekoppeld." };
}

/** Koppeling tussen leerkracht en groep opheffen (alleen schoolleiding). */
export async function removeGroupMember(formData: FormData): Promise<void> {
  const classGroupId = String(formData.get("classGroupId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  const actor = await requireActor();
  const group = await prisma.classGroup.findFirst({
    where: { AND: [{ id: classGroupId }, classGroupScope(actor)] },
    select: { schoolId: true },
  });
  if (!group) throw new AccessError(404, "Groep niet gevonden.");
  await assertCanManageSchoolGroups(prisma, actor, group.schoolId);

  await prisma.classGroupMembership.deleteMany({ where: { userId, classGroupId } });

  revalidatePath("/groepen");
  revalidatePath("/mijn-week");
}
