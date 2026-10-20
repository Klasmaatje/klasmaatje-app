"use client";

import { useActionState } from "react";
import { addGroupMember, type MemberFormState } from "./actions";

type Props = {
  groups: { id: string; name: string }[];
  colleagues: { id: string; name: string; email: string }[];
};

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };

export default function MemberForm({ groups, colleagues }: Props) {
  const [state, formAction, pending] = useActionState<MemberFormState, FormData>(addGroupMember, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
        Collega
        <select name="userId" required defaultValue="" className="rounded-lg border px-3 py-2 text-sm bg-white min-w-56" style={fieldStyle}>
          <option value="" disabled>Kies een collega</option>
          {colleagues.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
        Groep
        <select name="classGroupId" required defaultValue="" className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
          <option value="" disabled>Kies een groep</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>Groep {g.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
        Rol in de groep
        <select name="role" defaultValue="GROUP_TEACHER" className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
          <option value="GROUP_TEACHER">Groepsleerkracht</option>
          <option value="SUBSTITUTE">Invaller</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "#3D2467" }}
      >
        {pending ? "Bezig..." : "Koppelen"}
      </button>
      {state?.error && <p className="w-full text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
      {state?.ok && <p className="w-full text-sm" style={{ color: "#1E6B47" }}>{state.ok}</p>}
    </form>
  );
}
