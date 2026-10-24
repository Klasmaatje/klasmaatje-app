"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteScheduleItem, saveScheduleItem, type FormState } from "./actions";
import {
  CATEGORY_OPTIONS,
  MAX_AI_HINT,
  MAX_DURATION,
  MAX_LABEL,
  MAX_OFFSET,
  MIN_DURATION,
  MOMENT_KIND_LABEL,
  type MomentFields,
  type MomentKind,
} from "@/lib/schedule-admin";

export type ItemValues = {
  id?: string;
  label: string;
  category: string;
  aiHint: string;
  grades: number[];
  moment: MomentFields;
};

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const labelClass = "flex flex-col gap-1 text-xs font-medium";
const inputClass = "rounded-lg border px-3 py-2 text-sm bg-white";
const GRADES = [1, 2, 3, 4, 5, 6, 7, 8];

/** Formulier voor één vast dagonderdeel: nieuw (zonder id) of wijzigen. */
export function ScheduleItemForm({
  schoolId,
  values,
  onDone,
}: {
  schoolId: string;
  values: ItemValues;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveScheduleItem, undefined);
  const [kind, setKind] = useState<MomentKind>(values.moment.kind);
  const isNew = !values.id;

  useEffect(() => {
    if (state?.ok && onDone) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="schoolId" value={schoolId} />
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="flex flex-wrap gap-3">
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Naam
          <input name="label" required maxLength={MAX_LABEL} defaultValue={values.label}
            placeholder="Bijvoorbeeld: Dagopening en gebed" className={`${inputClass} w-72`} style={fieldStyle} />
        </label>
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Soort
          <select name="category" defaultValue={values.category} className={inputClass} style={fieldStyle}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass} style={{ color: "#6B5A85" }}>
          Wanneer
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as MomentKind)}
            className={inputClass} style={fieldStyle}>
            {(Object.keys(MOMENT_KIND_LABEL) as MomentKind[]).map((k) => (
              <option key={k} value={k}>{MOMENT_KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
        {kind === "start" && (
          <label className={labelClass} style={{ color: "#6B5A85" }}>
            Minuten na de start
            <input type="number" name="offset" min={0} max={MAX_OFFSET} step={5} defaultValue={values.moment.offset}
              className={`${inputClass} w-28`} style={fieldStyle} />
          </label>
        )}
        {kind === "end" && (
          <label className={labelClass} style={{ color: "#6B5A85" }}>
            Begint ... min voor het einde
            <input type="number" name="offset" min={MIN_DURATION} max={MAX_OFFSET} step={5}
              defaultValue={values.moment.offset || values.moment.duration}
              className={`${inputClass} w-28`} style={fieldStyle} />
          </label>
        )}
        {kind === "clock" && (
          <label className={labelClass} style={{ color: "#6B5A85" }}>
            Kloktijd
            <input type="time" step={300} name="clock" defaultValue={values.moment.clock}
              className={`${inputClass} w-32`} style={fieldStyle} />
          </label>
        )}
        {(kind === "start" || kind === "end" || kind === "clock") && (
          <label className={labelClass} style={{ color: "#6B5A85" }}>
            Duur (minuten)
            <input type="number" name="duration" min={MIN_DURATION} max={MAX_DURATION} step={5}
              defaultValue={values.moment.duration} className={`${inputClass} w-28`} style={fieldStyle} />
          </label>
        )}
      </div>
      {kind === "midday" && (
        <p className="text-xs" style={{ color: "#6B5A85" }}>
          Gebruikt de middagpauze uit de schooltijden. Zonder pauze: 12:00-12:30 op dagen tot 14:00 of later; op korte dagen vervalt het moment.
        </p>
      )}
      {kind === "weekly" && (
        <p className="text-xs" style={{ color: "#6B5A85" }}>
          Voor lessen van een vakleerkracht of vakdocent. De leerkracht zet de les zelf op de juiste dag en tijd.
        </p>
      )}

      <fieldset>
        <legend className="text-xs font-medium mb-1" style={{ color: "#6B5A85" }}>
          Voor welke groepen (niets aangevinkt = alle groepen)
        </legend>
        <div className="flex flex-wrap gap-3">
          {GRADES.map((g) => (
            <label key={g} className="flex items-center gap-1.5 text-sm" style={{ color: "#1F1730" }}>
              <input type="checkbox" name="grades" value={g} defaultChecked={values.grades.includes(g)} className="w-4 h-4" />
              {g}
            </label>
          ))}
        </div>
      </fieldset>

      <label className={labelClass} style={{ color: "#6B5A85" }}>
        Toelichting voor de AI (optioneel)
        <textarea name="aiHint" rows={2} maxLength={MAX_AI_HINT} defaultValue={values.aiHint}
          placeholder="Bijvoorbeeld: niet verplaatsen en geen les in plannen. Geen namen van personen."
          className={inputClass} style={fieldStyle} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "#3D2467" }}>
          {pending ? "Bezig..." : isNew ? "Toevoegen" : "Opslaan"}
        </button>
        {onDone && !isNew && (
          <button type="button" onClick={onDone} className="text-sm" style={{ color: "#6B5A85" }}>Annuleren</button>
        )}
        {state?.error && <p className="text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
      </div>
    </form>
  );
}

/** Nieuw dagonderdeel: na toevoegen wordt het formulier weer leeg. */
export function NewScheduleItem({ schoolId, values }: { schoolId: string; values: ItemValues }) {
  const [round, setRound] = useState(0);
  return (
    <div>
      <ScheduleItemForm key={round} schoolId={schoolId} values={values} onDone={() => setRound((r) => r + 1)} />
      {round > 0 && <p className="text-sm mt-2" style={{ color: "#1E6B47" }}>Toegevoegd.</p>}
    </div>
  );
}

/** Eén regel in de lijst: samenvatting, met "Wijzigen" en "Verwijderen" (twee stappen). */
export function ScheduleItemRow({
  schoolId,
  values,
  summary,
  preview,
}: {
  schoolId: string;
  values: ItemValues & { id: string };
  summary: { moment: string; grades: string; category: string };
  preview: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (editing) {
    return (
      <div className="py-4">
        <ScheduleItemForm schoolId={schoolId} values={values} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium" style={{ color: "#1F1730" }}>{values.label}</p>
        <p className="text-sm" style={{ color: "#6B5A85" }}>
          {summary.moment} · {summary.grades} · {summary.category}
        </p>
        <p className="text-xs mt-1" style={{ color: "#8B6FB3" }}>{preview}</p>
      </div>
      <div className="flex items-center gap-3">
        {!confirming && (
          <>
            <button type="button" onClick={() => setEditing(true)} className="text-sm underline" style={{ color: "#3D2467" }}>
              Wijzigen
            </button>
            <button type="button" onClick={() => setConfirming(true)} className="text-sm underline" style={{ color: "#B42318" }}>
              Verwijderen
            </button>
          </>
        )}
        {confirming && (
          <form action={deleteScheduleItem} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={values.id} />
            <span className="text-sm" style={{ color: "#1F1730" }}>Verwijderen?</span>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: "#B42318" }}>
              Ja, verwijderen
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm" style={{ color: "#6B5A85" }}>
              Annuleren
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
