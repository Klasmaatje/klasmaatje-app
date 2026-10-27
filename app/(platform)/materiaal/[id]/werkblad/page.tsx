import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanViewLessonPackage, lessonPackageScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { LessonPackageSchema } from "@/lib/ai/lesson";
import { niveauLabels } from "../../package-view";
import PrintButton from "../../print-button";

// Afdrukbaar werkblad: per niveau een eigen blad zonder antwoorden, daarna een antwoordblad voor de leerkracht.

const INK = "#1F1730";

export default async function WorksheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  try {
    await assertCanViewLessonPackage(prisma, actor, id);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    throw e;
  }
  const row = await prisma.lessonPackage.findFirst({
    where: { AND: [{ id }, lessonPackageScope(actor)] },
    select: { id: true, content: true, grades: true, classGroup: { select: { name: true } } },
  });
  if (!row) notFound();
  const parsed = LessonPackageSchema.safeParse(row.content);
  if (!parsed.success) notFound();
  const pkg = parsed.data;
  const lab = niveauLabels(row.grades);
  const levels = (["intensief", "basis", "verrijking"] as const).filter((n) => pkg.werkblad.some((w) => w.niveau === n));

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
        <Link href={`/materiaal/${row.id}`} className="text-sm" style={{ color: "#8B6FB3" }}>← Lespakket</Link>
        <PrintButton label="Werkbladen afdrukken" />
      </div>
      <p className="text-sm mb-6 print:hidden" style={{ color: "#6B5A85" }}>
        Elk niveau komt op een eigen blad; het antwoordblad is voor de leerkracht. Controleer de opdrachten voordat je afdrukt.
      </p>

      {levels.map((n) => (
        <section key={n} className="bg-white rounded-xl p-8 mb-6 print:rounded-none print:p-0 print:mb-0 print:break-after-page" style={{ border: "1px solid #E8DFF5" }}>
          <div className="flex justify-between text-sm mb-6" style={{ color: INK }}>
            <span>Naam: ______________________</span>
            <span>Groep {row.classGroup.name} · {lab[n]}</span>
          </div>
          <h1 className="text-xl font-semibold mb-1" style={{ color: INK }}>{pkg.titel}</h1>
          <p className="text-sm mb-6" style={{ color: INK }}>{pkg.lesdoel}</p>
          <ol className="list-decimal pl-6 flex flex-col gap-8 text-base" style={{ color: INK }}>
            {pkg.werkblad.filter((w) => w.niveau === n).map((w, i) => (
              <li key={i}>
                <p>{w.opdracht}</p>
                <div className="mt-6 border-b" style={{ borderColor: "#BBB" }} />
                <div className="mt-6 border-b" style={{ borderColor: "#BBB" }} />
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="bg-white rounded-xl p-8 print:rounded-none print:p-0" style={{ border: "1px solid #E8DFF5" }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: INK }}>Antwoordblad (leerkracht) · {pkg.titel}</h2>
        {levels.map((n) => (
          <div key={n} className="mb-4">
            <p className="font-semibold text-sm mb-1" style={{ color: INK }}>{lab[n]}</p>
            <ol className="list-decimal pl-6 text-sm" style={{ color: INK }}>
              {pkg.werkblad.filter((w) => w.niveau === n).map((w, i) => <li key={i}>{w.antwoord}</li>)}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}
