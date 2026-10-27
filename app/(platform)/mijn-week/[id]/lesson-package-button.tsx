"use client";

import { useActionState } from "react";
import { createPackageForLesson, type PackageFormState } from "../../materiaal/actions";

/** "Maak lespakket" bij een les: groep, vak, lesdoel, methode en duur zijn al bekend. */
export default function LessonPackageButton({ lessonId }: { lessonId: string }) {
  const [state, formAction, pending] = useActionState<PackageFormState, FormData>(createPackageForLesson, undefined);
  return (
    <form action={formAction} className="mt-1">
      <input type="hidden" name="lessonId" value={lessonId} />
      <button type="submit" disabled={pending} className="underline underline-offset-2 disabled:no-underline" style={{ color: "#3D2467" }}>
        {pending ? "Les wordt geschreven (± 1 min)..." : "Maak lespakket"}
      </button>
      {state?.error && <p role="alert" style={{ color: "#B42318" }}>{state.error}</p>}
    </form>
  );
}
