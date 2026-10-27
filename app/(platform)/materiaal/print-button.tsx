"use client";

export default function PrintButton({ label = "Afdrukken" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg px-3 py-1.5 text-sm font-medium print:hidden"
      style={{ border: "1px solid #3D2467", color: "#3D2467" }}>
      {label}
    </button>
  );
}
