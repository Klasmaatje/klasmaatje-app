import ReflectionCard, { type ReflectionView } from "./reflection-card";
import ReflectionForm from "./reflection-form";
import { deleteReflection } from "./actions";

// Blok "groepsreflectie" onder een weekplan. Groepsleden schrijven,
// IB/directie/kwaliteit lezen mee.

type Props = {
  weekPlanId: string;
  label: string;
  reflections: (ReflectionView & { _count: { usedInClusterPlans: number } })[];
  subjects: string[];
  canEdit: boolean;
};

export default function ReflectionSection({ weekPlanId, label, reflections, subjects, canEdit }: Props) {
  const reflected = new Set(reflections.map((r) => r.subject));
  const openSubjects = subjects.filter((s) => !reflected.has(s));

  return (
    <section id="reflectie" className="mt-6 rounded-xl bg-white p-5" style={{ border: "1px solid #E8DFF5" }}>
      <p className="text-xs font-medium tracking-wide uppercase" style={{ color: "#8B6FB3" }}>{label}</p>
      <h2 className="font-semibold mb-1" style={{ color: "#1F1730" }}>Terugkijken op deze week</h2>
      <p className="text-sm mb-4" style={{ color: "#6B5A85" }}>
        Groepsreflectie zonder leerlingdata: per vak een korte inschatting per niveau en wat je meeneemt.
        {canEdit ? " Het weekplan blijft zoals het is." : " Je leest mee."}
      </p>

      {reflections.length === 0 && !canEdit && (
        <p className="text-sm" style={{ color: "#6B5A85" }}>Nog geen reflectie bij dit weekplan.</p>
      )}

      <div className="flex flex-col gap-3">
        {reflections.map((r) => (
          <ReflectionCard key={r.id} reflection={r}>
            {canEdit && (
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <details className="flex-1 min-w-64">
                  <summary className="cursor-pointer text-sm font-medium" style={{ color: "#5B4A78" }}>Aanpassen</summary>
                  <div className="mt-3">
                    <ReflectionForm weekPlanId={weekPlanId} subjects={subjects} initial={r} />
                  </div>
                </details>
                {r._count.usedInClusterPlans === 0 ? (
                  <form action={deleteReflection}>
                    <input type="hidden" name="reflectionId" value={r.id} />
                    <button type="submit" className="text-sm" style={{ color: "#6B5A85" }}>Verwijderen</button>
                  </form>
                ) : (
                  <p className="text-xs" style={{ color: "#6B5A85" }}>Basis voor een clusterplan, blijft bewaard.</p>
                )}
              </div>
            )}
          </ReflectionCard>
        ))}
      </div>

      {canEdit && (
        <details className="mt-4" open={reflections.length === 0}>
          <summary className="cursor-pointer text-sm font-medium" style={{ color: "#3D2467" }}>
            {reflections.length === 0 ? "Reflectie toevoegen" : "Reflectie voor een ander vak toevoegen"}
          </summary>
          <div className="mt-3">
            <ReflectionForm weekPlanId={weekPlanId} subjects={openSubjects.length > 0 ? openSubjects : subjects} />
          </div>
        </details>
      )}
    </section>
  );
}
