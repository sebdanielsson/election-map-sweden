/* One place to describe each election's source data, so the download and transform scripts
 * (and, later, the app's election picker) don't each carry their own copy of the URLs.
 *
 * Every election gets its own district geometry on purpose: valdistrikt boundaries are
 * redrawn between elections, so a single shared basemap would silently mis-join results.
 * Valmyndigheten publishes a 2022-vs-2026 comparison sheet for exactly that reason. */

export interface ElectionSource {
  /** Stable id, used as the data directory name and the app's election key. */
  id: string;
  /** Human-readable label for the UI. */
  label: string;
  /** Election day, ISO 8601. Sorting on this is what makes "latest" well defined. */
  date: string;
  /** Zipped valdistrikt GeoJSON, one archive per län, all in EPSG:3006 (SWEREF99 TM). */
  districtUrls: string[];
}

const VAL_SE = "https://www.val.se";

/* 2024 used opaque /download/ ids with no discoverable pattern; 2026 does too, so both
 * lists stay hand-maintained. Re-fetch them from the "Rådata" page when a new election
 * is added rather than trying to guess the ids. */
const EU_VAL_2024_DISTRICTS = [
  "/download/18.5acd32d818deefef85cfbe/1710431898533/valdistrikt-blekinge-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfc0/1710431917792/valdistrikt-dalarnas-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfc2/1710431935757/valdistrikt-gavleborgs-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfc4/1710431950738/valdistrikt-gotlands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfc6/1710431966012/valdistrikt-hallands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfc8/1710431981447/valdistrikt-jamtlands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfca/1710431995574/valdistrikt-jonkopings-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfcc/1710432008974/valdistrikt-kalmar-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfce/1710432023047/valdistrikt-kronobergs-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfd0/1710432038927/valdistrikt-norrbottens-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfd2/1710432058310/valdistrikt-skane-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfd4/1710946075746/valdistrikt-sodermanlands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfd6/1710432087226/valdistrikt-stockholms-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfd8/1710432103944/valdistrikt-uppsala-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfda/1710432118710/valdistrikt-varmlands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfdc/1710432134273/valdistrikt-vasterbottens-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfde/1710432151134/valdistrikt-vasternorrlands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfe0/1710432166106/valdistrikt-vastmanlands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfe2/1710432182831/valdistrikt-vastra-gotalands-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfe4/1710432198776/valdistrikt-orebro-lan-eu-val.zip",
  "/download/18.5acd32d818deefef85cfe6/1710432226966/valdistrikt-ostergotlands-lan-eu-val.zip",
];

const VAL_2026_DISTRICTS = [
  "/download/18.332cf48819bd61ac151388d/1785489043954/valdistrikt-blekinge-lan-2026.zip",
  "/download/18.332cf48819bd61ac151388f/1785489086986/valdistrikt-dalarna-lan-2026.zip",
  "/download/18.332cf48819bd61ac1513890/1785489122007/valdistrikt-gotland-lan-2026.zip",
  "/download/18.332cf48819bd61ac1513893/1785489170086/valdistrikt-gavleborg-lan-2026.zip",
  "/download/18.332cf48819bd61ac1513895/1785489346068/valdistrikt-halland-lan-2026.zip",
  "/download/18.332cf48819bd61ac1513897/1785489500538/valdistrikt-jamtland-lan-2026.zip",
  "/download/18.332cf48819bd61ac1513899/1785490161803/valdistrikt-jonkoping-lan-2026.zip",
  "/download/18.332cf48819bd61ac151389b/1785490190792/valdistrikt-kalmar-lan-2026.zip",
  "/download/18.332cf48819bd61ac151389d/1785490215699/valdistrikt-kronoberg-lan-2026.zip",
  "/download/18.332cf48819bd61ac151389f/1785490246907/valdistrikt-norrbotten-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138a1/1785490288445/valdistrikt-skane-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138a3/1785490318728/valdistrikt-stockholm-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138a5/1785490349621/valdistrikt-sodermanland-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138a7/1785490377593/valdistrikt-uppsala-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138a9/1785490637632/valdistrikt-varmland-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138ab/1785490668840/valdistrikt-vasterbotten-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138af/1785490693436/valdistrikt-vasternorrland-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138ad/1785490722069/valdistrikt-vastmanland-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138b1/1785490768997/valdistrikt-vastra-gotaland-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138b3/1785490791997/valdistrikt-orebro-lan-2026.zip",
  "/download/18.332cf48819bd61ac15138b5/1785490814926/valdistrikt-ostergotland-lan-2026.zip",
];

export const ELECTIONS: Record<string, ElectionSource> = {
  "eu-2024": {
    id: "eu-2024",
    label: "EU Parliament 2024",
    date: "2024-06-09",
    districtUrls: EU_VAL_2024_DISTRICTS.map((p) => `${VAL_SE}${p}`),
  },
  "riksdag-2026": {
    id: "riksdag-2026",
    label: "Riksdag 2026",
    date: "2026-09-13",
    districtUrls: VAL_2026_DISTRICTS.map((p) => `${VAL_SE}${p}`),
  },
};

export const electionIds = () => Object.keys(ELECTIONS);

export const getElection = (id: string | undefined): ElectionSource => {
  if (!id) {
    throw new Error(`Missing election id. Known ids: ${electionIds().join(", ")}`);
  }
  const election = ELECTIONS[id];
  if (!election) {
    throw new Error(`Unknown election "${id}". Known ids: ${electionIds().join(", ")}`);
  }
  return election;
};
