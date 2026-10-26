import { CLUSTER_STATUS_LABEL } from "@/lib/quality";

// Neutrale kleuren, geen rood: de status zegt iets over het proces, niet over kwaliteit.
const STYLE: Record<string, { background: string; color: string }> = {
  DRAFT: { background: "#F1ECF8", color: "#5B4A78" },
  VASTGESTELD: { background: "#E3F1EA", color: "#1E6B47" },
  GEEVALUEERD: { background: "#E6EEF7", color: "#1F4E79" },
};

export default function ClusterStatusBadge({ status }: { status: string }) {
  return (
    <span className="text-xs font-medium rounded-full px-2.5 py-1 whitespace-nowrap" style={STYLE[status] ?? STYLE.DRAFT}>
      {CLUSTER_STATUS_LABEL[status] ?? status}
    </span>
  );
}
