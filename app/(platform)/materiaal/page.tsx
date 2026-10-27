import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { lessonPackageScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { LessonPackageSchema } from "@/lib/ai/lesson";

// Materiaal: alle lespakketten die je mag zien (eigen groepen; IB/directie de school;
// kwaliteit het bestuur). Het bestuur ziet hier niets (geen operationele details).

const INK = "#1F1730";
const MUTED = "#6B5A85";
const LINE = "#E8DFF5";
const dateFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" });

export default async function MateriaalPage({ searchParams }: { searchParams: Promise<{ groep?: string; vak?: string }> }) {
  const actor = await requireActor();
  const { groep, vak } = await searchParams;
  const rows = await prisma.lessonPackage.findMany({
    where: {
      AND: [
        lessonPackageScope(actor),
        groep ? { classGroupId: groep } : {},
        vak ? { subject: { equals: vak, mode: "insensitive" } } : {},
      ],
    },
    select: {
      id: true, subject: true, learningGoal: true, minutes: true, createdAt: true, provider: true, lessonId: true, content: true,
      classGroup: { select: { id: true, name: true } },
      school: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const groups = [...new Map(rows.map((r) => [r.classGroup.id, r.classGroup.name])).entries()];
  const multiSchool = new Set(rows.map((r) => r.school.code)).size > 1;

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Materiaal</p>
      <h1 className="text-2xl font-semibold" style={{ color: INK }}>Lespakketten</h1>
      <p className="text-sm mt-1 mb-5" style={{ color: MUTED }}>
        Lesvoorbereidingen die Klasmaatje voor je groepen schreef: EDI-opbouw, controle van begrip, drie niveaus en een werkblad met antwoorden.
        Maak een nieuw pakket bij een les in Mijn Week of los in de <Link href="/lesassistent" className="underline">Lesassistent</Link>.
      </p>

      {(groep || vak) && (
        <p className="text-sm mb-4" style={{ color: MUTED }}>
          Filter actief. <Link href="/materiaal" className="underline">Alles tonen</Link>
        </p>
      )}
      {!groep && groups.length > 1 && (
        <nav className="flex flex-wrap gap-2 mb-5" aria-label="Groep kiezen">
          {groups.map(([gid, name]) => (
            <Link key={gid} href={`/materiaal?groep=${gid}`} className="text-xs rounded-full px-3 py-1.5" style={{ border: `1px solid ${LINE}`, color: INK }}>Groep {name}</Link>
          ))}
        </nav>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6" style={{ border: `1px solid ${LINE}` }}>
          <p className="text-sm" style={{ color: MUTED }}>
            Nog geen lespakketten. Klik in Mijn Week bij een les op &quot;Maak lespakket&quot;, of gebruik de Lesassistent.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const parsed = LessonPackageSchema.safeParse(r.content);
            return (
              <li key={r.id}>
                <Link href={`/materiaal/${r.id}`} className="block rounded-xl bg-white p-4 h-full" style={{ border: `1px solid ${LINE}` }}>
                  <p className="text-xs" style={{ color: "#8B6FB3" }}>
                    {multiSchool ? `${r.school.code} · ` : ""}Groep {r.classGroup.name} · {r.subject} · {r.minutes} min
                  </p>
                  <p className="font-semibold mt-1" style={{ color: INK }}>{parsed.success ? parsed.data.titel : r.subject}</p>
                  <p className="text-sm mt-1 line-clamp-2" style={{ color: MUTED }}>{parsed.success ? parsed.data.lesdoel : r.learningGoal}</p>
                  <p className="text-xs mt-2" style={{ color: MUTED }}>
                    {dateFmt.format(r.createdAt)} · {r.provider}{r.lessonId ? " · bij een les in Mijn Week" : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
