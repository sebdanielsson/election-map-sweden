/* Emitted by scripts/trimResults.ts, keyed by partikod. Optional because files published
 * before that script existed do not carry it. */
export interface PartiUppslag {
  partiforkortning: string | null;
  partibeteckning: string | null;
}

export interface Rostfordelning {
  partier?: Record<string, PartiUppslag>;
  valtillfalle: string | null;
  /* Dropped by trimResults; present only in files taken straight from Valmyndigheten. */
  valklass?: string | null;
  rakningstillfalle: string | null;
  valtyp: string | null;
  senasteUppdateringstid: string | null;
  antalUppdateringar?: number | null;
  antalValdistriktRaknade: number | null;
  antalValdistriktSomSkaRaknas: number | null;
  valdistrikt: Valdistrikt[];
}

/* Optional members are the ones scripts/trimResults.ts drops. A trimmed district carries
 * only valdistriktskod and rostfordelning, so declaring the rest required made this type
 * describe a file the app never receives for a trimmed election — and fetch().json() casts
 * straight to it, so nothing would have caught the undefined at run time. */
export interface Valdistrikt {
  namn?: string | null;
  valdistriktstyp?: string | null;
  rapporteringsTid?: string | null;
  totaltAntalRoster?: number | null;
  antalRostberattigade?: number | null;
  valdeltagandeVallokal?: number | null;
  valdistriktskod: string | null;
  kommunkod?: string | null;
  lankod?: string | null;
  valomradeskod?: string | null;
  kretskod?: string | null;
  kommunvalkretsNamn?: string | null;
  kommunvalkretsKod?: string | null;
  valdistriktskodForegaendeVal?: string | null;
  totaltAntalRosterForegaendeVal?: number | null;
  antalRostberattigadeForegaendeVal?: number | null;
  valdeltagandeForegaendeVal?: number | null;
  forandringTotaltAntalRoster?: number | null;
  forandringValdeltagande?: number | null;
  forandringAntalRostberattigade?: number | null;
  statusJamforelse?: string | null;
  rostfordelning: ValdistriktRostfordelning;
}

export interface ValdistriktRostfordelning {
  rosterPaverkaMandat: RosterPaverkaMandat;
  /* Dropped by trimResults — invalid votes are not shown. */
  rosterEjPaverkaMandat?: RosterEjPaverkaMandat;
  /* rosterOvrigaPartier is NOT here. It is nested inside rosterPaverkaMandat, both in the
   * real files and in Valmyndigheten's spec. It was declared here as well, which made
   * correct code reading the nested location look like a bug. */
}

export interface Personrost {
  namn: string | null;
  kandidatNummerPaListan: number | null;
  kandidatNummer: number | null;
  antalPersonroster: number | null;
}

export interface RosterOvrigaPartier {
  antalRoster: number | null;
  andelRoster: number | null;
  /* Comparison figures, dropped by trimResults. */
  antalRosterForegaendeVal?: number | null;
  andelRosterForegaendeVal?: number | null;
  forandringAntalRoster?: number | null;
  forandringAndelRoster?: number | null;
}

export interface Mandatfordelning {
  valtillfalle: string | null;
  valklass: string | null;
  rakningstillfalle: string | null;
  valtyp: string | null;
  senasteUppdateringstid: string | null;
  antalUppdateringar: number | null;
  valomrade: Valomrade;
}

export interface Valomrade {
  namn: string | null;
  kod: string | null;
  rapporteringsTid: string | null;
  totaltAntalMandat: number | null;
  antalValdistriktRaknade: number | null;
  antalValdistriktSomSkaRaknas: number | null;
  lankTillProtokoll: string | null;
  totaltAntalRoster: number | null;
  antalRostberattigade: number | null;
  valdeltagande: number | null;
  antalRostberattigadeIRaknadeValdistrikt: number | null;
  valomradessparrProcent: number | null;
  meddelandetext: string | null;
  valomradeskodForegaendeVal: Array<any>;
  totaltAntalMandatForegaendeVal: number | null;
  totaltAntalRosterForegaendeVal: number | null;
  antalRostberattigadeForegaendeVal: number | null;
  valdeltagandeForegaendeVal: number | null;
  forandringTotaltAntalRoster: number | null;
  forandringValdeltagande: number | null;
  forandringAntalRostberattigade: number | null;
  statusJamforelse: string | null;
  rostfordelning: ValomradeRostfordelning;
  kvalificeradeForPersonvalLista: KvalificeradFörPersonval[];
  mandatfordelning: ValomradeMandatfordelning;
  valda: Valda;
}

export interface ValomradeRostfordelning {
  rosterPaverkaMandat: RosterPaverkaMandat;
  rosterEjPaverkaMandat: RosterEjPaverkaMandat;
}

export interface RosterPaverkaMandat {
  antalRoster?: number | null;
  antalRosterForegaendeVal?: number | null;
  forandringAntalRoster?: number | null;
  partiRoster: PartiRoster[];
  /* Optional: preliminary and partial files omit it, and App.tsx reads it with `?.`. */
  rosterOvrigaPartier?: RosterOvrigaPartier;
}

export interface RosterEjPaverkaMandat {
  antalRoster: number | null;
  andelRosterAvTotaltAntalRoster: number | null;
  antalRosterForegaendeVal: number | null;
  andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
  forandringAntalRoster: number | null;
  forandringAndelRosterAvTotaltAntalRoster: number | null;
  rosterEjAnmaltDeltagande: RosterEjAnmaltDeltagande;
  blankaRoster: BlankaRoster;
  ovrigaOgiltiga: OvrigaOgiltiga;
}

export interface RosterEjAnmaltDeltagande {
  antalRoster: number | null;
  andelRosterAvTotaltAntalRoster: number | null;
  antalRosterForegaendeVal: number | null;
  andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
  forandringAntalRoster: number | null;
  forandringAndelRosterAvTotaltAntalRoster: number | null;
}

export interface BlankaRoster {
  antalRoster: number | null;
  andelRosterAvTotaltAntalRoster: number | null;
  antalRosterForegaendeVal: number | null;
  andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
  forandringAntalRoster: number | null;
  forandringAndelRosterAvTotaltAntalRoster: number | null;
}

export interface OvrigaOgiltiga {
  antalRoster: number | null;
  andelRosterAvTotaltAntalRoster: number | null;
  antalRosterForegaendeVal: number | null;
  andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
  forandringAntalRoster: number | null;
  forandringAndelRosterAvTotaltAntalRoster: number | null;
}

/* Optional members are the ones scripts/trimResults.ts drops. The app reads a trimmed file
 * for one election and an untrimmed one for another, so declaring them required made the
 * type describe neither: a cast through fetch().json() would have promised values that are
 * undefined at run time. Only partikod, partiforkortning and andelRoster are always there. */
export interface PartiRoster {
  partibeteckning?: string | null;
  partiforkortning: string | null;
  partikod: string | null;
  fargkod?: string | null;
  ordningsnummer?: number | null;
  antalRoster?: number | null;
  andelRoster: number | null;
  deltaMandatfordelning?: string | null;
  antalRosterForegaendeVal?: number | null;
  andelRosterForegaendeVal?: number | null;
  forandringAntalRoster?: number | null;
  forandringAndelRoster?: number | null;
  listRoster?: ListRoster[];
}

export interface ListRoster {
  listnummer: string | null;
  antalRoster: number | null;
  antalRosterMedPersonrost: number | null;
  personroster: PersonRost[];
}

export interface PersonRost {
  namn: string | null;
  kandidatNummerPaListan: number | null;
  kandidatNummer: number | null;
  antalPersonroster: number | null;
}

export interface KvalificeradFörPersonval {
  partikod: string | null;
  partiforkortning: string | null;
  namn: string | null;
  kandidatnummer: number | null;
  antalPersonroster: number | null;
  andelPersonroster: number | null;
}

export interface ValomradeMandatfordelning {
  partiLista: PartiMandat[];
}

export interface PartiMandat {
  partibeteckning: string | null;
  partikod: string | null;
  partiforkortning: string | null;
  antalMandat: number | null;
  antalMandatForegaendeVal: number | null;
  forandringAntalMandat: number | null;
}

export interface Valda {
  partiLedamoterLista: PartiLedamot[];
}

export interface PartiLedamot {
  partibeteckning: string | null;
  partikod: string | null;
  partiforkortning: string | null;
  ledamoter: Ledamot[];
}

export interface Ledamot {
  invalsordning: number | null;
  kandidatnummer: number | null;
  namn: string | null;
  valgrundId: number | null;
  valgrundText: string | null;
  ersattargrupp: number | null;
  ersattareList: Ersattare[];
}

export interface Ersattare {
  ersattarordning: number | null;
  kandidatnummer: number | null;
  namn: string | null;
  valgrundId: number | null;
  valgrundText: string | null;
}

// Voting district
export interface VotingDistrictProperties {
  Lkfv: string | null;
  Vdnamn: string | null;
}
