'use client';

import React, { useState, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { Feature, FeatureCollection } from 'geojson';
import { Rostfordelning, Mandatfordelning, PartiRoster, Valdistrikt, RosterPaverkaMandat, ListRoster, Personrost, RosterOvrigaPartier, RosterEjPaverkaMandat, VotingDistrictProperties } from './electionDataInterfaces';

const getDistrictResults = (rostfordelningData: Rostfordelning, districtId: string | null): PartiRoster[] | null => {
  if (!districtId) return null;

  const districtData = rostfordelningData.valdistrikt.find((d) => d.valdistriktskod === districtId);
  if (!districtData) return null;
  return districtData.rostfordelning.rosterPaverkaMandat.partiRoster;
};

const fetchNationalResultsData = async (): Promise<Mandatfordelning> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_ENDPOINT}/data/election-results/EU-val_2024_slutlig_mandatfordelning_00_E.json`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
};

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

  const featureCollections: FeatureCollection[] = [];

  for (const url of fileUrls) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_ENDPOINT}/data/districts/EPSG4326/${url}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();

      const transformedData: FeatureCollection = {
        type: 'FeatureCollection',
        features: data.features.map((feature: any): Feature => ({
          type: 'Feature',
          geometry: feature.geometry,
          properties: feature.properties,
        })),
      };

      featureCollections.push(transformedData);
    } catch (error) {
      console.error('Error fetching GeoJSON data:', error);
    }
  }

  return featureCollections;
};

const fetchRostfordelningData = async (): Promise<Rostfordelning> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_ENDPOINT}/data/election-results/EU-val_2024_slutlig_rostfordelning_00_E.json`);
  if (!response.ok) throw new Error('Network response was not ok');
  return response.json();
};

const closeSidebar = () => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !sidebar.classList.contains('translate-x-full')) {
    sidebar.classList.add('translate-x-full');
  }
}

export default function Home() {
  const [selectedDistrict, setSelectedDistrict] = useState<null | VotingDistrictProperties>(null);
  const [districtResults, setDistrictResults] = useState<null | PartiRoster[]>(null);
  const [nationalResults, setNationalResults] = useState<null | PartiRoster[]>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [rostfordelningData, setRostfordelningData] = useState<Rostfordelning | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;
    const newMap = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/standard',
      center: [16.325556, 62.3875],
      zoom: 5,
    });

    setMap(newMap);

    return () => {
      if (newMap) {
        newMap.remove();
      }
    };
  }, []);

  useEffect(() => {
    const loadDataAndSetUpMap = async () => {
      if (map) {
        map.on('load', async () => {
          map.resize();
          const featureCollections = await loadGeoJSONFiles();

          for (const [index, transformedData] of featureCollections.entries()) {
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
          }

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

          map.on('click', async (e) => {
            for (const [index] of featureCollections.entries()) {
              const sourceId = `voting-districts-${index}-fill`;
              const features = map.queryRenderedFeatures(e.point, {
                layers: [sourceId],
              });

              if (features.length) {
                const feature = features[0];
                setSelectedDistrict(feature.properties as VotingDistrictProperties);

                if (feature.properties && fetchedRostfordelningData) {
                  const results = getDistrictResults(fetchedRostfordelningData, feature.properties.Lkfv);
                  setDistrictResults(results);
                } else {
                  console.error('No properties found for the selected district');
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
            }
          });

          const tooltip = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false
          });

          map.on('mousemove', (e) => {
            for (const [index] of featureCollections.entries()) {
              const sourceId = `voting-districts-${index}-fill`;
              const features = map.queryRenderedFeatures(e.point, {
                layers: [sourceId],
              });

              if (features.length) {
                const feature = features[0];
                const districtName = feature.properties?.Vdnamn;

                if (districtName) {
                  tooltip
                    .setLngLat(e.lngLat)
                    .setHTML(`<strong>${districtName}</strong>`)
                    .addTo(map);
                }
                return;
              }
            }
            tooltip.remove();
          });
        });

        map.on('error', (e) => {
          console.error('Map error:', e);
        });
      }
    };

    loadDataAndSetUpMap();
  }, [map]);

  const renderDistrictResults = (results: PartiRoster[] | null, nationalResults: PartiRoster[] | null) => {
    if (!results) return null;

    const others = results.filter((p) => p.andelRoster !== null && p.andelRoster < 4);
    const majorParties = results.filter((p) => p.andelRoster !== null && p.andelRoster >= 4);

    const othersTotal = others.reduce((sum, party) => sum + (party.andelRoster || 0), 0);

    const getNationalResult = (partikod: string) => {
      if (!nationalResults) return null;
      return nationalResults.find((p) => p.partikod === partikod)?.andelRoster;
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

  return (
    <main className="relative h-dvh grid grid-cols-1 p-6">
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
        <div id="map" className="flex-grow rounded-xl bg-gray-100"></div>
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
              <p>Click on a voting district to see the details.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
