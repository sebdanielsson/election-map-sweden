export interface ShapeJson {
    valtillfalle: string | null;
    valklass: string | null;
    rakningstillfalle: string | null;
    valtyp: string | null;
    senasteUppdateringstid: string | null;
    antalUppdateringar: number | null;
    antalValdistriktRaknade: number | null;
    antalValdistriktSomSkaRaknas: number | null;
    valdistrikt: Valdistrikt[];
}

export interface Valdistrikt {
    namn: string | null;
    valdistriktstyp: string | null;
    rapporteringsTid: string | null;
    totaltAntalRoster: number | null;
    antalRostberattigade: number | null;
    valdeltagandeVallokal: number | null;
    valdistriktskod: string | null;
    kommunkod: string | null;
    lankod: string | null;
    valomradeskod: string | null;
    kretskod: string | null;
    kommunvalkretsNamn: string | null;
    kommunvalkretsKod: string | null;
    valdistriktskodForegaendeVal: string | null;
    totaltAntalRosterForegaendeVal: number | null;
    antalRostberattigadeForegaendeVal: number | null;
    valdeltagandeForegaendeVal: number | null;
    forandringTotaltAntalRoster: number | null;
    forandringValdeltagande: number | null;
    forandringAntalRostberattigade: number | null;
    statusJamforelse: string | null;
    rostfordelning: Rostfordelning;
}

export interface Rostfordelning {
    rosterPaverkaMandat: RosterPaverkaMandat;
    rosterOvrigaPartier: RosterOvrigaPartier;
    rosterEjPaverkaMandat: RosterEjPaverkaMandat;
}

export interface RosterPaverkaMandat {
    antalRoster: number | null;
    antalRosterForegaendeVal: number | null;
    forandringAntalRoster: number | null;
    partiRoster: PartiRoster[];
}

export interface PartiRoster {
    partibeteckning: string | null;
    partiforkortning: string | null;
    partikod: string | null;
    fargkod: string | null;
    ordningsnummer: number | null;
    antalRoster: number | null;
    andelRoster: number | null;
    antalRosterForegaendeVal: number | null;
    andelRosterForegaendeVal: number | null;
    forandringAntalRoster: number | null;
    forandringAndelRoster: number | null;
    listRoster: ListRoster[];
}

export interface ListRoster {
    listnummer: string | null;
    antalRoster: number | null;
    antalRosterMedPersonrost: number | null;
    personroster: Personrost[];
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
    antalRosterForegaendeVal: number | null;
    andelRosterForegaendeVal: number | null;
    forandringAntalRoster: number | null;
    forandringAndelRoster: number | null;
}

export interface RosterEjPaverkaMandat {
    antalRoster: number | null;
    andelRosterAvTotaltAntalRoster: number | null;
    antalRosterForegaendeVal: number | null;
    andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
    forandringAntalRoster: number | null;
    forandringAndelRosterAvTotaltAntalRoster: number | null;
    rosterEjAnmaltDeltagande: {
        antalRoster: number | null;
        andelRosterAvTotaltAntalRoster: number | null;
        antalRosterForegaendeVal: number | null;
        andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
        forandringAntalRoster: number | null;
        forandringAndelRosterAvTotaltAntalRoster: number | null;
    };
    blankaRoster: {
        antalRoster: number | null;
        andelRosterAvTotaltAntalRoster: number | null;
        antalRosterForegaendeVal: number | null;
        andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
        forandringAntalRoster: number | null;
        forandringAndelRosterAvTotaltAntalRoster: number | null;
    };
    ovrigaOgiltiga: {
        antalRoster: number | null;
        andelRosterAvTotaltAntalRoster: number | null;
        antalRosterForegaendeVal: number | null;
        andelRosterAvTotaltAntalRosterForegaendeVal: number | null;
        forandringAntalRoster: number | null;
        forandringAndelRosterAvTotaltAntalRoster: number | null;
    };
}

export interface VotingDistrictProperties {
    Lkfv: string;
    Vdnamn: string;
}
