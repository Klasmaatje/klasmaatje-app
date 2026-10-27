"use client";

import { useActionState } from "react";
import { createPackage, type PackageFormState } from "../materiaal/actions";

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const labelStyle = { color: "#6B5A85" };

export default function PackageForm({ groups, aiLabel }: { groups: { id: string; label: string }[]; aiLabel: string }) {
  const [state, formAction, pending] = useActionState<PackageFormState, FormData>(createPackage, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Groep
          <select name="classGroupId" required className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Vak
          <input name="subject" required maxLength={60} defaultValue="Rekenen" className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Lesduur (minuten)
          <input name="minutes" type="number" min={10} max={180} defaultValue={60} required className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
        Leerdoel
        <input name="learningGoal" required maxLength={300} placeholder="Bijvoorbeeld: breuken met verschillende noemers vergelijken"
          className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Methode (optioneel, alleen de naam)
          <input name="method" maxLength={80} placeholder="Bijvoorbeeld: Getal & Ruimte Junior" className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={labelStyle}>
          Aandachtspunt van de groep (optioneel)
          <input name="focus" maxLength={300} placeholder="Bijvoorbeeld: verwisselen teller en noemer" className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle} />
        </label>
      </div>
      <p className="text-xs" style={{ color: "#8A5A00" }}>Privacy: schrijf op groepsniveau, zonder namen van leerlingen.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "#E8B44A", color: "#1F1730" }}>
          {pending ? "Bezig..." : "Maak lespakket"}
        </button>
        <span className="text-xs" style={labelStyle} role="status">
          {pending ? "Klasmaatje schrijft de les. Dit duurt ongeveer een tot anderhalve minuut." : `Schrijver: ${aiLabel}.`}
        </span>
        {state?.error && <p className="text-sm" style={{ color: "#B42318" }} role="alert">{state.error}</p>}
      </div>
    </form>
  );
}
