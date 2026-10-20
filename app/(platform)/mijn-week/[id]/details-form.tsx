"use client";

import { useActionState } from "react";
import { updateWeekPlanDetails, type FormState } from "../actions";

type Props = {
  weekPlanId: string;
  thema: string | null;
  bijzonderheden: string | null;
};

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };

export default function DetailsForm({ weekPlanId, thema, bijzonderheden }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateWeekPlanDetails, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="weekPlanId" value={weekPlanId} />
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
        Thema van de week
        <input
          name="thema"
          defaultValue={thema ?? ""}
          maxLength={120}
          placeholder="Bijvoorbeeld: Herfst, Diwali, Voetbal"
          className="rounded-lg border px-3 py-2 text-sm bg-white"
          style={fieldStyle}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
        Bijzonderheden deze week
        <textarea
          name="bijzonderheden"
          defaultValue={bijzonderheden ?? ""}
          maxLength={2000}
          rows={3}
          placeholder="Bijvoorbeeld: donderdag sportdag, vrijdag studiemiddag. Gebruik geen namen van leerlingen."
          className="rounded-lg border px-3 py-2 text-sm bg-white"
          style={fieldStyle}
        />
      </label>
      <p className="text-xs" style={{ color: "#8A5A00" }}>
        Privacy: noem geen leerlingen bij naam. Schrijf over de groep of over anonieme subgroepen.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "#3D2467" }}
        >
          {pending ? "Bezig..." : "Opslaan"}
        </button>
        {state?.error && <p className="text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
        {state?.ok && <p className="text-sm" style={{ color: "#1E6B47" }}>{state.ok}</p>}
      </div>
    </form>
  );
}
