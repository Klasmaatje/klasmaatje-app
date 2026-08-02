export interface GlobalMethod {
  name: string;
  subject: string;
  publisher: string;
  description: string;
}

// Landelijke methode-catalogus (top-20 meest gebruikte methodes in het NL
// basisonderwijs). Method = globale catalogus; scholen kiezen hieruit via
// SchoolMethod. Uitbreiden = hier een item toevoegen en `prisma db seed` draaien.
export const GLOBAL_METHODS: GlobalMethod[] = [
  // REKENEN
  {
    name: "Wereld in Getallen (WIG 4/5)",
    subject: "Rekenen",
    publisher: "Malmberg",
    description: "Realistisch rekenonderwijs met een heldere EDI-structuur en sterke opbouw in basisvaardigheden.",
  },
  {
    name: "Pluspunt (Editie 4)",
    subject: "Rekenen",
    publisher: "Malmberg",
    description: "Marktleidende rekenmethode met focus op differentiatie en doelgericht oefenen.",
  },
  {
    name: "Alles Telt Q",
    subject: "Rekenen",
    publisher: "ThiemeMeulenhoff",
    description: "Stapsgewijze rekenmethode met veel aandacht voor getalbegrip en visuele ondersteuning.",
  },
  {
    name: "Snappet Rekenen",
    subject: "Rekenen",
    publisher: "Snappet",
    description: "Digitale, adaptieve rekenmethode gericht op directe verwerking en doelengroei.",
  },
  {
    name: "Gynzy Rekenen",
    subject: "Rekenen",
    publisher: "Gynzy",
    description: "Digitale verwerkings- en instructiesoftware met de Snappet/Bareka-leerlijnen.",
  },

  // TAAL & SPELLING
  {
    name: "Staal",
    subject: "Taal & Spelling",
    publisher: "Noordhoff",
    description: "Combinatiemethode met een op categorisering gebaseerde spellingaanpak en thematische taal.",
  },
  {
    name: "Taal actief (Editie 4/5)",
    subject: "Taal & Spelling",
    publisher: "Malmberg",
    description: "Gestructureerde methode voor taal, spelling en woordenschat met expliciete instructie.",
  },
  {
    name: "Pit",
    subject: "Taal & Spelling",
    publisher: "Blink",
    description: "Actuele, thematische taal- en spellingmethode gericht op actieve taalproductie.",
  },
  {
    name: "Snappet Taal & Spelling",
    subject: "Taal & Spelling",
    publisher: "Snappet",
    description: "Digitale verwerking van spellingcategorieën en grammatica met directe foutdiagnostiek.",
  },

  // TECHNISCH & BEGRIJPEND LEZEN
  {
    name: "Veilig Leren Lezen (Kim-versie)",
    subject: "Aanvankelijk Lezen (Groep 3)",
    publisher: "Zwijsen",
    description: "De landelijke standaard voor aanvankelijk lezen en spellen in groep 3.",
  },
  {
    name: "Estafette (Editie 3.0)",
    subject: "Technisch Lezen",
    publisher: "Zwijsen",
    description: "Methode voor technisch lezen gericht op leesvloeiendheid, tempo en leesplezier.",
  },
  {
    name: "Station Zuid",
    subject: "Technisch Lezen",
    publisher: "Malmberg",
    description: "Doelgerichte methode voor voortgezet technisch lezen met woordrijen en teksten.",
  },
  {
    name: "Nieuwsbegrip",
    subject: "Begrijpend Lezen",
    publisher: "CED-Groep",
    description: "Wekelijks actuele begrijpend-leeslessen op verschillende niveaus op basis van krantenartikelen.",
  },
  {
    name: "Blink Lezen / Leeslink",
    subject: "Begrijpend Lezen",
    publisher: "Blink / Noordhoff",
    description: "Geïntegreerde leesmethode met rijke teksten en verdiepende tekstgesprekken.",
  },
  {
    name: "Atlantis",
    subject: "Technisch & Begrijpend Lezen",
    publisher: "Delubas",
    description: "Geïntegreerde methode die technisch lezen, begrijpend lezen en leesbevordering verbindt.",
  },

  // WERELDORIËNTATIE & BURGERSCHAP
  {
    name: "Faqta",
    subject: "Wereldoriëntatie & Burgerschap",
    publisher: "Faqta",
    description: "Thematisch onderwijs met video's, rijke teksten (Discussion Cards) en onderzoekend leren.",
  },
  {
    name: "Blink Wereld",
    subject: "Wereldoriëntatie & Burgerschap",
    publisher: "Blink",
    description: "Onderzoekend en ontdekkend leren binnen geïntegreerde thema's voor geschiedenis, aardrijkskunde en natuur.",
  },
  {
    name: "Naut, Meander & Brutus",
    subject: "Wereldoriëntatie",
    publisher: "Malmberg",
    description: "Klassieke, vakoverstijgende methode voor natuur & techniek, aardrijkskunde en geschiedenis.",
  },

  // KLEUTERS (GROEP 1/2)
  {
    name: "Schatkist (Editie 3)",
    subject: "Het Jonge Kind (Groep 1/2)",
    publisher: "Zwijsen",
    description: "Totaalprogramma voor doelgericht spelen en werken in thema's rond taal, rekenen en SEO.",
  },
  {
    name: "Onderbouwd",
    subject: "Het Jonge Kind (Groep 1/2)",
    publisher: "Onderbouwd",
    description: "Ontwikkelingsmateriaal en doelenvolgsysteem voor rekenen, taal en motoriek bij kleuters.",
  },
  {
    name: "Kleuterplein",
    subject: "Het Jonge Kind (Groep 1/2)",
    publisher: "Malmberg",
    description: "Thematisch kleuterprogramma gericht op brede ontwikkeling en spelend leren.",
  },
];
