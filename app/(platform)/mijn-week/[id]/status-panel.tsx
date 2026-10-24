"use client";

import { useActionState } from "react";
import { approveWeekPlan, submitWeekPlan, type FormState } from "../actions";

type Props = {
  weekPlanId: string;
  status: string;
  /** teacher = groepslid, approver = IB/directie eigen school, viewer = alleen lezen */
  mode: "teacher" | "approver" | "viewer";
  lessonCount: number;
  /** Moment van indienen of goedkeuren, al opgemaakt (bv. "za 24 okt, 13:05"). */
  since: string | null;
};

const textStyle = { color: "#1F1730" };
const mutedStyle = { color: "#6B5A85" };

function ActionButton({
  action,
  weekPlanId,
  label,
  pendingLabel,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  weekPlanId: string;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="weekPlanId" value={weekPlanId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "#3D2467" }}
      >
        {pending ? pendingLabel : label}
      </button>
      {state?.error && <p className="text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
      {state?.ok && <p className="text-sm" style={{ color: "#1E6B47" }}>{state.ok}</p>}
    </form>
  );
}

export default function StatusPanel({ weekPlanId, status, mode, lessonCount, since }: Props) {
  const when = since ? ` op ${since}` : "";

  let body: React.ReactNode = null;

  if (mode === "teacher") {
    if (status === "DRAFT") {
      body =
        lessonCount > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={textStyle}>
              Klaar met plannen? Dien het plan in, dan zien IB en directie dat het klaar is.
            </p>
            <ActionButton action={submitWeekPlan} weekPlanId={weekPlanId} label="Indienen" pendingLabel="Indienen..." />
          </div>
        ) : (
          <p className="text-sm" style={mutedStyle}>
            Voeg eerst lessen toe. Daarna kun je het plan indienen bij IB en directie.
          </p>
        );
    } else if (status === "SUBMITTED") {
      body = (
        <p className="text-sm" style={textStyle}>
          Ingediend{when}. IB of directie kan het nu goedkeuren.
          <span style={mutedStyle}> Je kunt het plan nog aanpassen; dan wordt het weer een concept en dien je het opnieuw in.</span>
        </p>
      );
    } else if (status === "APPROVED") {
      body = (
        <p className="text-sm" style={textStyle}>
          Goedgekeurd{when}.
          <span style={mutedStyle}> Je kunt het plan nog aanpassen; dan wordt het weer een concept en dien je het opnieuw in.</span>
        </p>
      );
    }
  } else {
    if (status === "DRAFT") {
      body = <p className="text-sm" style={mutedStyle}>De leerkracht werkt nog aan dit plan (concept).</p>;
    } else if (status === "SUBMITTED") {
      body =
        mode === "approver" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={textStyle}>Ingediend{when} door de leerkracht.</p>
            <ActionButton action={approveWeekPlan} weekPlanId={weekPlanId} label="Goedkeuren" pendingLabel="Goedkeuren..." />
          </div>
        ) : (
          <p className="text-sm" style={textStyle}>Ingediend{when} door de leerkracht.</p>
        );
    } else if (status === "APPROVED") {
      body = <p className="text-sm" style={textStyle}>Goedgekeurd{when}.</p>;
    }
  }

  if (!body) return null;
  return (
    <div className="rounded-xl bg-white p-5 mb-4" style={{ border: "1px solid #E8DFF5" }}>
      {body}
    </div>
  );
}
