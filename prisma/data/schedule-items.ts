// Vaste dagonderdelen: startsjabloon voor elke SHON-school.
//
// Bron: weekplanningen groep 1 t/m 8 van Shri Vishnu School (schooljaar
// 2025-2026), alleen de STRUCTUUR (welke momenten komen elke dag terug), geen
// namen van leerkrachten of leerlingen en geen lesinhoud.
// Tijden zijn ankers op het dagrooster (SchoolDaySchedule), zie
// lib/schedule-items.ts voor de notatie. Directies kunnen dit per school
// aanpassen via /schoolrooster; de seed vult alleen een school zonder items.

export type ScheduleItemTemplate = {
  label: string;
  defaultTime: string | null;
  category: "routine" | "pauze" | "vakles";
  targetGrades: number[]; // leeg = alle leerjaren
  sortOrder: number;
  aiHint: string;
};

const KLEUTERS = [1, 2];
const GROEP_3_TM_8 = [3, 4, 5, 6, 7, 8];

export const SCHEDULE_ITEM_TEMPLATES: ScheduleItemTemplate[] = [
  {
    label: "Dagopening en gebed",
    defaultTime: "start/5",
    category: "routine",
    targetGrades: [],
    sortOrder: 10,
    aiHint:
      "Vast identiteitsmoment van SHON bij de start van elke dag. Niet verplaatsen en geen les in plannen.",
  },
  {
    label: "Dagstart in de kring",
    defaultTime: "start+5/30",
    category: "routine",
    targetGrades: KLEUTERS,
    sortOrder: 20,
    aiHint:
      "Dagritmekaarten, dagen van de week, weer, liedje en het KiVa-thema. Duurt in de praktijk 30 tot 45 minuten.",
  },
  {
    label: "Leesmoment",
    defaultTime: "start+5/30",
    category: "routine",
    targetGrades: GROEP_3_TM_8,
    sortOrder: 20,
    aiHint:
      "Elke dag direct na de dagopening: (technisch) lezen of duolezen. Duur verschilt per groep, 15 tot 30 minuten.",
  },
  {
    label: "Fruitpauze",
    defaultTime: "10:15/15",
    category: "pauze",
    targetGrades: KLEUTERS,
    sortOrder: 30,
    aiHint: "Samen fruit eten, vaak met een taalmoment (liedje). Soms al om 10:00.",
  },
  {
    label: "Fruitpauze en Jeugdjournaal",
    defaultTime: "10:15/15",
    category: "pauze",
    targetGrades: GROEP_3_TM_8,
    sortOrder: 30,
    aiHint: "Fruit eten en het Jeugdjournaal kijken. Soms al om 10:00.",
  },
  {
    label: "Middagpauze (eten en buitenspelen)",
    defaultTime: "midday",
    category: "pauze",
    targetGrades: [],
    sortOrder: 40,
    aiHint:
      "Eten in de klas (ca. 15 min) en buitenspelen (ca. 30 min). Op sommige scholen gespreid per bouw: de leerkracht past de tijd voor de eigen groep aan.",
  },
  {
    label: "Evaluatie en dagafsluiting",
    defaultTime: "end-15/15",
    category: "routine",
    targetGrades: KLEUTERS,
    sortOrder: 90,
    aiHint: "Terugblik op de dag in de kring.",
  },
  {
    label: "Gymnastiek (vakleerkracht)",
    defaultTime: null,
    category: "vakles",
    targetGrades: [],
    sortOrder: 100,
    aiHint:
      "Vaste wekelijkse les(sen) van de vakleerkracht. Dag en tijd verschillen per groep; niet verplaatsen.",
  },
  {
    label: "Dharma / Hindi (vakdocent)",
    defaultTime: null,
    category: "vakles",
    targetGrades: [],
    sortOrder: 110,
    aiHint:
      "Vaste wekelijkse les van de vakdocent (levensbeschouwing en Hindi). Dag en tijd verschillen per groep; niet verplaatsen.",
  },
];
