"use client";

import { useState } from "react";
import { deleteWeekPlan } from "../actions";

// Twee stappen in plaats van een browser-popup: eerst "Weekplan verwijderen",
// daarna bevestigen.
export default function DeletePlanButton({ weekPlanId }: { weekPlanId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm underline" style={{ color: "#B42318" }}>
        Weekplan verwijderen
      </button>
    );
  }

  return (
    <form action={deleteWeekPlan} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="weekPlanId" value={weekPlanId} />
      <span className="text-sm" style={{ color: "#1F1730" }}>Dit plan en alle lessen erin verwijderen?</span>
      <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: "#B42318" }}>
        Ja, verwijderen
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-sm" style={{ color: "#6B5A85" }}>
        Annuleren
      </button>
    </form>
  );
}
