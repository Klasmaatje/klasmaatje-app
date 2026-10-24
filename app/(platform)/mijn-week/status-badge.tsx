import { STATUS_LABEL } from "@/lib/weekplan-status";

// Neutrale kleuren per status: geen rood, geen oordeel ("maatje, geen controleur").
const STYLE: Record<string, { background: string; color: string }> = {
  DRAFT: { background: "#F1ECF8", color: "#5B4A78" },
  SUBMITTED: { background: "#FFF4DC", color: "#8A5A00" },
  APPROVED: { background: "#E3F1EA", color: "#1E6B47" },
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap"
      style={STYLE[status] ?? STYLE.DRAFT}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
