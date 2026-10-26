// Inhoud van de "Binnenkort"-modules (roadmap-cards). Puur: geen database, geen React.
// Gedeeld door de Sidebar (menu) en de roadmap-pagina's.
//
// Uitgangspunten (architectuur-besluiten + kwaliteitslaag-ontwerpprincipes):
// - Fase 2/3 werkt op groepsniveau en zonder leerlingdata.
// - AI stelt voor, een mens beslist. Geen automatische kwaliteitsoordelen of kleuren.
// - Geen datums beloven: Mijn Week gaat voor, deze modules volgen daarna.

export type RoadmapKey = "micro-analyse" | "clusterplannen" | "ib-overzicht";

export type RoadmapModule = {
  key: RoadmapKey;
  href: string;
  /** Standaardnaam; voor micro-analyse kan het bestuur een eigen naam instellen. */
  label: string;
  subtitle: string;
  audience: string;
  intro: string;
  points: string[];
  /** Korte uitleg die misverstanden voorkomt (terminologie, verschil met bestaande pagina). */
  note?: string;
};

export const ROADMAP_MODULES: RoadmapModule[] = [
  {
    key: "micro-analyse",
    href: "/micro-analyse",
    label: "Micro-analyse",
    subtitle: "Groepsreflectie zonder leerlingdata",
    audience: "Leerkracht, met de IB'er als meedenker",
    intro:
      "Na een les of aan het eind van de week kijk je in een paar minuten terug: wat ging goed, welk lesdoel vraagt nog aandacht en wat neem je mee naar volgende week. Je reflectie hangt aan je weekplan, dus je vult niets dubbel in.",
    points: [
      "Terugkijken per les of per week, vanuit je eigen weekplan.",
      "Op groepsniveau met de drie niveaus basis, verlengd en verrijking, zonder namen of leerlingnummers.",
      "Klasmaatje mag een samenvatting voorstellen; jij past aan en beslist.",
    ],
    note:
      "Dit is de groepsversie van de micro-analyse. Analyse op het niveau van individuele leerlingen valt hier bewust buiten.",
  },
  {
    key: "clusterplannen",
    href: "/clusterplannen",
    label: "Clusterplannen",
    subtitle: "Instructiegroepen per vak en periode",
    audience: "Leerkracht en IB'er",
    intro:
      "Een plan per groep, vakgebied en periode met drie instructieclusters: basis, intensief en verrijking. Het bouwt voort op je weekplannen en groepsreflecties, zodat je niet bij nul begint.",
    points: [
      "Clusters op groepsniveau, zonder leerlingnamen of leerlingnummers.",
      "Klasmaatje stelt een concept voor met doelen, aanpak en evaluatiemoment; jij en de IB'er stellen het vast.",
      "Elk plan krijgt een evaluatiemoment, zodat zichtbaar wordt of de aanpak werkt.",
    ],
  },
  {
    key: "ib-overzicht",
    href: "/ib-overzicht",
    label: "IB-overzicht",
    subtitle: "Onderwijskwaliteit volgen op groeps- en schoolniveau",
    audience: "IB'er, schoolleiding en kwaliteit",
    intro:
      "Een overzicht dat groepsreflecties en clusterplannen bij elkaar brengt. Zo zien IB en schoolleiding waar een groep ondersteuning kan gebruiken en volgen ze of een aanpak effect heeft.",
    points: [
      "Aandachtspunten in plaats van rode vlaggen; een mens beoordeelt, niet de AI.",
      "Geen totaalcijfers of automatische kleuren; alles is terug te leiden naar bron en context.",
      "Sluit aan op de PDCA-cyclus en de kwaliteitskaarten van het bestuur.",
    ],
    note:
      "Meekijken met de weekplanning kan nu al via Weekplannen. Het IB-overzicht gaat verder: het volgt reflectie en effect, niet alleen de planning.",
  },
];

export function roadmapModule(key: RoadmapKey): RoadmapModule {
  const found = ROADMAP_MODULES.find((m) => m.key === key);
  if (!found) throw new Error(`Onbekende roadmap-module: ${key}`);
  return found;
}

/** Stappen van de keten die al werken (de rest is in ontwikkeling). */
export const AVAILABLE_STEPS: string[] = ["mijn-week", "micro-analyse", "clusterplannen"];

/** De keten waarin de modules vallen. */
export const ROADMAP_CHAIN: { key: RoadmapKey | "mijn-week"; label: string }[] = [
  { key: "mijn-week", label: "Weekplan" },
  { key: "micro-analyse", label: "Groepsreflectie" },
  { key: "clusterplannen", label: "Clusterplan" },
  { key: "ib-overzicht", label: "IB-overzicht" },
];
