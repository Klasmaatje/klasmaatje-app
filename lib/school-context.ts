import { prisma } from "./prisma";

export async function getSchoolConfigBySlug(slug: string) {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug },
    include: { config: true },
  });

  const config = organization.config ?? {
    aiProvider: "gemini",
    microAnalyseLabel: "Micro-analyse",
    qualityFramework: "SLO-kerndoelen",
  };

  return { organization, config };
}
