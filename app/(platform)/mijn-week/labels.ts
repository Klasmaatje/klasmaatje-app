export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Concept",
  REVIEWED: "Bekeken",
  APPROVED: "Goedgekeurd",
  ARCHIVED: "Gearchiveerd",
};

export const CATEGORY_STYLE: Record<string, { background: string; color: string; border?: string }> = {
  routine: { background: "#EEE7F9", color: "#3D2467" },
  pauze: { background: "#FFF4DC", color: "#8A5A00" },
  vakles: { background: "#E3F1EA", color: "#1E6B47" },
  les: { background: "#FFFFFF", color: "#1F1730", border: "1px solid #D9CCEE" },
  toets: { background: "#FDECEC", color: "#8A1C1C" },
};
