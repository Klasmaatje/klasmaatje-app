"use client";

import { useActionState } from "react";
import { generateDraftLessons, type FormState } from "../actions";

export default function DraftButton({ weekPlanId, providerLabel }: { weekPlanId: string; providerLabel: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(generateDraftLessons, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="weekPlanId" value={weekPlanId} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "#E8B44A", color: "#1F1730" }}
        >
          {pending ? "Voorstel maken..." : "Concept laten voorstellen"}
        </button>
        <span className="text-xs" style={{ color: "#6B5A85" }}>
          Vult de vrije tijd met lessen op drie niveaus (EDI). Via: {providerLabel}. Bestaande lessen blijven staan.
        </span>
      </div>
      {state?.error && <p className="text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
      {state?.ok && <p className="text-sm" style={{ color: "#1E6B47" }}>{state.ok}</p>}
    </form>
  );
}
