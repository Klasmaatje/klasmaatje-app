# Klasmaatje — Productroadmap & Onderbouwing

*Laatst bijgewerkt: 8 juli 2026*

## Missie

Klasmaatje maakt de administratieve en voorbereidende taken van leerkrachten in het
basisonderwijs radicaal sneller — zonder de kwaliteit of de verantwoording te verlagen —
door AI te verankeren in bewezen didactiek (EDI, GOVI, 3-niveau-differentiatie, PDCA).

**Kernprincipe:** de taken van leerkrachten gaan niet weg (Rekenkamer, 2025: schrappen
werkt niet, leerkrachten vinden de taken zelf te nuttig). De winst zit in ze radicaal
sneller maken. Klasmaatje schrijft concepten; de leerkracht blijft altijd eindredacteur.

## Onderbouwing (onderzoek, juni-juli 2026)

- **6-8 uur per week** besteden leraren aan administratie (Algemene Rekenkamer,
  "Hoeveel tijd mag het kosten?", juni 2025). Internationaal uitschieter: VK/België/
  Australië zitten op ~4 uur.
- **1 op 3 leraren** overweegt te vertrekken; ruim 80% daarvan noemt administratie
  als een van de redenen.
- **Zwaarste taken** (AOb-tijdsbestedingsonderzoek + TALIS): groepsplannen schrijven,
  rapporten schrijven, handelingsplannen, contact met ouders, bijwerken administratie.
- **Bewezen AI-effect:** wekelijkse AI-gebruikers besparen gemiddeld 5,9 uur/week
  (Gallup, 2025); OECD meet 31% minder lesvoorbereidingstijd zonder kwaliteitsverlies.
- **De drempel:** 80% van de Nederlandse niet-gebruikers noemt gebrek aan kennis/
  vaardigheden. Losse ChatGPT is te moeilijk en te onveilig (AVG) voor de gemiddelde
  leerkracht. → Het gat in de markt: een tool die de AI vóór ze inricht, binnen hun
  eigen didactische kader, AVG-proof.

## Architectuurprincipes (staan al, niet onderhandelbaar)

1. **Motor vs. schil**: EDI/GOVI/PDCA/differentiatie zijn universeel (de motor);
   alles wat school-specifiek is (labels, methodes, kwaliteitskader, AI-provider)
   zit in `SchoolConfig` (de schil).
2. **Privacy by design**: fase 1 werkt volledig zonder leerlingdata. Alles op
   groeps-/klasniveau. Individuele leerlingdata (OPP's, handelingsplannen) is fase 2,
   pas na juridisch traject (pseudonimisering, DPIA, verwerkersovereenkomsten).
3. **Methode-agnostisch**: methodes zijn metadata (globale `Method`-catalogus),
   geen hardcoded logica.

## Roadmap

### Fase 0 — Fundering ✅ (afgerond juli 2026)
- [x] Multi-tenant datamodel (Organization, SchoolConfig)
- [x] Methode-catalogus (Method, OrganizationMethod) + SHON-seed
- [x] Authenticatie (Better Auth) met automatische schoolkoppeling en rollen
- [x] Row-Level Security op alle tabellen
- [x] Beveiligde platform-omgeving met config-aware Sidebar en huisstijl

### Fase 1 — Mijn Week (nu bezig)
- [ ] WeekPlan-datamodel (gekoppeld aan User, Organization, Method)
- [ ] Mijn Week-formulier gekoppeld aan database (groep, periode, methode, bijzonderheden)
- [ ] AI-generatie van weekplanning volgens EDI/GOVI, 3 niveaus (basis/verlengd/verrijkt)
- [ ] Weergave + bewerken van de gegenereerde planning

### Fase 2 — Tier 1: hoogste tijd × frequentie
**2a. Groeps-/clusterplan-generator** ⭐ kroonjuweel
- Zwaarste administratielast volgens onderzoek; SHON-bestuur eist het al
  ("clusterplannen goed invullen en gebruiken in de OOM-tijd")
- Werkt op groepsniveau (3 niveaus) — geen leerlingdata nodig
- Micro-analyse-evaluaties voeden automatisch het concept voor de volgende periode
- Uniek: niemand koppelt dit aan EDI/GOVI-structuur

**2b. Rapport-tekstassistent** (zonder leerlingdata)
- Leerkracht typt steekwoorden → AI schrijft 2-3 conceptteksten in de juiste toon
- Geen naam of leerlinggegeven nodig in het systeem
- UX-principe: AI = inspiratie, leerkracht = eindredacteur (ook het verhaal naar besturen)

**2c. Oudergesprek-ondersteuning**
- Vooraf: agenda/gesprekspunten genereren op basis van rapportconcept
- Achteraf: steekwoorden → net gespreksverslag
- Raakt een taak die 2-3x per jaar voor de héle klas geldt

### Fase 3 — Tier 2: verdieping
**3a. EDI-lesvoorbereiding-generator** (Lesassistent-module)
- SHON eist "wekelijkse EDI-lesvoorbereidingen (zichtbaar en controleerbaar)"
- Genereert per les: lesdoel, voorkennis activeren, modelen, begeleide inoefening,
  controle van begrip — op basis van methode + groep
- Verkoopargument naar besturen: maakt kwaliteitseisen naleefbaar zonder werkdruk

**3b. Toets-/oefenmateriaal op 3 niveaus** (Materiaal-module)
- Differentiëren van teksten/opgaven per leesniveau binnen één thema

**3c. Micro-analyse → bestuursrapportage-aggregatie**
- Groepsniveau-analyses automatisch samenvoegen tot concept-kwaliteitskaart per school
- Bedient leerkracht + IB'er + bestuur in één product
- Strategisch: dit maakt Klasmaatje interessant voor stichtingen en uiteindelijk
  voor ParnasSys/Topicus (zij hebben de data, wij de handelingsgerichte laag)

### Fase 4 — Leerlingdata (pas na juridisch traject)
- Individuele handelingsplannen / OPP-ondersteuning
- ParnasSys-koppeling via UWLR/Edu-V, ECK iD (pseudonimisering)
- Vereist: verwerkersovereenkomsten, DPIA, Topicus-koppelpartner-goedkeuring,
  acceptatie per school/bestuur
- Sterke aanvraag = bewezen draaiend product bij SHON (fase 1-3 eerst)

## Bewust NIET doen (voorlopig)
- Individuele leerlingdata in welke vorm dan ook (fase 4)
- Volledige AI-provider-switching (structuur staat, uitwerking later)
- Volledige rollenstructuur / IB- en directie-dashboards (na fase 2)
- Complexe multi-tenancy features (subdomeinen, eigen branding per school)

## De pitch in één zin
De Rekenkamer zegt: schrappen werkt niet, administratie moet efficiënter.
Klasmaatje ís dat antwoord — niet minder verantwoording, maar dezelfde
verantwoording in een fractie van de tijd, geborgd in bewezen didactiek.
