"use client";

import { useActionState, useId, useState } from "react";
import { createClusterPlan, type ClusterFormState } from "./actions";

type Option = { key: string; label: string };
type Goal = { id: string; title: string; subject: string | null };

type Props = {
  groups: Option[];
  subjects: string[];
  weeks: Option[];
  goals: Goal[];
  aiLabel: string; // "OpenAI" of "oefenmodus (...)"
};

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const labelStyle = { color: "#6B5A85" };

export default function NewClusterForm({ groups, subjects, weeks, goals, aiLabel }: Props) {
  const [state, formAction, pending] = useActionState<ClusterFormState, FormData>(createClusterPlan, undefined);
  const listId = useId();
  const [subject, setSubject] = useState(subjects[0] ?? "Rekenen");
  // Kwaliteitsdoel voorstellen dat bij het vak hoort; de gebruiker kiest zelf.
  const matching = goals.find((g) => g.subject && g.subject.toLowerCase() === subject.trim().toLowerCase());

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Groep
          <select name="classGroupId" required className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Vak
          <input name="subject" list={listId} required maxLength={60} value={subject} onChange={(e) => setSubject(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
          <datalist id={listId}>{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Startweek
          <select name="startPeriode" defaultValue={weeks[0]?.key} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            {weeks.slice(0, 8).map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Evaluatieweek
          <select name="evaluatiePeriode" defaultValue={weeks[4]?.key ?? weeks[weeks.length - 1]?.key} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium max-w-2xl" style={labelStyle}>
        Kwaliteitsdoel (optioneel)
        <select key={matching?.id ?? "geen"} name="qualityGoalId" defaultValue={matching?.id ?? ""} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
          <option value="">Geen kwaliteitsdoel</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm" style={{ color: "#1F1730" }}>
        <input type="checkbox" name="propose" defaultChecked className="mt-1" />
        <span>
          Concept laten schrijven uit de groepsreflecties van deze groep en dit vak.
          <span className="block text-xs" style={labelStyle}>
            Schrijver: {aiLabel}. Het concept volgt de SHON-opbouw: groepsanalyse, en per cluster doelen en aanpak (basisaanbod en OOM).
            De reflecties worden als bron bij het plan bewaard. Jij past het aan; IB of directie stelt het vast. Een korte interventie evalueer je in beginsel na vier weken.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "#3D2467" }}>
          {pending ? "Bezig..." : "Clusterplan maken"}
        </button>
        {pending && <p className="text-sm" style={labelStyle} role="status">Klasmaatje schrijft het concept. Dit duurt ongeveer een minuut.</p>}
        {state?.error && <p className="text-sm" style={{ color: "#B42318" }} role="alert">{state.error}</p>}
      </div>
    </form>
  );
}
