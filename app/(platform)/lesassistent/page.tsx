import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/current-actor";
import { providerLabel } from "@/lib/ai";
import PackageForm from "./package-form";

// Lesassistent: los een les laten maken voor een eigen groep (groep + vak + leerdoel).
// In Mijn Week kan het met één klik bij een geplande les.

export default async function LesassistentPage() {
  const actor = await requireActor();
  const groups = await prisma.classGroup.findMany({
    where: { memberships: { some: { userId: actor.userId } }, organizationId: actor.organizationId ?? "" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const config = actor.organizationId
    ? await prisma.schoolConfig.findUnique({ where: { organizationId: actor.organizationId }, select: { aiProvider: true } })
    : null;

  return (
    <div className="max-w-3xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Lesassistent</p>
      <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>Les laten voorbereiden</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "#6B5A85" }}>
        Kies groep, vak en leerdoel. Klasmaatje schrijft een EDI-les met succescriteria, tijdsindeling, controle van begrip,
        drie niveaus en een werkblad met antwoorden. Het is een concept: jij controleert en past aan.
        Tip: in <Link href="/mijn-week" className="underline">Mijn Week</Link> kan het met één klik bij een geplande les.
      </p>
      {groups.length === 0 ? (
        <div className="rounded-xl bg-white p-6" style={{ border: "1px solid #E8DFF5" }}>
          <p className="text-sm" style={{ color: "#6B5A85" }}>
            Je bent nog niet aan een groep gekoppeld. Een lespakket hoort bij een groep; vraag je directie om je te koppelen.
            Gemaakte lespakketten van de school vind je bij <Link href="/materiaal" className="underline">Materiaal</Link>.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white p-5" style={{ border: "1px solid #E8DFF5" }}>
          <PackageForm groups={groups.map((g) => ({ id: g.id, label: `Groep ${g.name}` }))} aiLabel={providerLabel(config?.aiProvider)} />
        </div>
      )}
    </div>
  );
}
