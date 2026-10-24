"use client";

import { useActionState, useState } from "react";
import { saveDaySchedules, type FormState } from "./actions";

export type DayRow = {
  weekday: string;
  label: string;
  open: boolean;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
};

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };
const timeClass = "rounded-lg border px-2 py-1.5 text-sm bg-white w-28 disabled:opacity-40";

export default function DayScheduleForm({ schoolId, days }: { schoolId: string; days: DayRow[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveDaySchedules, undefined);
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(days.map((d) => [d.weekday, d.open]))
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "#6B5A85" }}>
              <th className="font-medium pb-2 pr-4">Dag</th>
              <th className="font-medium pb-2 pr-4">School</th>
              <th className="font-medium pb-2 pr-4">Begin</th>
              <th className="font-medium pb-2 pr-4">Einde</th>
              <th className="font-medium pb-2 pr-4">Middagpauze van</th>
              <th className="font-medium pb-2">tot</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const isOpen = open[d.weekday];
              return (
                <tr key={d.weekday} style={{ borderTop: "1px solid #F0EAF8" }}>
                  <td className="py-2 pr-4 font-medium" style={{ color: "#1F1730" }}>{d.label}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      name={`${d.weekday}.open`}
                      checked={isOpen}
                      onChange={(e) => setOpen((o) => ({ ...o, [d.weekday]: e.target.checked }))}
                      aria-label={`${d.label}: school`}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input type="time" step={300} name={`${d.weekday}.start`} defaultValue={d.startTime || "08:30"}
                      disabled={!isOpen} required={isOpen} aria-label={`${d.label}: begin`} className={timeClass} style={fieldStyle} />
                  </td>
                  <td className="py-2 pr-4">
                    <input type="time" step={300} name={`${d.weekday}.end`} defaultValue={d.endTime || "15:00"}
                      disabled={!isOpen} required={isOpen} aria-label={`${d.label}: einde`} className={timeClass} style={fieldStyle} />
                  </td>
                  <td className="py-2 pr-4">
                    <input type="time" step={300} name={`${d.weekday}.breakStart`} defaultValue={d.breakStart}
                      disabled={!isOpen} aria-label={`${d.label}: middagpauze van`} className={timeClass} style={fieldStyle} />
                  </td>
                  <td className="py-2">
                    <input type="time" step={300} name={`${d.weekday}.breakEnd`} defaultValue={d.breakEnd}
                      disabled={!isOpen} aria-label={`${d.label}: middagpauze tot`} className={timeClass} style={fieldStyle} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-3" style={{ color: "#6B5A85" }}>
        Middagpauze leeg laten bij een continurooster of een korte dag. Zet het vinkje bij School uit voor een dag zonder les.
      </p>
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button type="submit" disabled={pending}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ background: "#3D2467" }}>
          {pending ? "Bezig..." : "Schooltijden opslaan"}
        </button>
        {state?.error && <p className="text-sm" style={{ color: "#B42318" }}>{state.error}</p>}
        {state?.ok && <p className="text-sm" style={{ color: "#1E6B47" }}>{state.ok}</p>}
      </div>
    </form>
  );
}
