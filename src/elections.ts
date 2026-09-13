/* What the app knows about each election: where its geometry lives, what its result files are
 * called, and which counting to prefer.
 *
 * Deliberately separate from `scripts/elections.ts`. That file describes where to *download*
 * raw data from val.se — opaque /download/ ids that change without notice — and the app has
 * no use for any of it. This file describes what is *published* in the bucket. The two share
 * only the election id, and `publish-districts.yaml` is what carries data from one to the
 * other, writing geometry to `data/districts/<geometryDir>/`.
 *
 * Every election gets its own geometry on purpose: valdistrikt boundaries are redrawn between
 * elections, so a shared basemap would silently mis-join results. */

export interface AppElection {
  /** Stable id, matching `scripts/elections.ts` so the publishing workflow can be pointed at it. */
  id: string;
  /** Shown in the picker. */
  label: string;
  /** Election day, ISO 8601. Sorting on this is what makes "latest" well defined. */
  date: string;
  /** Directory under `data/districts/` holding this election's reprojected geometry. */
  geometryDir: string;
  /** Every county file, named exactly as published. */
  geometryFiles: string[];
  /** Result filenames are `<prefix>_<counting>_<kind>fordelning<suffix>.json`. */
  resultPrefix: string;
  resultSuffix: string;
  /**
   * Countings to try, best first. On election night only `preliminar` exists — the `slutlig`
   * files do not appear until the final count days later — so the app has to try both and use
   * whichever is there, rather than assuming either.
   */
  countings: string[];
}

/* 2024's files predate this project's naming and are already in the bucket under these exact
 * names; they are listed verbatim rather than derived, because renaming published objects to
 * fit a pattern would break the deployed app for no gain. */
const EU_2024_GEOMETRY = [
  "VD_01_20240313_EU-val_2024.json",
  "VD_03_20240313_EU-val_2024.json",
  "VD_04_20240313_EU-val_2024.json",
  "VD_05_20240313_EU-val_2024.json",
  "VD_06_20240313_EU-val_2024.json",
  "VD_07_20240313_EU-val_2024.json",
  "VD_08_20240313_EU-val_2024.json",
  "VD_09_20240313_EU-val_2024.json",
  "VD_10_20240313_EU-val_2024.json",
  "VD_12_20240313_EU-val_2024.json",
  "VD_13_20240313_EU-val_2024.json",
  "VD_14_20240313_EU-val_2024.json",
  "VD_17_20240313_EU-val_2024.json",
  "VD_18_20240313_EU-val_2024.json",
  "VD_19_20240313_EU-val_2024.json",
  "VD_20_20240313_EU-val_2024.json",
  "VD_21_20240313_EU-val_2024.json",
  "VD_22_20240313_EU-val_2024.json",
  "VD_23_20240313_EU-val_2024.json",
  "VD_24_20240313_EU-val_2024.json",
  "VD_25_20240313_EU-val_2024.json",
];

/* 2026's names come straight from the archives val.se publishes, with `.zip` replaced by the
 * `.json` transformGeojson writes. Keeping the upstream basename means the county a file holds
 * is readable from its name, and it is what publish-districts.yaml uploads. */
const RIKSDAG_2026_GEOMETRY = [
  "valdistrikt-blekinge-lan-2026.json",
  "valdistrikt-dalarna-lan-2026.json",
  "valdistrikt-gotland-lan-2026.json",
  "valdistrikt-gavleborg-lan-2026.json",
  "valdistrikt-halland-lan-2026.json",
  "valdistrikt-jamtland-lan-2026.json",
  "valdistrikt-jonkoping-lan-2026.json",
  "valdistrikt-kalmar-lan-2026.json",
  "valdistrikt-kronoberg-lan-2026.json",
  "valdistrikt-norrbotten-lan-2026.json",
  "valdistrikt-skane-lan-2026.json",
  "valdistrikt-stockholm-lan-2026.json",
  "valdistrikt-sodermanland-lan-2026.json",
  "valdistrikt-uppsala-lan-2026.json",
  "valdistrikt-varmland-lan-2026.json",
  "valdistrikt-vasterbotten-lan-2026.json",
  "valdistrikt-vasternorrland-lan-2026.json",
  "valdistrikt-vastmanland-lan-2026.json",
  "valdistrikt-vastra-gotaland-lan-2026.json",
  "valdistrikt-orebro-lan-2026.json",
  "valdistrikt-ostergotland-lan-2026.json",
];

export const ELECTIONS: AppElection[] = [
  {
    id: "riksdag-2026",
    label: "Riksdagsvalet 2026",
    date: "2026-09-13",
    geometryDir: "riksdag-2026",
    geometryFiles: RIKSDAG_2026_GEOMETRY,
    resultPrefix: "Val_20260913",
    resultSuffix: "_00_RD",
    /* Final first: once it exists it supersedes the preliminary count, and on election night
     * it simply 404s and the preliminary one is used. */
    countings: ["slutlig", "preliminar"],
  },
  {
    id: "eu-2024",
    label: "EU-valet 2024",
    date: "2024-06-09",
    geometryDir: "EPSG4326",
    geometryFiles: EU_2024_GEOMETRY,
    resultPrefix: "EU-val_2024",
    resultSuffix: "_00_E",
    countings: ["slutlig", "preliminar"],
  },
];

/** Newest first. The picker and the default both read this order rather than re-sorting. */
export const electionsByDate: AppElection[] = [...ELECTIONS].sort((a, b) =>
  b.date.localeCompare(a.date),
);

export const latestElection = (): AppElection => {
  const first = electionsByDate[0];
  /* ELECTIONS is a non-empty literal in this file, so this cannot fire — but an empty array
   * would otherwise hand `undefined` to every caller and fail somewhere less obvious. */
  if (!first) throw new Error("No elections are configured");
  return first;
};

export const electionById = (id: string | null | undefined): AppElection | undefined =>
  ELECTIONS.find((election) => election.id === id);

export const resultFileName = (
  election: AppElection,
  counting: string,
  kind: "rost" | "mandat",
): string => `${election.resultPrefix}_${counting}_${kind}fordelning${election.resultSuffix}.json`;
