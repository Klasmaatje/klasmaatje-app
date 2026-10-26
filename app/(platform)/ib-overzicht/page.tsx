import { canViewWeekPlanOverview } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { roadmapModule } from "@/lib/roadmap";
import RoadmapCard from "../../components/RoadmapCard";

// Binnenkort: het IB-overzicht (kwaliteitslaag). Niet hetzelfde als /weekplannen
// (meekijken met de planning); de card legt dat verschil uit.
export default async function IbOverzichtPage() {
  const actor = await requireActor();
  const mod = roadmapModule("ib-overzicht");
  return (
    <RoadmapCard
      module={mod}
      label={mod.label}
      showWeekplannenLink={canViewWeekPlanOverview(actor.role)}
    />
  );
}
