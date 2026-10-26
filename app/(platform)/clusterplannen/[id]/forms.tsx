"use client";

import { useActionState } from "react";
import { evaluateClusterPlan, fixClusterPlan, updateClusterPlan, type ClusterFormState } from "../actions";
import { CLUSTERS, EFFECTS, EFFECT_LABEL } from "@/lib/quality";

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const labelStyle = { color: "#6B5A85" };

function Feedback({ state }: { state: ClusterFormState }) {
  if (state?.error) return <p className="text-sm" style={{ color: "#B42318" }} role="alert">{state.error}</p>;
  if (state?.ok) return <p className="text-sm" style={{ color: "#1E6B47" }} role="status">{state.ok}</p>;
  return null;
}

type Content = Record<"intensiefDoel" | "intensiefAanpak" | "basisDoel" | "basisAanpak" | "verrijkingDoel" | "verrijkingAanpak", string | null>;

export function EditClusterForm({
  id, content, startPeriode, evaluatiePeriode, qualityGoalId, weeks, goals, isFixed,
}: {
  id: string;
  content: Content;
  startPeriode: string;
  evaluatiePeriode: string;
  qualityGoalId: string | null;
  weeks: { key: string; label: string }[];
  goals: { id: string; title: string }[];
  isFixed: boolean;
}) {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(updateClusterPlan, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="clusterPlanId" value={id} />
      <div className="grid gap-3 lg:grid-cols-3">
        {CLUSTERS.map((c) => (
          <fieldset key={c.key} className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
            <legend className="text-sm font-semibold px-1" style={{ color: "#1F1730" }}>{c.label}</legend>
            <p className="text-xs" style={labelStyle}>{c.hint}</p>
            {(["Doel", "Aanpak"] as const).map((part) => {
              const name = `${c.key}${part}` as keyof Content;
              return (
                <label key={name} className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
                  {part}
                  <textarea name={name} rows={5} maxLength={1000} defaultValue={content[name] ?? ""}
                    className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Startweek
          <select name="startPeriode" defaultValue={startPeriode} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Evaluatieweek
          <select name="evaluatiePeriode" defaultValue={evaluatiePeriode} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Kwaliteitsdoel
          <select name="qualityGoalId" defaultValue={qualityGoalId ?? ""} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            <option value="">Geen kwaliteitsdoel</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs" style={{ color: "#8A5A00" }}>
        Privacy: beschrijf clusters op groepsniveau, zonder namen van leerlingen.
        {isFixed && " Let op: opslaan zet een vastgesteld plan terug op concept."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "#3D2467" }}>
          {pending ? "Bezig..." : "Opslaan"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function FixClusterButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(fixClusterPlan, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="clusterPlanId" value={id} />
      <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "#1E6B47" }}>
        {pending ? "Bezig..." : "Vaststellen"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function EvaluateClusterForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(evaluateClusterPlan, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="clusterPlanId" value={id} />
      <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
        Wat zie je terug? (groepsniveau, met de bron: toets, observatie of reflecties)
        <textarea name="evaluatie" rows={4} maxLength={1000} required className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}
          placeholder="Bijvoorbeeld: methodetoets blok 3 laat zien dat het intensieve cluster gelijknamig maken nu beheerst; verrijking kan door." />
      </label>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="text-xs font-medium mb-1" style={labelStyle}>Had de aanpak effect? (jouw professionele oordeel)</legend>
        {EFFECTS.map((e) => (
          <label key={e} className="flex items-center gap-2 text-sm" style={{ color: "#1F1730" }}>
            <input type="radio" name="effect" value={e} required /> {EFFECT_LABEL[e]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "#3D2467" }}>
          {pending ? "Bezig..." : "Evaluatie opslaan"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
