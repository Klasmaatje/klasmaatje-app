import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import Sidebar from "../components/Sidebar";

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

  return (
    <div className="flex min-h-screen" style={{ background: "#F6F3FC" }}>
      <Sidebar
        userName={session.user.name}
        organizationName={organization?.name ?? ""}
        primaryColor={organization?.primaryColor ?? "#3D2467"}
        accentColor={organization?.accentColor ?? "#E8B44A"}
        microAnalyseLabel={microAnalyseLabel}
      />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}