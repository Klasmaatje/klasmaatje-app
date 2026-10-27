import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanViewWeekPlan, canApproveWeekPlans, canViewWeekPlanOverview, weekPlanScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { resolveDayForGroup } from "@/lib/schedule-items";
import { WEEKDAY_NL, formatPeriode, formatShortDate, weekdayDates } from "@/lib/week";
import { CATEGORY_STYLE } from "../labels";
import StatusBadge from "../status-badge";
import StatusPanel from "./status-panel";
import { DRAFT, canDelete } from "@/lib/weekplan-status";
import { deleteLesson } from "../actions";
import DetailsForm from "./details-form";
import AddLessonForm from "./add-lesson-form";
import DeletePlanButton from "./delete-plan-button";
import DraftButton from "./draft-button";
import { providerLabel } from "@/lib/ai";
import { subjectsFromLessons } from "@/lib/quality";
import ReflectionSection from "../../micro-analyse/reflection-section";
import LessonPackageButton from "./lesson-package-button";

type Entry = {
  id: string;
  time: string;
  label: string;
  category: string;
  hint: string | null;
  goals: { basis: string | null; verlengd: string | null; verrijking: string | null } | null;
  deletable: boolean; // echte Lesson-regel in dit plan
  packageId: string | null; // nieuwste lespakket bij deze les
  canPackage: boolean; // lespakket mogelijk (les of OOM)
};

const PACKAGE_TYPES = ["les", "oom"];

const SNAPSHOT_TYPES = ["routine", "pauze"];

export default async function WeekPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();

  try {
    await assertCanViewWeekPlan(prisma, actor, id);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    throw e;
  }

  const plan = await prisma.weekPlan.findFirst({
    where: { AND: [{ id }, weekPlanScope(actor)] },
    include: {
      classGroup: { select: { id: true, name: true, grades: true } },
      user: { select: { name: true } },
      lessons: {
        select: {
          id: true, dag: true, timeSlot: true, type: true, subject: true,
          goalBasis: true, goalVerlengd: true, goalVerrijking: true,
          lessonPackages: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      reflections: {
        orderBy: { subject: "asc" },
        include: { user: { select: { name: true } }, _count: { select: { usedInClusterPlans: true } } },
      },
      organization: { select: { config: { select: { microAnalyseLabel: true, aiProvider: true } } } },
      school: {
        select: {
          name: true,
          daySchedules: true,
          scheduleItems: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!plan) notFound();

  const membership = await prisma.classGroupMembership.findUnique({
    where: { userId_classGroupId: { userId: actor.userId, classGroupId: plan.classGroupId } },
    select: { id: true },
  });
  const canEdit = Boolean(membership);
  const isDraft = plan.status === DRAFT;
  // Knop "Goedkeuren" alleen voor IB/directie van deze school die zelf geen lid
  // van de groep zijn. De echte controle zit in assertCanApproveWeekPlan.
  const canApproveHere =
    !canEdit &&
    canApproveWeekPlans(actor.role) &&
    (actor.role === "PLATFORM_ADMIN" || actor.schoolId === plan.schoolId);
  // Bij Ingediend en Goedgekeurd is updatedAt het moment van die stap: elke
  // latere wijziging zet het plan terug op Concept.
  const since = isDraft
    ? null
    : new Intl.DateTimeFormat("nl-NL", {
        timeZone: "Europe/Amsterdam",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(plan.updatedAt);

  const days = weekdayDates(plan.periode);
  // Vaste momenten zijn bij het aanmaken als Lesson-regels vastgelegd (snapshot).
  // Oudere plannen zonder snapshot tonen de vaste momenten uit het actuele dagrooster.
  const hasSnapshot = plan.lessons.some((l) => SNAPSHOT_TYPES.includes(l.type));
  const isKleuter = plan.classGroup.grades.some((g) => g <= 2);
  const weeklyItems = plan.school.scheduleItems.filter(
    (i) =>
      i.defaultTime === null &&
      (i.targetGrades.length === 0 || i.targetGrades.some((g) => plan.classGroup.grades.includes(g)))
  );

  function entriesFor(weekday: string): Entry[] {
    const fromPlan: Entry[] = plan!.lessons
      .filter((l) => l.dag === weekday)
      .map((l) => ({
        id: l.id,
        time: l.timeSlot ?? "",
        label: l.subject,
        category: l.type,
        hint: null,
        goals: SNAPSHOT_TYPES.includes(l.type)
          ? null
          : { basis: l.goalBasis, verlengd: l.goalVerlengd, verrijking: l.goalVerrijking },
        deletable: true,
        packageId: l.lessonPackages[0]?.id ?? null,
        canPackage: PACKAGE_TYPES.includes(l.type),
      }));
    let live: Entry[] = [];
    if (!hasSnapshot) {
      const day = plan!.school.daySchedules.find((d) => d.dayOfWeek === weekday);
      if (day) {
        live = resolveDayForGroup(plan!.school.scheduleItems, day, plan!.classGroup.grades).slots.map((s) => ({
          id: `live-${s.item.id}`,
          time: `${s.start}-${s.end}`,
          label: s.item.label,
          category: s.item.category,
          hint: s.item.aiHint,
          goals: null,
          deletable: false,
          packageId: null,
          canPackage: false,
        }));
      }
    }
    return [...live, ...fromPlan].sort((a, b) => a.time.localeCompare(b.time));
  }

  const lessonCount = plan.lessons.filter((l) => !SNAPSHOT_TYPES.includes(l.type)).length;

  return (
    <div className="max-w-6xl">
      {!canEdit && canViewWeekPlanOverview(actor.role) ? (
        <Link href="/weekplannen" className="text-sm" style={{ color: "#8B6FB3" }}>← Weekplannen</Link>
      ) : (
        <Link href="/mijn-week" className="text-sm" style={{ color: "#8B6FB3" }}>← Mijn Week</Link>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-2 mb-1">
        <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>Groep {plan.classGroup.name}</h1>
        <StatusBadge status={plan.status} />
      </div>
      <p className="text-sm mb-6" style={{ color: "#6B5A85" }}>
        {formatPeriode(plan.periode)} · {plan.school.name} · gemaakt door {plan.user.name}
        {!canEdit && " · je kijkt mee (alleen lezen)"}
      </p>

      <StatusPanel
        weekPlanId={plan.id}
        status={plan.status}
        mode={canEdit ? "teacher" : canApproveHere ? "approver" : "viewer"}
        lessonCount={lessonCount}
        since={since}
      />

      <div className="rounded-xl bg-white p-5 mb-4" style={{ border: "1px solid #E8DFF5" }}>
        {canEdit ? (
          <DetailsForm weekPlanId={plan.id} thema={plan.thema} bijzonderheden={plan.bijzonderheden} />
        ) : (
          <div className="text-sm" style={{ color: "#1F1730" }}>
            <p><span className="font-medium">Thema:</span> {plan.thema ?? "nog niet ingevuld"}</p>
            <p className="mt-1 whitespace-pre-line"><span className="font-medium">Bijzonderheden:</span> {plan.bijzonderheden ?? "geen"}</p>
          </div>
        )}
      </div>

      {canEdit && isDraft && (
        <div className="rounded-xl p-5 mb-4" style={{ background: "#FFF9EC", border: "1px solid #F3DFB2" }}>
          <DraftButton
            weekPlanId={plan.id}
            providerLabel={providerLabel(plan.organization.config?.aiProvider)}
          />
        </div>
      )}

      {canEdit && (
        <div className="rounded-xl bg-white p-5 mb-4" style={{ border: "1px solid #E8DFF5" }}>
          <AddLessonForm
            weekPlanId={plan.id}
            days={days.map((d) => ({ key: d.weekday, label: `${WEEKDAY_NL[d.weekday]} ${formatShortDate(d.date)}` }))}
            isKleuter={isKleuter}
          />
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        {days.map(({ weekday, date }) => {
          const day = plan.school.daySchedules.find((d) => d.dayOfWeek === weekday);
          const entries = entriesFor(weekday);
          return (
            <section key={weekday} className="rounded-xl bg-white p-4" style={{ border: "1px solid #E8DFF5" }}>
              <h2 className="font-semibold" style={{ color: "#1F1730" }}>{WEEKDAY_NL[weekday]}</h2>
              <p className="text-xs mb-3" style={{ color: "#6B5A85" }}>
                {formatShortDate(date)}{day ? ` · ${day.startTime}-${day.endTime}` : " · geen school"}
              </p>
              <ul className="flex flex-col gap-1.5">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="group relative rounded-md px-2.5 py-1.5 text-xs"
                    style={CATEGORY_STYLE[e.category] ?? CATEGORY_STYLE.les}
                    title={e.hint ?? undefined}
                  >
                    <div className="pr-5">
                      <span className="font-medium">{e.time}</span> {e.label}
                    </div>
                    {e.goals && (e.goals.basis || e.goals.verlengd || e.goals.verrijking) && (
                      <div className="mt-1" style={{ color: "#4A3B63" }}>
                        {e.goals.basis && <p>{e.goals.basis}</p>}
                        {(e.goals.verlengd || e.goals.verrijking) && (
                          <details className="mt-0.5">
                            <summary className="cursor-pointer" style={{ color: "#8B6FB3" }}>Verlengd en verrijking</summary>
                            {e.goals.verlengd && <p className="mt-0.5"><span className="font-medium">Verlengd: </span>{e.goals.verlengd}</p>}
                            {e.goals.verrijking && <p className="mt-0.5"><span className="font-medium">Verrijking: </span>{e.goals.verrijking}</p>}
                          </details>
                        )}
                      </div>
                    )}
                    {e.canPackage && (e.packageId ? (
                      <a href={`/materiaal/${e.packageId}`} className="mt-1 inline-block underline underline-offset-2" style={{ color: "#3D2467" }}>Lespakket bekijken</a>
                    ) : canEdit ? (
                      <LessonPackageButton lessonId={e.id} />
                    ) : null)}
                    {canEdit && e.deletable && (
                      <form action={deleteLesson} className="absolute right-1 top-1">
                        <input type="hidden" name="weekPlanId" value={plan.id} />
                        <input type="hidden" name="lessonId" value={e.id} />
                        <button
                          type="submit"
                          className="w-5 h-5 rounded text-xs opacity-50 hover:opacity-100"
                          title={`${e.label} weghalen`}
                          aria-label={`${e.label} om ${e.time} weghalen`}
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {weeklyItems.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-4" style={{ border: "1px solid #E8DFF5" }}>
          <h2 className="text-sm font-semibold mb-2" style={{ color: "#1F1730" }}>
            Vaste weeklessen (dag en tijd verschillen per groep; voeg ze toe als les met soort &quot;Vakdocent&quot;)
          </h2>
          <ul className="flex flex-wrap gap-2">
            {weeklyItems.map((i) => (
              <li key={i.id} className="rounded-md px-2.5 py-1.5 text-xs" style={CATEGORY_STYLE.vakles}>{i.label}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm mt-6" style={{ color: "#6B5A85" }}>
        {lessonCount === 0 ? "Nog geen lessen in dit plan. " : `${lessonCount} ${lessonCount === 1 ? "les" : "lessen"} in dit plan. `}
        {hasSnapshot
          ? "De vaste momenten zijn vastgelegd toen dit plan werd gemaakt; latere wijzigingen in het schoolrooster veranderen dit plan niet."
          : "Dit plan toont de vaste momenten uit het actuele dagrooster van de school."}
      </p>

      <ReflectionSection
        weekPlanId={plan.id}
        label={plan.organization.config?.microAnalyseLabel ?? "Micro-analyse"}
        reflections={plan.reflections}
        subjects={subjectsFromLessons(plan.lessons)}
        canEdit={canEdit}
      />

      {canEdit && canDelete(plan.status) && plan.reflections.length === 0 && (
        <div className="mt-8 pt-4" style={{ borderTop: "1px solid #E8DFF5" }}>
          <DeletePlanButton weekPlanId={plan.id} />
        </div>
      )}
    </div>
  );
}
