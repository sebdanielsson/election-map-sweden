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

/* Both lists are hand-maintained: the /download/ ids are opaque and have no discoverable
 * pattern. They are also not stable — val.se re-issued every 2024 id under a new prefix at
 * some point after this project first hardcoded them, and the original twenty-one all
 * return 404 today. Re-fetch from the "Rådata" page rather than guessing, and expect to
 * have to do it again. */
const EU_VAL_2024_DISTRICTS = [
  "/download/18.162047b519a91d053311b7d8/1760947831307/valdistrikt-blekinge-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7d7/1760947841277/valdistrikt-dalarnas-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7dd/1760947851253/valdistrikt-gavleborgs-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7e0/1760947861012/valdistrikt-gotlands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7df/1760947872596/valdistrikt-hallands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7e2/1760947883375/valdistrikt-jamtlands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7e1/1760947895179/valdistrikt-jonkopings-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7e3/1760947903123/valdistrikt-kalmar-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f1/1760947913942/valdistrikt-kronobergs-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f3/1760947923327/valdistrikt-norrbottens-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f4/1760947957062/valdistrikt-skane-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f6/1760947975598/valdistrikt-stockholms-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f7/1760947966287/valdistrikt-sodermanlands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f9/1760947985838/valdistrikt-uppsala-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f8/1760947996767/valdistrikt-varmlands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7fa/1760948008697/valdistrikt-vasterbottens-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7ee/1760948017481/valdistrikt-vasternorrlands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7ed/1760948027492/valdistrikt-vastmanlands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7ef/1760948037181/valdistrikt-vastra-gotalands-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f2/1760947933874/valdistrikt-orebro-lan-eu-val-2024.zip",
  "/download/18.162047b519a91d053311b7f5/1760947942933/valdistrikt-ostergotlands-lan-eu-val-2024.zip",
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
  /* Own properties only: a plain object lookup accepts inherited names, so
   * getElection("toString") returned Object.prototype.toString and the caller then failed
   * on a missing districtUrls rather than on the unknown id it actually had. */
  const election = Object.hasOwn(ELECTIONS, id) ? ELECTIONS[id] : undefined;
  if (!election) {
    throw new Error(`Unknown election "${id}". Known ids: ${electionIds().join(", ")}`);
  }
  return election;
};
