"use client";

import { useActionState, useId } from "react";
import { saveReflection, type ReflectionFormState } from "./actions";
import { LEVELS, LEVEL_LABEL, REFLECTION_GROUPS } from "@/lib/quality";

type Initial = {
  id: string;
  subject: string;
  basis: string | null;
  verlengd: string | null;
  verrijking: string | null;
  goed: string | null;
  aandacht: string | null;
  vervolg: string | null;
};

type Props = {
  weekPlanId: string;
  /** Vakken uit de lessen van dit plan (suggesties); vrij typen mag ook. */
  subjects: string[];
  initial?: Initial;
};

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const labelStyle = { color: "#6B5A85" };

export default function ReflectionForm({ weekPlanId, subjects, initial }: Props) {
  const [state, formAction, pending] = useActionState<ReflectionFormState, FormData>(saveReflection, undefined);
  const listId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="weekPlanId" value={weekPlanId} />
      {initial && <input type="hidden" name="reflectionId" value={initial.id} />}

      <label className="flex flex-col gap-1 text-xs font-medium max-w-xs" style={labelStyle}>
        Vak
        <input
          name="subject"
          list={listId}
          required
          maxLength={60}
          defaultValue={initial?.subject ?? subjects[0] ?? ""}
          className="rounded-lg border px-3 py-2 text-sm bg-white"
          style={fieldStyle}
        />
        <datalist id={listId}>
          {subjects.map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>

      <fieldset>
        <legend className="text-xs font-medium mb-2" style={labelStyle}>
          Hoe ging het lesdoel per niveau? (jouw inschatting, op groepsniveau)
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {REFLECTION_GROUPS.map((g) => (
            <div key={g.key} className="rounded-lg p-3" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
              <p className="text-xs font-semibold mb-1.5" style={{ color: "#1F1730" }}>{g.label}</p>
              {LEVELS.map((level) => (
                <label key={level} className="flex items-center gap-2 text-sm py-0.5" style={{ color: "#1F1730" }}>
                  <input
                    type="radio"
                    name={g.key}
                    value={level}
                    defaultChecked={initial?.[g.key] === level}
                  />
                  {LEVEL_LABEL[level]}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm py-0.5" style={{ color: "#6B5A85" }}>
                <input type="radio" name={g.key} value="" defaultChecked={!initial?.[g.key]} />
                Niet van toepassing
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { name: "goed", label: "Wat ging goed?", placeholder: "Bijvoorbeeld: de modelling met de breukenstroken werkte." },
          { name: "aandacht", label: "Wat vraagt nog aandacht?", placeholder: "Bijvoorbeeld: een groepje twijfelt nog bij gelijknamig maken." },
          { name: "vervolg", label: "Wat neem ik mee?", placeholder: "Bijvoorbeeld: maandag korte herhaling aan de instructietafel." },
        ].map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
            {f.label}
            <textarea
              name={f.name}
              rows={3}
              maxLength={1000}
              defaultValue={initial?.[f.name as "goed" | "aandacht" | "vervolg"] ?? ""}
              placeholder={f.placeholder}
              className="rounded-lg border px-3 py-2 text-sm bg-white"
              style={fieldStyle}
            />
          </label>
        ))}
      </div>

      <p className="text-xs" style={{ color: "#8A5A00" }}>
        Privacy: geen namen van leerlingen. Schrijf over de groep of over een anoniem groepje.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "#3D2467" }}
        >
          {pending ? "Bezig..." : initial ? "Reflectie bijwerken" : "Reflectie opslaan"}
        </button>
        {state?.error && <p className="text-sm" style={{ color: "#B42318" }} role="alert">{state.error}</p>}
        {state?.ok && <p className="text-sm" style={{ color: "#1E6B47" }} role="status">{state.ok}</p>}
      </div>
    </form>
  );
}
