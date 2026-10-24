import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canViewWeekPlanOverview, classGroupScope, weekPlanScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { formatPeriode, schoolYearOf, todayInNetherlands, upcomingWeeks } from "@/lib/week";
import NewPlanForm from "./new-plan-form";
import { STATUS_LABEL } from "./labels";

export default async function MijnWeekPage() {
  const actor = await requireActor();
  const today = todayInNetherlands();
  const schoolYear = schoolYearOf(today);

  // "Mijn groepen" = groepen waar ik lid van ben, binnen mijn scope.
  const groups = await prisma.classGroup.findMany({
    where: {
      AND: [
        classGroupScope(actor),
        { schoolYear },
        { memberships: { some: { userId: actor.userId } } },
      ],
    },
    include: {
      school: { select: { name: true } },
      weekPlans: {
        where: weekPlanScope(actor),
        orderBy: { periode: "desc" },
        take: 8,
        select: { id: true, periode: true, status: true, thema: true },
      },
    },
  });
  groups.sort((a, b) => a.name.localeCompare(b.name, "nl", { numeric: true }));

  const weeks = upcomingWeeks(today, 4);
  const canManage = actor.role === "SCHOOL_ADMIN" || actor.role === "PLATFORM_ADMIN";

  return (
    <div className="max-w-4xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Mijn Week</p>
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1F1730" }}>Mijn groepen</h1>
      <p className="text-sm mb-6" style={{ color: "#6B5A85" }}>Schooljaar {schoolYear}. Een nieuw weekplan start altijd als concept.</p>

      {groups.length === 0 && (
        <div className="rounded-xl bg-white p-6" style={{ border: "1px solid #E8DFF5" }}>
          <p className="font-medium mb-1" style={{ color: "#1F1730" }}>Je bent nog niet aan een groep gekoppeld.</p>
          <p className="text-sm" style={{ color: "#6B5A85" }}>
            {canManage ? (
              <>Koppel jezelf of een collega aan een groep via <Link href="/groepen" className="underline">Groepen</Link>.</>
            ) : canViewWeekPlanOverview(actor.role) ? (
              <>Meekijken met de weekplannen van de groepen kan via <Link href="/weekplannen" className="underline">Weekplannen</Link>.</>
            ) : (
              <>De schoolleiding koppelt je aan je groep. Daarna zie je hier je groep en kun je een weekplan maken.</>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const taken = new Set(g.weekPlans.map((p) => p.periode));
          const freeWeeks = weeks.filter((w) => !taken.has(w.key));
          return (
            <section key={g.id} className="rounded-xl bg-white p-6" style={{ border: "1px solid #E8DFF5" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold" style={{ color: "#1F1730" }}>Groep {g.name}</h2>
                <p className="text-sm" style={{ color: "#6B5A85" }}>{g.school.name}</p>
              </div>

              {g.weekPlans.length > 0 ? (
                <ul className="flex flex-col gap-2 mb-5">
                  {g.weekPlans.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/mijn-week/${p.id}`}
                        className="flex items-center justify-between rounded-lg px-4 py-3 hover:opacity-90"
                        style={{ background: "#F6F3FC" }}
                      >
                        <span className="text-sm font-medium" style={{ color: "#1F1730" }}>
                          {formatPeriode(p.periode)}
                          {p.thema && <span className="font-normal" style={{ color: "#6B5A85" }}> · {p.thema}</span>}
                        </span>
                        <span className="text-xs font-medium rounded-full px-2.5 py-1" style={{ background: "#FFF4DC", color: "#8A5A00" }}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm mb-5" style={{ color: "#6B5A85" }}>Nog geen weekplannen voor deze groep.</p>
              )}

              <NewPlanForm classGroupId={g.id} weeks={freeWeeks} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
