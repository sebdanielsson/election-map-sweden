import { useEffect, useState } from "react";
import type { ErrorEvent as MapboxErrorEvent, GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import type { Feature, FeatureCollection } from "geojson";
import type {
  Rostfordelning,
  Mandatfordelning,
  PartiRoster,
  PartiUppslag,
  /*   Valdistrikt,
    RosterPaverkaMandat,
    ListRoster,
    Personrost,
    RosterOvrigaPartier,
    RosterEjPaverkaMandat, */
  VotingDistrictProperties,
} from "./electionDataInterfaces";
import type { AppElection } from "./elections";
import { electionById, electionsByDate, latestElection, resultFileName } from "./elections";

/* `rosterOvrigaPartier` is a separate bucket from partiRoster — votes for parties below the
 * reporting threshold — so the two have to travel together or any "other parties" total
 * computed from partiRoster alone understates the real figure. It is 0 in every district of
 * EU-val 2024, but municipal elections carry many small local parties. */
export interface DistrictResults {
  parties: PartiRoster[];
  ovrigaShare: number | null;
}

const getDistrictResults = (
  rostfordelningData: Rostfordelning,
  districtId: string | null,
): DistrictResults | null => {
  if (!districtId) return null;

  const districtData = rostfordelningData.valdistrikt.find((d) => d.valdistriktskod === districtId);
  if (!districtData) return null;
  const paverkaMandat = districtData.rostfordelning.rosterPaverkaMandat;
  return {
    parties: paverkaMandat.partiRoster,
    /* Optional on purpose: a partial or preliminary file that omits it would otherwise
     * throw inside the Mapbox click handler, where nothing catches it — the sidebar would
     * silently keep the previous district's numbers. */
    ovrigaShare: paverkaMandat.rosterOvrigaPartier?.andelRoster ?? null,
  };
};

// Public election data hosted on Backblaze B2 (bucket: election-map-sweden)
const DATA_BASE_URL = "https://f001.backblazeb2.com/file/election-map-sweden";

/** Thrown when an election's files are simply not in the bucket yet, as opposed to broken. */
class NotPublishedError extends Error {
  /* Which half is missing. Results and boundaries arrive by different routes — results on a
   * five-minute poll, boundaries from a manual publish — so "no results yet" is the wrong
   * thing to tell someone whose results are fine and whose map has never been uploaded. */
  readonly resource: "results" | "boundaries";
  constructor(what: string, resource: "results" | "boundaries") {
    super(what);
    this.name = "NotPublishedError";
    this.resource = resource;
  }
}

/* 404 is a fact about the world — Valmyndigheten has not published this counting yet — and has
 * to be distinguishable from a 500 or a dropped connection. Returning null for it lets the
 * caller try the next counting instead of failing the page. */
const fetchJsonOrNull = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} returned HTTP ${String(response.status)}`);
  return response.json();
};

export interface ElectionResults {
  rostfordelning: Rostfordelning;
  mandatfordelning: Mandatfordelning;
  /** Which counting these came from, so the UI can say whether figures are preliminary. */
  counting: string;
}

const fetchResults = async (election: AppElection): Promise<ElectionResults> => {
  for (const counting of election.countings) {
    const [rost, mandat] = await Promise.all([
      fetchJsonOrNull(
        `${DATA_BASE_URL}/data/election-results/${resultFileName(election, counting, "rost")}`,
      ),
      fetchJsonOrNull(
        `${DATA_BASE_URL}/data/election-results/${resultFileName(election, counting, "mandat")}`,
      ),
    ]);
    /* Both or neither. The publishing workflow refuses to upload half a snapshot, but the two
     * objects are still written by separate requests, so a run that died between them leaves a
     * mismatched pair in the bucket. Skipping to the next counting is better than rendering a
     * preliminary vote count against a final seat allocation. */
    if (rost && mandat) {
      const rostfordelning = rost as Rostfordelning;
      const mandatfordelning = mandat as Mandatfordelning;
      /* Both present is not the same as both current. The publishing workflow writes these two
       * objects in separate requests and overwrites them in place, so a reader arriving
       * mid-update gets a new mandatfordelning beside the previous rostfordelning — and
       * `max-age=60` lets a browser hold the two independently even on a clean run. The files
       * carry provenance precisely so this can be checked instead of assumed: if they disagree
       * about which election and which counting they describe, they are not one snapshot. */
      /* The three identity fields are the same all evening — every preliminary snapshot of the
       * same election carries them — so on their own they caught nothing during exactly the
       * window they were meant to cover. `antalUppdateringar`, the publication counter, is
       * what actually distinguishes one snapshot from the next.
       *
       * Deliberately not `senasteUppdateringstid`, which looks like the obvious choice and is
       * not: the real 2022 pair is stamped a second apart (14:07:27 against 14:07:28), so
       * requiring those to match would reject a perfectly good pair. The counter matched in
       * both samples checked — 2026 at 3, 2022 at 1215. */
      const sameSnapshot =
        rostfordelning.valtillfalle === mandatfordelning.valtillfalle &&
        rostfordelning.valtyp === mandatfordelning.valtyp &&
        rostfordelning.rakningstillfalle === mandatfordelning.rakningstillfalle &&
        rostfordelning.antalUppdateringar === mandatfordelning.antalUppdateringar;
      if (!sameSnapshot) {
        console.warn(
          `Skipping ${counting}: rostfordelning and mandatfordelning describe different ` +
            `snapshots (update ${String(rostfordelning.antalUppdateringar)} vs ` +
            `${String(mandatfordelning.antalUppdateringar)})`,
        );
        continue;
      }
      return { rostfordelning, mandatfordelning, counting };
    }
  }
  throw new NotPublishedError(election.label, "results");
};

const loadGeoJSONFiles = async (election: AppElection): Promise<FeatureCollection[]> => {
  const featureCollections: FeatureCollection[] = [];
  const missing: string[] = [];

  for (const file of election.geometryFiles) {
    try {
      const data = await fetchJsonOrNull(
        `${DATA_BASE_URL}/data/districts/${election.geometryDir}/${file}`,
      );
      if (data === null) {
        missing.push(file);
        continue;
      }
      const collection = data as FeatureCollection;
      featureCollections.push({
        type: "FeatureCollection",
        features: collection.features.map((feature: Feature): Feature => ({
          type: "Feature",
          geometry: feature.geometry,
          properties: feature.properties,
        })),
      });
    } catch (error) {
      /* Not folded into `missing`. A 500, a DNS failure or malformed JSON is a fault, and
       * counting it as absent would report a working election as unpublished and tell the
       * reader to wait for figures that are already there. fetchJsonOrNull returns null for
       * 404 and throws for everything else, so this branch is only ever a real failure. */
      throw new Error(`Could not load ${file}: ${String(error)}`);
    }
  }

  /* Every county or none. This used to log a failure and carry on, which drew a map with a
   * county-shaped hole in it and no indication anything was wrong — the same class of silent
   * partial as the pipeline's own guards exist to prevent. A whole election missing is a
   * different message from a few counties failing, because the first is expected before
   * publication and the second is not. */
  if (missing.length === election.geometryFiles.length) {
    throw new NotPublishedError(election.label, "boundaries");
  }
  if (missing.length > 0) {
    throw new Error(
      `${String(missing.length)} of ${String(election.geometryFiles.length)} district files ` +
        `failed to load (${missing.slice(0, 3).join(", ")}…)`,
    );
  }

  return featureCollections;
};

/* This lives at module scope on purpose. oxc's React Compiler — enabled by
 * `react({ compiler: true })` in vite.config.ts — cannot lower an `import()` expression and
 * silently skips any component containing one, which cost App its memoisation entirely.
 * Calling out to this keeps the chunk split without putting `import()` inside the component.
 * Both call sites share it: `import()` is memoised, so the second call resolves immediately. */
const loadMapbox = () => Promise.all([import("mapbox-gl"), import("mapbox-gl/dist/mapbox-gl.css")]);

/* Generous on purpose: the map is ready in about 5 s on a throttled 1 Mbps link, so this
 * only trips on a load that is not going to finish. */
const MAP_LOAD_DEADLINE_MS = 30_000;

const closeSidebar = () => {
  const sidebar = document.getElementById("sidebar");
  if (sidebar && !sidebar.classList.contains("translate-x-full")) {
    sidebar.classList.add("translate-x-full");
  }
};

export default function App() {
  const [selectedDistrict, setSelectedDistrict] = useState<null | VotingDistrictProperties>(null);
  const [districtResults, setDistrictResults] = useState<null | DistrictResults>(null);
  /* Both come from the result files rather than being assumed: the threshold that separates
   * reported parties from "Others" is per election area (4% for riksdag and EU, different
   * for kommun and region), and the name lookup covers parties whose partiforkortning is
   * blank — 64 of the 100 parties in the 2024 file have one. */
  const [threshold, setThreshold] = useState<number | null>(null);
  const [partyNames, setPartyNames] = useState<null | Record<string, PartiUppslag>>(null);
  const [nationalResults, setNationalResults] = useState<null | PartiRoster[]>(null);
  const [map, setMap] = useState<MapboxMap | null>(null);
  // Only the setter is used; the parsed data is passed straight into getDistrictResults().
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /* The election day itself is the common case for this app, so it opens on the newest
   * election. Before Valmyndigheten publishes anything that election has no results, which is
   * reported as its own state rather than as an error — "not counted yet" is not a fault. */
  const [electionId, setElectionId] = useState<string>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("val");
    return electionById(fromUrl)?.id ?? latestElection().id;
  });
  const [notPublished, setNotPublished] = useState<{ label: string; resource: string } | null>(
    null,
  );
  /* Bumped by the retry timer below; in the data effect's deps so a bump re-runs it. */
  const [retryTick, setRetryTick] = useState(0);
  const [counting, setCounting] = useState<string | null>(null);
  const election: AppElection = electionById(electionId) ?? latestElection();

  useEffect(() => {
    /* Guard the load handler: StrictMode mounts effects twice in dev, and the component can
     * unmount before Mapbox fires `load`. Without this, cleanup removes the map and the
     * handler then puts that disposed instance into state, which the effect below would
     * happily wire handlers onto. Loading mapbox-gl awaits before the map is constructed, so
     * cleanup can now also land before the map object exists at all. */
    let cancelled = false;
    let createdMap: MapboxMap | null = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    /* mapbox-gl is ~1.8 MB of JS and ~49 kB of CSS — far more than the rest of the app put
     * together. Loading it here rather than importing it at the top of this file keeps it out
     * of the entry chunk, so the map frame, spinner and sidebar paint while it downloads. */
    const initMap = async () => {
      const [{ default: mapboxgl }] = await loadMapbox();
      if (cancelled) return;

      mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
      const newMap = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/standard",
        center: [16.325556, 62.3875],
        zoom: 5,
      });
      createdMap = newMap;

      /* A request that is opened and never answered — hung proxy, captive portal, a source
       * whose TileJSON never returns — settles neither `load` nor `error`, so every handler
       * below stays silent and the spinner would never go away. Mapbox has no request
       * timeout of its own, so this is the only thing that ends that state. */
      deadline = setTimeout(() => {
        if (cancelled) return;
        console.error(`Map did not finish loading within ${String(MAP_LOAD_DEADLINE_MS)} ms`);
        setLoadError("Could not load the map. Check your connection and reload the page.");
      }, MAP_LOAD_DEADLINE_MS);

      /* Until `load` fires nothing is in `map`, so the data effect below — which owns the
       * long-lived error handler — has not run yet. Mapbox logs such a failure to the console
       * but nothing reaches the user, so a style that never arrives (expired or invalid token,
       * 401, offline) just spins forever. */
      const onPreLoadError = (e: MapboxErrorEvent) => {
        if (cancelled) return;
        console.error("Failed to load the map style:", e.error);
        setLoadError("Could not load the map. Check your connection and reload the page.");
      };
      newMap.on("error", onPreLoadError);

      /* Stop listening once the style itself is in. `load` waits for the first complete frame,
       * so the sprite and glyph requests race it, and one of those 404ing would report a fatal
       * error over a map that is about to work fine. Nothing is swallowed afterwards: Mapbox
       * logs unhandled errors itself while no listener is registered, and the data effect
       * attaches its own. */
      newMap.once("style.load", () => {
        newMap.off("error", onPreLoadError);
      });

      /* Clearing happens here and not on `style.load`, which fires even when the style is
       * broken — an import that fails is reported and then `style.load` follows in the same
       * tick (mapbox fires ErrorEvent("Failed to load imports") immediately before it).
       * Clearing there erased the message for a style that had demonstrably failed, leaving
       * the spinner up for good. `load` only fires once the map really is usable. */
      newMap.on("load", () => {
        clearTimeout(deadline);
        if (cancelled) return;
        setLoadError(null);
        setMap(newMap);
      });
    };

    /* A failed chunk fetch would otherwise leave the spinner up forever and surface only as
     * an unhandledrejection, the same way the data fetches below would. */
    initMap().catch((err: unknown) => {
      if (cancelled) return;
      console.error("Failed to load the map library:", err);
      setLoadError("Could not load the map. Check your connection and reload the page.");
    });

    return () => {
      cancelled = true;
      clearTimeout(deadline);
      createdMap?.remove();
    };
  }, []);

  useEffect(() => {
    /* The work below spans three awaits and then mutates the map and component state. The map
     * init effect's cleanup calls remove() on unmount — and StrictMode runs that in dev on
     * every mount — so without this flag a teardown mid-fetch lands addSource/addLayer and
     * event handlers on a disposed instance. */
    let cancelled = false;
    /* Recorded rather than reconstructed: the cleanup must remove precisely what this run
     * added, and how many there are depends on how many county files came back. */
    const addedSourceIds: string[] = [];
    const addedLayerIds: string[] = [];
    /* Handlers and the tooltip are torn down with the layers they read. They used to be
     * registered on every run and never removed, so switching election stacked a second set
     * on the same map while the first kept querying layer ids that had just been deleted and
     * calling setData on a removed source. */
    const cleanUps: (() => void)[] = [];

    const loadDataAndSetUpMap = async () => {
      /* Cleared at the start of each attempt so a previous election's verdict cannot survive
       * a switch — selecting 2024 after 2026 came back unpublished must not keep showing that
       * notice. Inside the async body rather than the effect body so it does not run
       * synchronously during render. */
      setNotPublished(null);
      setLoadError(null);
      setCounting(null);
      setSelectedDistrict(null);
      setDistrictResults(null);
      setLoading(true);

      if (map) {
        // Map is already loaded when we set it in state, so we can proceed directly
        map.resize();
        const featureCollections = await loadGeoJSONFiles(election);
        if (cancelled) return;
        /* loadGeoJSONFiles logs and skips a district it can't fetch, so a total outage comes
         * back as an empty array. Without this the app clears the spinner and renders a bare
         * map with no districts and no explanation. */
        if (featureCollections.length === 0) {
          throw new Error("No district boundaries could be loaded");
        }

        for (const [index, transformedData] of featureCollections.entries()) {
          const sourceId = `voting-districts-${index}`;
          addedSourceIds.push(sourceId);
          addedLayerIds.push(`${sourceId}-fill`, `${sourceId}-outline`);
          map.addSource(sourceId, {
            type: "geojson",
            data: transformedData,
          });

          map.addLayer({
            id: `${sourceId}-fill`,
            type: "fill",
            source: sourceId,
            layout: {},
            paint: {
              "fill-color": "#006AA7",
              "fill-opacity": 0.5,
            },
          });

          map.addLayer({
            id: `${sourceId}-outline`,
            type: "line",
            source: sourceId,
            layout: {},
            paint: {
              "line-color": "#000000",
              "line-width": 0.5,
            },
          });
        }

        addedSourceIds.push("highlight-feature");
        addedLayerIds.push("voting-districts-highlight");
        map.addSource("highlight-feature", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        map.addLayer({
          id: "voting-districts-highlight",
          type: "fill",
          source: "highlight-feature",
          layout: {},
          paint: {
            "fill-color": "#FECC02",
            "fill-opacity": 0.5,
          },
        });

        const results = await fetchResults(election);
        if (cancelled) return;
        const fetchedRostfordelningData = results.rostfordelning;
        const fetchedNationalResultsData = results.mandatfordelning;
        setCounting(results.counting);

        setNationalResults(
          fetchedNationalResultsData.valomrade.rostfordelning.rosterPaverkaMandat.partiRoster,
        );
        const publishedThreshold = fetchedNationalResultsData.valomrade.valomradessparrProcent;
        /* Normalised to null rather than trusted, so the `?? 4` default downstream actually
         * applies. Passing a non-numeric value straight through would make both the `<` and
         * `>=` comparisons false and empty both party groups instead. */
        setThreshold(
          /* Range-checked, not merely finite. -1 or 101 are finite numbers that would send
           * every party to one side of the `< cutoff` / `>= cutoff` split and empty the
           * other group, instead of falling back to the documented 4%. Both real files
           * publish 4.0. */
          typeof publishedThreshold === "number" &&
            Number.isFinite(publishedThreshold) &&
            publishedThreshold >= 0 &&
            publishedThreshold <= 100
            ? publishedThreshold
            : null,
        );
        setPartyNames(fetchedRostfordelningData.partier ?? null);
        setLoading(false);

        const onClick = (e: mapboxgl.MapMouseEvent) => {
          for (const [index] of featureCollections.entries()) {
            const sourceId = `voting-districts-${index}-fill`;
            const features = map.queryRenderedFeatures(e.point, {
              layers: [sourceId],
            });

            const feature = features[0];
            if (feature) {
              setSelectedDistrict(feature.properties as VotingDistrictProperties);

              if (feature.properties && fetchedRostfordelningData) {
                const results = getDistrictResults(
                  fetchedRostfordelningData,
                  feature.properties.Lkfv,
                );
                setDistrictResults(results);
              } else {
                console.error("No properties found for the selected district");
              }

              const highlightSource = map.getSource("highlight-feature") as GeoJSONSource;
              highlightSource.setData({
                type: "FeatureCollection",
                features: [feature as unknown as Feature],
              });

              const sidebar = document.getElementById("sidebar");
              if (sidebar && sidebar.classList.contains("translate-x-full")) {
                sidebar.classList.remove("translate-x-full");
              }
            }
          }
        };

        /* Already resolved: this effect only runs once the map exists, so the chunk is in
         * the module registry. Taken off `default` to match the constructor above —
         * mapbox-gl ships a UMD bundle, whose named exports exist only via bundler interop. */
        const [{ default: mapboxgl }] = await loadMapbox();
        if (cancelled) return;

        map.on("click", onClick);
        cleanUps.push(() => {
          map.off("click", onClick);
        });

        const tooltip = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
        });

        const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
          for (const [index] of featureCollections.entries()) {
            const sourceId = `voting-districts-${index}-fill`;
            const features = map.queryRenderedFeatures(e.point, {
              layers: [sourceId],
            });

            const feature = features[0];
            if (feature) {
              const districtName = feature.properties?.Vdnamn;

              if (districtName) {
                /* District names come from the GeoJSON served out of the public bucket, so
                 * they are external input. setDOMContent with textContent keeps the bold
                 * styling that setHTML gave us while making the string impossible to
                 * interpret as markup. */
                const label = document.createElement("strong");
                label.textContent = String(districtName);
                tooltip.setLngLat(e.lngLat).setDOMContent(label).addTo(map);
              }
              return;
            }
          }
          tooltip.remove();
        };

        map.on("mousemove", onMouseMove);
        cleanUps.push(() => {
          map.off("mousemove", onMouseMove);
          tooltip.remove();
        });

        const onMapError = (e: unknown) => {
          console.error("Map error:", e);
        };
        map.on("error", onMapError);
        cleanUps.push(() => {
          map.off("error", onMapError);
        });
      }
    };

    /* `void` here would discard a rejection: fetchRostfordelningData and
     * fetchNationalResultsData both throw on a non-OK response, which would leave the
     * spinner up forever and surface only as an unhandledrejection in the console. */
    loadDataAndSetUpMap().catch((err: unknown) => {
      if (cancelled) return;
      /* "Not published yet" is the expected state for hours on election day and is not an
       * error: it gets its own message and leaves the other elections selectable, rather than
       * telling someone to check a connection that is working fine. */
      if (err instanceof NotPublishedError) {
        setNotPublished({ label: err.message, resource: err.resource });
        setLoading(false);
        return;
      }
      console.error("Failed to load election data:", err);
      setLoadError("Could not load the election data. Check your connection and reload the page.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
      /* Switching elections re-runs this effect against the same map, so the previous
       * election's sources and layers have to go — mapbox rejects addSource on an id that
       * already exists, and leaving them would draw two sets of boundaries on top of each
       * other. Removed in dependency order: a source cannot be dropped while a layer still
       * references it. */
      if (!map) return;
      for (const undo of cleanUps) undo();
      for (const id of addedLayerIds) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of addedSourceIds) {
        if (map.getSource(id)) map.removeSource(id);
      }
    };
  }, [map, election, retryTick]);

  /* Retries while something is unpublished, which is the normal state for hours on election
   * day. Without this the overlay promised the map would pick up new figures and then never
   * looked again, so a page opened before publication sat there until someone reloaded it.
   *
   * Only runs when there is something to wait for, and stops after an hour: a tab left open
   * overnight should not poll the bucket until the battery runs out. The published cadence is
   * about ten minutes, so a minute between attempts is frequent enough to feel immediate and
   * far short of hammering anything. */
  useEffect(() => {
    if (!notPublished) return;
    if (retryTick >= 60) return;
    const timer = setTimeout(() => {
      setRetryTick((tick) => tick + 1);
    }, 60_000);
    return () => {
      clearTimeout(timer);
    };
  }, [notPublished, retryTick]);

  /* The abbreviation is what the table shows, but it is blank for most registered parties —
   * 64 of the 100 in the 2024 file. Fall back to the registered name, then to the code, so a
   * row can never render empty. */
  const partyLabel = (party: PartiRoster): string => {
    const abbreviation = party.partiforkortning?.trim();
    if (abbreviation) return abbreviation;
    const registered = party.partikod
      ? partyNames?.[party.partikod]?.partibeteckning?.trim()
      : null;
    return registered || party.partibeteckning?.trim() || party.partikod || "—";
  };

  const renderDistrictResults = (
    results: DistrictResults | null,
    nationalResults: PartiRoster[] | null,
  ) => {
    if (!results) return null;

    /* Valmyndigheten publishes the threshold per election area (valomradessparrProcent).
     * Hardcoding 4 is right for riksdag and EU but wrong for kommun and region, so fall back
     * to it only when the file does not say. */
    const cutoff = threshold ?? 4;
    const reported = results.parties.filter((p) => p.andelRoster !== null);
    const others = reported.filter((p) => (p.andelRoster ?? 0) < cutoff);
    const majorParties = reported.filter((p) => (p.andelRoster ?? 0) >= cutoff);

    /* Parties below the threshold plus the parties that are not itemised at all. */
    const othersTotal =
      others.reduce((sum, party) => sum + (party.andelRoster ?? 0), 0) + (results.ovrigaShare ?? 0);

    const getNationalResult = (partikod: string) => {
      if (!nationalResults) return null;
      return nationalResults.find((p) => p.partikod === partikod)?.andelRoster;
    };

    return (
      <table className="borderless-table border-collapse text-xs">
        <thead className="text-sm font-bold">
          <tr>
            <th>Party</th>
            <th>% District</th>
            <th>% National</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {majorParties.map((party) => {
            const nationalRes = party.partikod ? getNationalResult(party.partikod) : null;
            return (
              <tr key={party.partikod}>
                <td>{partyLabel(party)}</td>
                <td>{party.andelRoster?.toFixed(2)}</td>
                <td>{nationalRes != null ? nationalRes.toFixed(2) : "N/A"}</td>
              </tr>
            );
          })}
          {othersTotal > 0 && (
            <tr>
              <td>Others</td>
              <td>{othersTotal.toFixed(2)}</td>
              <td>N/A</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  return (
    <main className="relative grid h-dvh grid-cols-1 md:p-6">
      <div className="relative flex h-full w-full overflow-hidden">
        {loadError && (
          <div className="absolute z-50 flex h-full w-full items-center justify-center rounded-xl bg-gray-800/50 p-6 backdrop-blur-md">
            <p role="alert" className="max-w-md text-center text-sm text-white">
              {loadError}
            </p>
          </div>
        )}
        {loading && !loadError && (
          <div className="absolute z-50 flex h-full w-full items-center justify-center rounded-xl bg-gray-800/50 backdrop-blur-md">
            <div
              className="absolute h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
              role="status"
            >
              <span className="absolute! -m-px! h-px! w-px! overflow-hidden! border-0! p-0! whitespace-nowrap! [clip:rect(0,0,0,0)]!">
                Loading...
              </span>
            </div>
          </div>
        )}
        {notPublished && !loadError && (
          <div className="absolute z-50 flex h-full w-full items-center justify-center rounded-xl bg-gray-800/50 p-6 backdrop-blur-md">
            <p role="status" className="max-w-md text-center text-sm text-white">
              {notPublished.resource === "results"
                ? `No results have been published for ${notPublished.label} yet.`
                : `The map boundaries for ${notPublished.label} have not been published yet.`}{" "}
              Pick an earlier election above, or wait — this page checks again every minute.
            </p>
          </div>
        )}

        {/* Above the map rather than in the sidebar: the sidebar is hidden until a district is
            clicked, and the election you are looking at has to be visible before then. */}
        <div className="absolute top-2 left-2 z-50 flex items-center gap-2 rounded-lg bg-gray-800/60 px-3 py-2 text-white backdrop-blur-md">
          <label htmlFor="election" className="text-xs font-bold">
            Election
          </label>
          <select
            id="election"
            value={election.id}
            onChange={(e) => {
              setElectionId(e.target.value);
              /* Kept in the URL so a particular election can be linked to and survives a
                 reload; the initial state reads it back. */
              const url = new URL(window.location.href);
              url.searchParams.set("val", e.target.value);
              window.history.replaceState(null, "", url);
            }}
            className="rounded bg-gray-900/70 px-2 py-1 text-xs"
          >
            {electionsByDate.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {/* Which counting is on screen. Preliminary figures change all evening and the final
              count lands days later, so showing one as the other is the mistake worth guarding
              against — the pipeline carries `rakningstillfalle` precisely so this can be said. */}
          {counting && (
            <span className="text-xs text-slate-300">
              {counting === "slutlig" ? "Final count" : "Preliminary count"}
            </span>
          )}
        </div>

        <div id="map" className="grow rounded-xl bg-gray-100"></div>
        <div
          id="sidebar"
          className="absolute right-0 bottom-0 z-50 w-full translate-x-full transform overflow-scroll rounded-t-xl bg-gray-800/50 p-4 text-white backdrop-blur-md transition-transform duration-500 ease-in-out lg:h-full lg:w-3/12 lg:max-w-sm lg:rounded-l-none lg:rounded-r-xl lg:duration-300"
        >
          {selectedDistrict ? (
            <div>
              <div className="relative flex flex-row justify-between">
                <h2 className="mb-2 text-lg font-bold text-slate-300">{selectedDistrict.Vdnamn}</h2>
                <button onClick={closeSidebar} className="h-6 text-white">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fill="currentColor"
                      d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"
                    />
                  </svg>
                </button>
              </div>
              {renderDistrictResults(districtResults, nationalResults)}
            </div>
          ) : (
            <div>
              <h2 className="text-md font-bold">Click on a district</h2>
              <p>Click on a voting district to see the details.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
