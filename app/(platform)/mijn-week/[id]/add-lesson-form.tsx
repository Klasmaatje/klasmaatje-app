"use client";

import { useActionState, useState } from "react";
import { addLesson, type FormState } from "../actions";

type Props = {
  weekPlanId: string;
  days: { key: string; label: string }[];
  isKleuter: boolean;
};

const VAKKEN_KLEUTER = [
  "Kring", "Spelen en werken", "Leerkring taal", "Leerkring rekenen", "Spel en beweging",
  "Muziek", "Burgerschap", "KiVa", "Engels",
];
const VAKKEN = [
  "Rekenen", "Taal", "Spelling", "Technisch lezen", "Begrijpend lezen", "Schrijven",
  "Wereldoriëntatie", "Engels", "Burgerschap", "KiVa", "Verkeer", "Expressie", "Muziek",
  "Werktijd OOM", "Digitale geletterdheid",
];

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const labelClass = "flex flex-col gap-1 text-xs font-medium";
const inputClass = "rounded-lg border px-3 py-2 text-sm bg-white";

const EMPTY = { start: "", end: "", subject: "", type: "les", goalBasis: "", goalVerlengd: "", goalVerrijking: "" };

export default function AddLessonForm({ weekPlanId, days, isKleuter }: Props) {
  const [open, setOpen] = useState(false);
  // Gecontroleerde velden: bij een foutmelding blijft alles staan; na succes
  // leeg voor de volgende les (de gekozen dag blijft staan).
  const [dag, setDag] = useState(days[0]?.key ?? "");
  const [resetKey, setResetKey] = useState(0);
  const [v, setV] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV({ ...v, [key]: e.target.value });

  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addLesson(prev, formData);
    if (result?.ok) setV(EMPTY);
    // React zet na elke formulier-actie niet-gecontroleerde velden terug; de
    // dag-keuze opnieuw opbouwen zodat de laatst gekozen dag blijft staan.
    setResetKey((k) => k + 1);
    return result;
  }, undefined);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ background: "#3D2467" }}
      >
        Les toevoegen
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="weekPlanId" value={weekPlanId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Dag
          <select key={resetKey} name="dag" defaultValue={dag} onChange={(e) => setDag(e.target.value)} className={inputClass} style={fieldStyle}>
            {days.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Van
          <input type="time" name="start" value={v.start} onChange={set("start")} required step={300} className={inputClass} style={fieldStyle} />
        </label>
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Tot
          <input type="time" name="end" value={v.end} onChange={set("end")} required step={300} className={inputClass} style={fieldStyle} />
        </label>
        <label className={`${labelClass} flex-1 min-w-48`} style={{ color: "#6B5A85" }}>
          Vak of activiteit
          <input name="subject" value={v.subject} onChange={set("subject")} required maxLength={80} list="vakken" className={inputClass} style={fieldStyle} />
          <datalist id="vakken">
            {(isKleuter ? VAKKEN_KLEUTER : VAKKEN).map((v) => <option key={v} value={v} />)}
          </datalist>
        </label>
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Soort
          <select name="type" value={v.type} onChange={set("type")} className={inputClass} style={fieldStyle}>
            <option value="les">Les</option>
            <option value="vakles">Vakdocent / vakleerkracht</option>
            <option value="toets">Toets</option>
          </select>
        </label>
      </div>

      <p className="text-xs" style={{ color: "#6B5A85" }}>
        Lesdoel op drie niveaus (EDI). Alleen het basisdoel is nodig; verlengd en verrijking mag je leeg laten.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Basis
          <textarea name="goalBasis" value={v.goalBasis} onChange={set("goalBasis")} rows={2} maxLength={500} placeholder="Ik kan..." className={inputClass} style={fieldStyle} />
        </label>
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Verlengde instructie
          <textarea name="goalVerlengd" value={v.goalVerlengd} onChange={set("goalVerlengd")} rows={2} maxLength={500} className={inputClass} style={fieldStyle} />
        </label>
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Verrijking
          <textarea name="goalVerrijking" value={v.goalVerrijking} onChange={set("goalVerrijking")} rows={2} maxLength={500} className={inputClass} style={fieldStyle} />
        </label>
      </div>
      <p className="text-xs" style={{ color: "#8A5A00" }}>Privacy: noem geen leerlingen bij naam.</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "#3D2467" }}
        >
          {pending ? "Bezig..." : "Toevoegen"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm" style={{ color: "#6B5A85" }}>
          Sluiten
        </button>
        {state?.error && <p className="text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
        {state?.ok && <p className="text-sm" style={{ color: "#1E6B47" }}>{state.ok}</p>}
      </div>
    </form>
  );
}
