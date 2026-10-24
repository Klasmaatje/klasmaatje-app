// Bekende begrippen van een school voor de privacycontrole (lib/privacy.ts):
// basislijst + de methodes van de school + de schoolnaam. Alleen server-side.

import { prisma } from "./prisma";
import { buildAllowList } from "./privacy";

export async function allowListForSchool(schoolId: string) {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true, methods: { select: { method: { select: { name: true, publisher: true } } } } },
  });
  const extra = [
    school?.name ?? "",
    ...(school?.methods ?? []).flatMap((m) => [m.method.name, m.method.publisher ?? ""]),
  ];
  return buildAllowList(extra);
}
