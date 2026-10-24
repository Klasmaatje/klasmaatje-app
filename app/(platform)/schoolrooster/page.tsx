import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanManageSchoolSchedule } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { WEEKDAYS, WEEKDAY_NL, type WeekdayKey } from "@/lib/week";
import {
  CATEGORY_OPTIONS,
  describeGrades,
  describeMoment,
  parseMoment,
  previewMoment,
} from "@/lib/schedule-admin";
import DayScheduleForm from "./day-schedule-form";
import { NewScheduleItem, ScheduleItemRow } from "./schedule-item-form";

const SHORT_DAY: Record<string, string> = {
  MONDAY: "ma", TUESDAY: "di", WEDNESDAY: "wo", THURSDAY: "do", FRIDAY: "vr",
};
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Schoolrooster</p>
      <div className="rounded-xl bg-white p-6 mt-2" style={{ border: "1px solid #E8DFF5" }}>
        <p className="font-medium mb-1" style={{ color: "#1F1730" }}>{title}</p>
        <p className="text-sm" style={{ color: "#6B5A85" }}>{text}</p>
      </div>
    </div>
  );
}

/** "elke dag 08:40-08:45" of "ma, di, do, vr 12:30-13:00 · wo vervalt". */
function formatPreview(preview: { weekday: string; slot: string | null }[]): string {
  if (preview.length === 0) return "Geen schooldagen ingesteld.";
  const groups = new Map<string, string[]>();
  for (const p of preview) {
    const key = p.slot ?? "vervalt";
    groups.set(key, [...(groups.get(key) ?? []), SHORT_DAY[p.weekday]]);
  }
  if (groups.size === 1) {
    const [slot] = groups.keys();
    return slot === "vervalt" ? "Valt op geen enkele dag binnen de schooltijden." : `Elke schooldag ${slot}`;
  }
  return [...groups.entries()].map(([slot, days]) => `${days.join(", ")} ${slot}`).join(" · ");
}

export default async function SchoolroosterPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>;
}) {
  const actor = await requireActor();
  const { school: schoolParam } = await searchParams;

  // Schoolleiding beheert de eigen school; Klasmaatje-beheer kiest een school.
  let schoolId = actor.schoolId;
  let schoolChoices: { id: string; name: string }[] = [];
  if (actor.role === "PLATFORM_ADMIN") {
    schoolChoices = await prisma.school.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    schoolId = schoolChoices.find((s) => s.id === schoolParam)?.id ?? schoolId ?? schoolChoices[0]?.id ?? null;
  }
  if (!schoolId) {
    return <Notice title="Geen school gekoppeld" text="Je account hoort (nog) niet bij een school." />;
  }

  try {
    await assertCanManageSchoolSchedule(prisma, actor, schoolId);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    if (e instanceof AccessError) {
      return <Notice title="Geen toegang" text="Alleen de schoolleiding kan het schoolrooster aanpassen." />;
    }
    throw e;
  }

  const school = await prisma.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      daySchedules: true,
      scheduleItems: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
    },
  });

  const days = WEEKDAYS.map((weekday) => {
    const d = school.daySchedules.find((s) => s.dayOfWeek === weekday);
    return {
      weekday,
      label: WEEKDAY_NL[weekday],
      open: Boolean(d),
      startTime: d?.startTime ?? "",
      endTime: d?.endTime ?? "",
      breakStart: d?.breakStart ?? "",
      breakEnd: d?.breakEnd ?? "",
    };
  });
  const scheduleDays = [...school.daySchedules].sort(
    (a, b) => WEEKDAYS.indexOf(a.dayOfWeek as WeekdayKey) - WEEKDAYS.indexOf(b.dayOfWeek as WeekdayKey)
  );

  return (
    <div className="max-w-4xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Schoolrooster</p>
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1F1730" }}>{school.name}</h1>
      <p className="text-sm mb-4" style={{ color: "#6B5A85" }}>
        Schooltijden en vaste dagonderdelen van de school. Klasmaatje zet de vaste momenten automatisch in elk nieuw weekplan.
      </p>

      {schoolChoices.length > 1 && (
        <form method="get" className="flex items-end gap-2 mb-4">
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
            School
            <select name="school" defaultValue={school.id} className="rounded-lg border px-3 py-2 text-sm bg-white"
              style={{ borderColor: "#D9CCEE", color: "#1F1730" }}>
              {schoolChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "#EEE7F9", color: "#3D2467" }}>
            Tonen
          </button>
        </form>
      )}

      <div className="rounded-xl p-4 mb-6 text-sm" style={{ background: "#FFF9EC", border: "1px solid #F3DFB2", color: "#5C4300" }}>
        Wijzigingen gelden voor nieuwe weekplannen. Bestaande weekplannen houden de tijden van het moment waarop ze zijn gemaakt;
        de leerkracht kan daarin zelf een moment weghalen of een les toevoegen.
      </div>

      <section className="rounded-xl bg-white p-6 mb-6" style={{ border: "1px solid #E8DFF5" }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "#1F1730" }}>Schooltijden</h2>
        <DayScheduleForm schoolId={school.id} days={days} />
      </section>

      <section className="rounded-xl bg-white p-6 mb-6" style={{ border: "1px solid #E8DFF5" }}>
        <h2 className="text-sm font-semibold mb-1" style={{ color: "#1F1730" }}>Vaste dagonderdelen</h2>
        <p className="text-sm mb-2" style={{ color: "#6B5A85" }}>
          Momenten die elke dag of elke week terugkomen. Tijden bewegen mee met de schooltijden, ook op een korte dag.
        </p>
        {school.scheduleItems.length === 0 && (
          <p className="text-sm py-4" style={{ color: "#A08DBD" }}>Nog geen vaste dagonderdelen.</p>
        )}
        <div>
          {school.scheduleItems.map((item, i) => (
            <div key={item.id} style={i > 0 ? { borderTop: "1px solid #F0EAF8" } : undefined}>
              <ScheduleItemRow
                schoolId={school.id}
                values={{
                  id: item.id,
                  label: item.label,
                  category: item.category,
                  aiHint: item.aiHint ?? "",
                  grades: item.targetGrades,
                  moment: parseMoment(item.defaultTime),
                }}
                summary={{
                  moment: describeMoment(item.defaultTime),
                  grades: describeGrades(item.targetGrades),
                  category: CATEGORY_LABEL[item.category] ?? item.category,
                }}
                preview={
                  item.defaultTime === null
                    ? "Dag en tijd per groep; de leerkracht zet deze les zelf in het weekplan."
                    : formatPreview(previewMoment(item.defaultTime, scheduleDays))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white p-6" style={{ border: "1px solid #E8DFF5" }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "#1F1730" }}>Dagonderdeel toevoegen</h2>
        <NewScheduleItem
          schoolId={school.id}
          values={{
            label: "",
            category: "routine",
            aiHint: "",
            grades: [],
            moment: { kind: "start", offset: 0, clock: "10:15", duration: 15 },
          }}
        />
      </section>
    </div>
  );
}
