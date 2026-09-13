import { useEffect, useState } from "react";
import type { ErrorEvent as MapboxErrorEvent, GeoJSONSource, Map as MapboxMap } from "mapbox-gl";
import type { Feature, FeatureCollection } from "geojson";
import type {
  Rostfordelning,
  Mandatfordelning,
  PartiRoster,
  /*   Valdistrikt,
    RosterPaverkaMandat,
    ListRoster,
    Personrost,
    RosterOvrigaPartier,
    RosterEjPaverkaMandat, */
  VotingDistrictProperties,
} from "./electionDataInterfaces";

const getDistrictResults = (
  rostfordelningData: Rostfordelning,
  districtId: string | null,
): PartiRoster[] | null => {
  if (!districtId) return null;

  const districtData = rostfordelningData.valdistrikt.find((d) => d.valdistriktskod === districtId);
  if (!districtData) return null;
  return districtData.rostfordelning.rosterPaverkaMandat.partiRoster;
};

// Public election data hosted on Backblaze B2 (bucket: election-map-sweden)
const DATA_BASE_URL = "https://f001.backblazeb2.com/file/election-map-sweden";

const fetchNationalResultsData = async (): Promise<Mandatfordelning> => {
  const response = await fetch(
    `${DATA_BASE_URL}/data/election-results/EU-val_2024_slutlig_mandatfordelning_00_E.json`,
  );
  if (!response.ok) throw new Error("Network response was not ok");
  return response.json();
};

const loadGeoJSONFiles = async (): Promise<FeatureCollection[]> => {
  const fileUrls = [
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

  const featureCollections: FeatureCollection[] = [];

  for (const url of fileUrls) {
    try {
      const response = await fetch(`${DATA_BASE_URL}/data/districts/EPSG4326/${url}`);
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();

      const transformedData: FeatureCollection = {
        type: "FeatureCollection",
        features: data.features.map((feature: Feature): Feature => ({
          type: "Feature",
          geometry: feature.geometry,
          properties: feature.properties,
        })),
      };

      featureCollections.push(transformedData);
    } catch (error) {
      console.error("Error fetching GeoJSON data:", error);
    }
  }

  return featureCollections;
};

const fetchRostfordelningData = async (): Promise<Rostfordelning> => {
  const response = await fetch(
    `${DATA_BASE_URL}/data/election-results/EU-val_2024_slutlig_rostfordelning_00_E.json`,
  );
  if (!response.ok) throw new Error("Network response was not ok");
  return response.json();
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
  const [districtResults, setDistrictResults] = useState<null | PartiRoster[]>(null);
  const [nationalResults, setNationalResults] = useState<null | PartiRoster[]>(null);
  const [map, setMap] = useState<MapboxMap | null>(null);
  // Only the setter is used; the parsed data is passed straight into getDistrictResults().
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

    const loadDataAndSetUpMap = async () => {
      if (map) {
        // Map is already loaded when we set it in state, so we can proceed directly
        map.resize();
        const featureCollections = await loadGeoJSONFiles();
        if (cancelled) return;
        /* loadGeoJSONFiles logs and skips a district it can't fetch, so a total outage comes
         * back as an empty array. Without this the app clears the spinner and renders a bare
         * map with no districts and no explanation. */
        if (featureCollections.length === 0) {
          throw new Error("No district boundaries could be loaded");
        }

        for (const [index, transformedData] of featureCollections.entries()) {
          const sourceId = `voting-districts-${index}`;
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

        const [fetchedRostfordelningData, fetchedNationalResultsData] = await Promise.all([
          fetchRostfordelningData(),
          fetchNationalResultsData(),
        ]);
        if (cancelled) return;

        setNationalResults(
          fetchedNationalResultsData.valomrade.rostfordelning.rosterPaverkaMandat.partiRoster,
        );
        setLoading(false);

        map.on("click", (e) => {
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
        });

        /* Already resolved: this effect only runs once the map exists, so the chunk is in
         * the module registry. Taken off `default` to match the constructor above —
         * mapbox-gl ships a UMD bundle, whose named exports exist only via bundler interop. */
        const [{ default: mapboxgl }] = await loadMapbox();
        if (cancelled) return;

        const tooltip = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
        });

        map.on("mousemove", (e) => {
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
        });

        map.on("error", (e) => {
          console.error("Map error:", e);
        });
      }
    };

    /* `void` here would discard a rejection: fetchRostfordelningData and
     * fetchNationalResultsData both throw on a non-OK response, which would leave the
     * spinner up forever and surface only as an unhandledrejection in the console. */
    loadDataAndSetUpMap().catch((err: unknown) => {
      if (cancelled) return;
      console.error("Failed to load election data:", err);
      setLoadError("Could not load the election data. Check your connection and reload the page.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [map]);

  const renderDistrictResults = (
    results: PartiRoster[] | null,
    nationalResults: PartiRoster[] | null,
  ) => {
    if (!results) return null;

    const others = results.filter((p) => p.andelRoster !== null && p.andelRoster < 4);
    const majorParties = results.filter((p) => p.andelRoster !== null && p.andelRoster >= 4);

    const othersTotal = others.reduce((sum, party) => sum + (party.andelRoster || 0), 0);

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
                <td>{party.partiforkortning}</td>
                <td>{party.andelRoster?.toFixed(2)}</td>
                <td>{nationalRes != null ? nationalRes.toFixed(2) : "N/A"}</td>
              </tr>
            );
          })}
          {others.length > 0 && (
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
