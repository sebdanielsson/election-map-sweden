'use client';

import React, { useRef, useState, useEffect } from 'react';
import { SearchBox } from '@mapbox/search-js-react';
import mapboxgl from 'mapbox-gl';
import "mapbox-gl/dist/mapbox-gl.css";
import { Feature, FeatureCollection } from 'geojson';
import { Rostfordelning, Mandatfordelning, PartiRoster, VotingDistrictProperties } from './electionDataInterfaces';

const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;

const loadGeoJSONFiles = async (): Promise<FeatureCollection[]> => {
  const fileUrls = [
    'VD_01_20240313_EU-val_2024.json',
    'VD_03_20240313_EU-val_2024.json',
    'VD_04_20240313_EU-val_2024.json',
    'VD_05_20240313_EU-val_2024.json',
    'VD_06_20240313_EU-val_2024.json',
    'VD_07_20240313_EU-val_2024.json',
    'VD_08_20240313_EU-val_2024.json',
    'VD_09_20240313_EU-val_2024.json',
    'VD_10_20240313_EU-val_2024.json',
    'VD_12_20240313_EU-val_2024.json',
    'VD_13_20240313_EU-val_2024.json',
    'VD_14_20240313_EU-val_2024.json',
    'VD_17_20240313_EU-val_2024.json',
    'VD_18_20240313_EU-val_2024.json',
    'VD_19_20240313_EU-val_2024.json',
    'VD_20_20240313_EU-val_2024.json',
    'VD_21_20240313_EU-val_2024.json',
    'VD_22_20240313_EU-val_2024.json',
    'VD_23_20240313_EU-val_2024.json',
    'VD_24_20240313_EU-val_2024.json',
    'VD_25_20240313_EU-val_2024.json',
  ];

  const loadedFeatureCollections: FeatureCollection[] = [];

  for (const url of fileUrls) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_ENDPOINT}/data/districts/EPSG4326/${url}`);
      if (!response.ok) throw new Error(`Network response was not ok for URL: ${url}`);
      const data = await response.json();

      const transformedData: FeatureCollection = {
        type: 'FeatureCollection',
        features: data.features.map((feature: any): Feature => ({
          type: 'Feature',
          geometry: feature.geometry,
          properties: feature.properties,
        })),
      };

      loadedFeatureCollections.push(transformedData);
    } catch (error) {
      console.error(`Error fetching GeoJSON data from ${url}:`, error);
    }
  }

  return loadedFeatureCollections;
};

const fetchRostfordelningData = async (): Promise<Rostfordelning> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_ENDPOINT}/data/election-results/EU-val_2024_slutlig_rostfordelning_00_E.json`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
};

const fetchNationalResultsData = async (): Promise<Mandatfordelning> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_ENDPOINT}/data/election-results/EU-val_2024_slutlig_mandatfordelning_00_E.json`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
};

export default function Home() {
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDistrict, setSelectedDistrict] = useState<VotingDistrictProperties | null>(null);
  const [districtResults, setDistrictResults] = useState<PartiRoster[] | null>(null);
  const [nationalResults, setNationalResults] = useState<PartiRoster[] | null>(null);
  const [rostfordelningData, setRostfordelningData] = useState<Rostfordelning | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | undefined>(undefined);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    mapboxgl.accessToken = accessToken;

    mapInstanceRef.current = new mapboxgl.Map({
      container: mapContainerRef.current || "",
      center: [16.325556, 62.3875],
      zoom: 5,
    });

    mapInstanceRef.current.on("load", () => {
      setMapLoaded(true);
    });
  }, []);

  useEffect(() => {
    const loadDataAndSetUpMap = async () => {
      if (mapInstanceRef.current && mapLoaded) {
        const map = mapInstanceRef.current;

        try {
          const featureCollections = await loadGeoJSONFiles();

          featureCollections.forEach((transformedData, index) => {
            const sourceId = `voting-districts-${index}`;
            map.addSource(sourceId, {
              type: 'geojson',
              data: transformedData,
            });

            map.addLayer({
              id: `${sourceId}-fill`,
              type: 'fill',
              source: sourceId,
              layout: {},
              paint: {
                'fill-color': '#006AA7',
                'fill-opacity': 0.5,
              },
            });

            map.addLayer({
              id: `${sourceId}-outline`,
              type: 'line',
              source: sourceId,
              layout: {},
              paint: {
                'line-color': '#000000',
                'line-width': 0.5,
              },
            });
          });

          map.addSource('highlight-feature', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          });

          map.addLayer({
            id: 'voting-districts-highlight',
            type: 'fill',
            source: 'highlight-feature',
            layout: {},
            paint: {
              'fill-color': '#FECC02',
              'fill-opacity': 0.5,
            },
          });

          const [fetchedRostfordelningData, fetchedNationalResultsData] = await Promise.all([
            fetchRostfordelningData(),
            fetchNationalResultsData()
          ]);

          setRostfordelningData(fetchedRostfordelningData);
          setNationalResults(fetchedNationalResultsData.valomrade.rostfordelning.rosterPaverkaMandat.partiRoster);
          setLoading(false);

          map.on('click', (e) => {
            const features = map.queryRenderedFeatures(e.point, {
              layers: featureCollections.map((_f, index) => `voting-districts-${index}-fill`),
            });

            if (features.length) {
              const feature = features[0];
              if (!feature.properties) {
                console.error('Feature properties are null');
                return;
              }

              const properties = feature.properties as VotingDistrictProperties;
              setSelectedDistrict(properties);

              const results = fetchedRostfordelningData.valdistrikt
                .find((d: any) => d.valdistriktskod === properties.Lkfv)
                ?.rostfordelning?.rosterPaverkaMandat?.partiRoster;

              if (results) {
                setDistrictResults(results);
              } else {
                console.error('No results found for the selected district or feature properties are null');
              }

              const highlightSource = map.getSource('highlight-feature') as mapboxgl.GeoJSONSource;
              highlightSource.setData({
                type: 'FeatureCollection',
                features: [feature],
              });

              const sidebar = document.getElementById('sidebar');
              if (sidebar && sidebar.classList.contains('translate-x-full')) {
                sidebar.classList.remove('translate-x-full');
              }
            }
          });

          const tooltip = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
          });

          map.on('mousemove', (e) => {
            const features = map.queryRenderedFeatures(e.point, {
              layers: featureCollections.map((_f, index) => `voting-districts-${index}-fill`),
            });

            if (features.length) {
              const feature = features[0];
              const districtName = feature.properties ? feature.properties.Vdnamn : null;

              if (districtName) {
                tooltip.setLngLat(e.lngLat).setHTML(`<strong>${districtName}</strong>`).addTo(map);
              } else {
                console.warn('District name not found');
              }
              return;
            }
            tooltip.remove();
          });
        } catch (error) {
          console.error('Map initialization error:', error);
        }
      }
    };

    loadDataAndSetUpMap();
  }, [mapLoaded]);

  const renderDistrictResults = (results: PartiRoster[] | null, nationalResults: PartiRoster[] | null) => {
    if (!results) return null;

    const others = results.filter((p) => p.andelRoster !== null && p.andelRoster < 4);
    const majorParties = results.filter((p) => p.andelRoster !== null && p.andelRoster >= 4);

    const othersTotal = others.reduce((sum, party) => sum + (party.andelRoster || 0), 0);

    const getNationalResult = (partikod: string) => {
      return nationalResults ? nationalResults.find((p) => p.partikod === partikod)?.andelRoster : null;
    };

    return (
      <table className='borderless-table border-collapse text-xs'>
        <thead className='text-sm font-bold'>
          <tr>
            <th>Party</th>
            <th>% District</th>
            <th>% National</th>
          </tr>
        </thead>
        <tbody className='text-sm'>
          {majorParties.map((party) => {
            const nationalRes = party.partikod ? getNationalResult(party.partikod) : null;
            return (
              <tr key={party.partikod}>
                <td>{party.partiforkortning}</td>
                <td>{party.andelRoster?.toFixed(2)}</td>
                <td>{nationalRes ? nationalRes.toFixed(2) : 'N/A'}</td>
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

  const closeSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('translate-x-full')) {
      sidebar.classList.add('translate-x-full');
    }
  };

  return (
    <>
      {/* @ts-ignore next-line */}
      <SearchBox
        accessToken={accessToken}
        map={mapInstanceRef.current}
        mapboxgl={mapboxgl}
        value={inputValue}
        onChange={(d) => {
          setInputValue(d);
        }}
        marker
      />
      <div>lol</div>
      <main className="relative h-dvh grid grid-cols-1 md:p-6">
        <div className="relative flex w-full h-full overflow-hidden">
          {loading && (
            <div className="absolute w-full h-full z-50 bg-gray-800/50 backdrop-blur-md flex items-center justify-center rounded-xl">
              <div
                className="absolute h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
                role="status">
                <span
                  className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]"
                >Loading...</span>
              </div>
            </div>
          )}
          <div id="map-container" ref={mapContainerRef} className="flex-grow rounded-xl bg-gray-100"></div>
          <div id="sidebar"
            className="overflow-scroll absolute bottom-0 right-0 lg:h-full w-full lg:w-3/12 lg:max-w-sm bg-gray-800/50 transform translate-x-full transition-transform duration-500 lg:duration-300 ease-in-out z-50 p-4 rounded-t-xl lg:rounded-l-none lg:rounded-r-xl backdrop-blur-md text-white">
            {selectedDistrict ? (
              <div>
                <div className="flex flex-row justify-between relative">
                  <h2 className="text-lg font-bold text-slate-300 mb-2">{selectedDistrict.Vdnamn}</h2>
                  <button onClick={closeSidebar} className="text-white h-6">
                    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z" /></svg>
                  </button>
                </div>
                {renderDistrictResults(districtResults, nationalResults)}
              </div>
            ) : (
              <div>
                <h2 className="text-md font-bold">Click on a district</h2>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
