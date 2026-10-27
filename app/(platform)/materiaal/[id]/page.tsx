import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanViewLessonPackage, lessonPackageScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { LessonPackageSchema } from "@/lib/ai/lesson";
import { formatPeriode } from "@/lib/week";
import { deletePackage } from "../actions";
import PackageView from "../package-view";
import PrintButton from "../print-button";

const INK = "#1F1730";
const MUTED = "#6B5A85";
const dateFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
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
    include: {
      classGroup: { select: { name: true } },
      school: { select: { name: true } },
      createdBy: { select: { name: true } },
      lesson: { select: { dag: true, timeSlot: true, weekPlan: { select: { id: true, periode: true } } } },
    },
  });
  if (!row) notFound();
  const parsed = LessonPackageSchema.safeParse(row.content);
  const membership = await prisma.classGroupMembership.findUnique({
    where: { userId_classGroupId: { userId: actor.userId, classGroupId: row.classGroupId } },
    select: { id: true },
  });
  const checks = Array.isArray(row.checks) ? (row.checks as string[]) : [];

  return (
    <div className="max-w-5xl">
      <Link href="/materiaal" className="text-sm print:hidden" style={{ color: "#8B6FB3" }}>← Materiaal</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-1">
        <div>
          <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "#8B6FB3" }}>Lespakket · concept</p>
          <h1 className="text-2xl font-semibold" style={{ color: INK }}>{parsed.success ? parsed.data.titel : row.subject}</h1>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton label="Lesvoorbereiding afdrukken" />
          <Link href={`/materiaal/${row.id}/werkblad`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: "#3D2467" }}>
            Werkblad voor leerlingen
          </Link>
        </div>
      </div>
      <p className="text-sm mb-1" style={{ color: MUTED }}>
        Groep {row.classGroup.name} · {row.school.name} · {row.subject} · {row.minutes} minuten{row.method ? ` · methode ${row.method}` : ""}
      </p>
      <p className="text-sm mb-1" style={{ color: MUTED }}>Leerdoel gevraagd: {row.learningGoal}</p>
      {row.focus && <p className="text-sm mb-1" style={{ color: MUTED }}>Aandachtspunt uit de groepsreflectie: {row.focus}</p>}
      {row.lesson && (
        <p className="text-sm mb-1" style={{ color: MUTED }}>
          Bij de les in het{" "}
          <Link href={`/mijn-week/${row.lesson.weekPlan.id}`} className="underline print:no-underline">weekplan van {formatPeriode(row.lesson.weekPlan.periode).split(" · ")[0].toLowerCase()}</Link>
          {row.lesson.timeSlot ? ` (${row.lesson.timeSlot})` : ""}
        </p>
      )}
      <p className="text-xs mb-5" style={{ color: MUTED }}>
        Gemaakt door {row.createdBy.name} op {dateFmt.format(row.createdAt)} met {row.provider}. Dit is een concept: controleer de inhoud en de antwoorden voordat je de les geeft.
      </p>

      {checks.length > 0 && (
        <p className="text-sm mb-4 rounded-lg px-3 py-2 print:hidden" style={{ background: "#FFF8E6", color: "#6B4A00" }}>
          Automatische controle: {checks.join(" ")}
        </p>
      )}

      {parsed.success ? (
        <PackageView pkg={parsed.data} grades={row.grades} />
      ) : (
        <p className="text-sm" style={{ color: "#B42318" }}>Dit lespakket kan niet worden getoond.</p>
      )}

      {membership && (
        <form action={deletePackage} className="mt-6 pt-4 print:hidden" style={{ borderTop: "1px solid #E8DFF5" }}>
          <input type="hidden" name="packageId" value={row.id} />
          <button type="submit" className="text-sm underline" style={{ color: MUTED }}>Lespakket verwijderen</button>
        </form>
      )}
    </div>
  );
}
