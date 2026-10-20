"use client";

import { useActionState } from "react";
import { createWeekPlan, type FormState } from "./actions";

type Props = {
  classGroupId: string;
  weeks: { key: string; label: string }[];
};

export default function NewPlanForm({ classGroupId, weeks }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createWeekPlan, undefined);

  if (weeks.length === 0) {
    return <p className="text-sm" style={{ color: "#6B5A85" }}>Voor de komende weken zijn al weekplannen gemaakt.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="classGroupId" value={classGroupId} />
      <label className="sr-only" htmlFor={`periode-${classGroupId}`}>Week</label>
      <select
        id={`periode-${classGroupId}`}
        name="periode"
        defaultValue={weeks[0].key}
        className="rounded-lg border px-3 py-2 text-sm bg-white"
        style={{ borderColor: "#D9CCEE", color: "#1F1730" }}
      >
        {weeks.map((w) => (
          <option key={w.key} value={w.key}>{w.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "#3D2467" }}
      >
        {pending ? "Bezig..." : "Nieuw weekplan"}
      </button>
      {state?.error && <p className="w-full text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
    </form>
  );
}
