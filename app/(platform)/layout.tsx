import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { getActor } from "../../lib/current-actor";
import Sidebar from "../components/Sidebar";

const ROLE_LABEL: Record<string, string> = {
  TEACHER: "Leerkracht",
  IB: "Intern begeleider",
  SCHOOL_ADMIN: "Schoolleiding",
  QUALITY_STAFF: "Kwaliteitsmedewerker",
  BOARD: "Bestuur",
  PLATFORM_ADMIN: "Beheer Klasmaatje",
};

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const organization = session.user.organizationId
    ? await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        include: { config: true },
      })
    : null;

  const microAnalyseLabel = organization?.config?.microAnalyseLabel ?? "Micro-analyse";

  // Rol vers uit de database (niet uit de sessie); bepaalt alleen welke
  // menu-items zichtbaar zijn. De echte toegangscheck zit op elke pagina.
  const actor = await getActor();
  const canManageGroups = actor?.role === "SCHOOL_ADMIN" || actor?.role === "PLATFORM_ADMIN";
  const roleLabel = actor ? ROLE_LABEL[actor.role] : undefined;

  return (
    <div className="flex min-h-screen" style={{ background: "#F6F3FC" }}>
      <Sidebar
        userName={session.user.name}
        roleLabel={roleLabel}
        organizationName={organization?.name ?? ""}
        primaryColor={organization?.primaryColor ?? "#3D2467"}
        accentColor={organization?.accentColor ?? "#E8B44A"}
        microAnalyseLabel={microAnalyseLabel}
        canManageGroups={canManageGroups}
      />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}