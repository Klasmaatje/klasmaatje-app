"use client";

import { useActionState, useState } from "react";
import {
  evaluateClusterPlan, fixClusterPlan, proposeEvaluation, regenerateClusterDraft, updateClusterPlan,
  type ClusterFormState, type EvaluationProposalState,
} from "../actions";
import { CLUSTERS, EFFECTS, EFFECT_LABEL, UITVOERING_LABEL, VERVOLGBESLUITEN, VERVOLG_LABEL } from "@/lib/quality";

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const labelStyle = { color: "#6B5A85" };

function Feedback({ state }: { state: ClusterFormState }) {
  if (state?.error) return <p className="text-sm" style={{ color: "#B42318" }} role="alert">{state.error}</p>;
  if (state?.ok) return <p className="text-sm" style={{ color: "#1E6B47" }} role="status">{state.ok}</p>;
  return null;
}

type Content = Record<"analyse" | "intensiefDoel" | "intensiefAanpak" | "basisDoel" | "basisAanpak" | "verrijkingDoel" | "verrijkingAanpak", string | null>;

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
      <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
        Groepsanalyse: beginsituatie, wat beheerst is en wat nog niet, onderwijsbehoefte, vermoedelijke verklaring
        <textarea name="analyse" rows={5} maxLength={2000} defaultValue={content.analyse ?? ""}
          className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
      </label>
      <div className="grid gap-3 lg:grid-cols-3">
        {CLUSTERS.map((c) => (
          <fieldset key={c.key} className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
            <legend className="text-sm font-semibold px-1" style={{ color: "#1F1730" }}>{c.label}</legend>
            <p className="text-xs" style={labelStyle}>{c.hint}</p>
            {(["Doel", "Aanpak"] as const).map((part) => {
              const name = `${c.key}${part}` as keyof Content;
              return (
                <label key={name} className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
                  {part === "Doel" ? "Doelen (met succescriterium en meetwijze)" : "Aanpak (basisaanbod en OOM; wie, hoe vaak, hoe lang)"}
                  <textarea name={name} rows={7} maxLength={2000} defaultValue={content[name] ?? ""}
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

export function RegenerateClusterButton({ id, aiLabel }: { id: string; aiLabel: string }) {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(regenerateClusterDraft, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="clusterPlanId" value={id} />
      <button type="submit" disabled={pending} className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        style={{ border: "1px solid #3D2467", color: "#3D2467" }}
        title="Overschrijft de analyse en de clusters van dit concept">
        {pending ? "Bezig..." : "Concept opnieuw laten schrijven"}
      </button>
      <span className="text-xs" style={labelStyle}>
        {pending ? "Klasmaatje schrijft het concept. Dit duurt ongeveer een minuut." : `Schrijver: ${aiLabel}. Overschrijft analyse en clusters.`}
      </span>
      <Feedback state={state} />
    </form>
  );
}

export function EvaluateClusterForm({ id, weeks, aiLabel }: { id: string; weeks: { key: string; label: string }[]; aiLabel: string }) {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(evaluateClusterPlan, undefined);
  const [proposal, proposeAction, proposing] = useActionState<EvaluationProposalState, FormData>(proposeEvaluation, undefined);
  const [vervolg, setVervolg] = useState<string>("");
  return (
    <div className="flex flex-col gap-4">
      <form action={proposeAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="clusterPlanId" value={id} />
        <button type="submit" disabled={proposing} className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          style={{ border: "1px solid #3D2467", color: "#3D2467" }}>
          {proposing ? "Bezig..." : "Evaluatie laten voorstellen"}
        </button>
        <span className="text-xs" style={labelStyle}>
          {proposing
            ? "Klasmaatje zet op een rij wat de reflecties in de looptijd laten zien. Dit duurt ongeveer een minuut."
            : `Schrijver: ${aiLabel}. Vat de groepsreflecties in de looptijd samen; het oordeel blijft bij jullie.`}
        </span>
        {proposal?.error && <p className="text-sm" style={{ color: "#B42318" }} role="alert">{proposal.error}</p>}
      </form>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="clusterPlanId" value={id} />
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Wat zie je terug? Gerealiseerde inzet, nieuw bewijs (toets, observatie, leerlingwerk, reflecties) en vergelijking met de doelen.
          <textarea key={proposal?.text ?? "leeg"} name="evaluatie" rows={7} maxLength={2000} required defaultValue={proposal?.text ?? ""}
            className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}
            placeholder="Bijvoorbeeld: drie OOM-momenten per week gerealiseerd; methodetoets blok 3 laat zien dat het intensieve cluster gelijknamig maken nu beheerst." />
        </label>
        {proposal?.text && <p className="text-xs" style={{ color: "#8A5A00" }}>Concept van {proposal.source}. Lees na, vul aan met toets- en observatiegegevens en pas aan.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium mb-1" style={labelStyle}>Is de aanpak uitgevoerd?</legend>
            {EFFECTS.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm" style={{ color: "#1F1730" }}>
                <input type="radio" name="uitvoering" value={e} required /> {UITVOERING_LABEL[e]}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium mb-1" style={labelStyle}>Had de aanpak effect? (jullie professionele oordeel)</legend>
            {EFFECTS.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm" style={{ color: "#1F1730" }}>
                <input type="radio" name="effect" value={e} required /> {EFFECT_LABEL[e]}
              </label>
            ))}
          </fieldset>
        </div>
        <p className="text-xs" style={labelStyle}>Bij onvoldoende uitvoering herstel je eerst de uitvoering; bij goede uitvoering zonder effect onderzoek je verklaring en aanpak opnieuw.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
            Vervolgbesluit
            <select name="vervolgbesluit" required value={vervolg} onChange={(e) => setVervolg(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
              <option value="" disabled>Kies...</option>
              {VERVOLGBESLUITEN.map((v) => <option key={v} value={v}>{VERVOLG_LABEL[v]}</option>)}
            </select>
          </label>
          {vervolg !== "AFRONDEN" && (
            <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
              Volgende controle
              <select name="volgendeControle" defaultValue={weeks[4]?.key} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
                {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "#3D2467" }}>
            {pending ? "Bezig..." : "Evaluatie vastleggen"}
          </button>
          <Feedback state={state} />
        </div>
      </form>
    </div>
  );
}
