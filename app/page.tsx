'use client';

import React, { useState, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { Feature, FeatureCollection } from 'geojson';
import { ShapeJson, Valdistrikt, Rostfordelning, RosterPaverkaMandat, PartiRoster, ListRoster, Personrost, RosterOvrigaPartier, RosterEjPaverkaMandat, VotingDistrictProperties } from './electionDataInterfaces';
import ElectionData from '../public/data/election-results/EU-val_2024_slutlig_rostfordelning_00_E.json';

const electionData = ElectionData as ShapeJson;

const getDistrictResults = (districtId: string | null): PartiRoster[] | null => {
  if (!districtId) return null;
  const districtData = electionData.valdistrikt.find((d) => d.valdistriktskod === districtId);
  if (!districtData) return null;
  return districtData.rostfordelning.rosterPaverkaMandat.partiRoster;
};

const loadGeoJSONFiles = async (): Promise<FeatureCollection[]> => {
  const context = require.context('../public/data/districts', false, /^\.\/VD_\d+_20240313_EU-val_2024\.json$/);
  const featureCollections: FeatureCollection[] = [];

  for (const key of context.keys()) {
    const data = await context(key);
    const transformedData: FeatureCollection = {
      type: 'FeatureCollection',
      features: data.features.map((feature: any): Feature => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: feature.properties,
      })),
    };
    featureCollections.push(transformedData);
  }

  return featureCollections;
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
  const [map, setMap] = useState<mapboxgl.Map | null>(null);

  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;
    const map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v11', // Ensure you have a proper map style here
      center: [16.325556, 62.3875],
      zoom: 5,
    });

    map.on('load', async () => {
      map.resize();
      const featureCollections = await loadGeoJSONFiles();
      console.log('Data loaded');

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

      // Highlight layer, add at the end to ensure it is on top of all other layers
      map.addSource('highlight-feature', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        }
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

      // Add click event handler
      map.on('click', (e) => {
        featureCollections.forEach((_, index) => {
          const sourceId = `voting-districts-${index}-fill`;
          const features = map.queryRenderedFeatures(e.point, {
            layers: [sourceId],
          });

          if (features.length) {
            const feature = features[0];
            setSelectedDistrict(feature.properties as VotingDistrictProperties);

            // Fetch and set district election results
            if (feature.properties) {
              const results = getDistrictResults(feature.properties.Lkfv);
              setDistrictResults(results);
            } else {
              console.error('No properties found for the selected district');
            }

            // Update the highlight layer with the selected feature
            const highlightSource = map.getSource('highlight-feature') as mapboxgl.GeoJSONSource;
            highlightSource.setData({
              type: 'FeatureCollection',
              features: [feature],
            });

            // Show the sidebar if it's hidden
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('translate-x-full')) {
              sidebar.classList.remove('translate-x-full');
            }
          }
        });
      });

      // Change the cursor to a pointer when the mouse is over the voting districts.
      map.on('mouseenter', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      // Change it back to default when it leaves.
      map.on('mouseleave', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    map.on('error', (e) => {
      console.error('Map error:', e);
    });

    setMap(map);

    return () => {
      if (map) {
        map.remove();
      }
    };
  }, []);

  const renderDistrictResults = (results: PartiRoster[] | null) => {
    if (!results) return null;
    const others = results.filter((p) => p.andelRoster !== null && p.andelRoster < 4);
    const majorParties = results.filter((p) => p.andelRoster !== null && p.andelRoster >= 4);

    const othersTotal = others.reduce((sum, party) => sum + (party.andelRoster || 0), 0);

    return (
      <div>
        <table className='borderless-table border-collapse'>
          <thead>
            <tr>
              <th>Party</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {majorParties.map((party) => (
              <tr key={party.partikod}>
                <td>{party.partiforkortning}</td>
                <td>{party.andelRoster?.toFixed(2)}</td>
              </tr>
            ))}
            {others.length > 0 && (
              <tr>
                <td>Others</td>
                <td>{othersTotal.toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className="relative h-dvh grid grid-cols-1 p-6">
      <div className="relative flex w-full h-full overflow-hidden">
        <div id="map" className="flex-grow rounded-xl bg-gray-100"></div>
        <div id="sidebar"
          className="overflow-scroll absolute top-0 right-0 h-full w-3/12 max-w-sm bg-gray-800/50 transform translate-x-full transition-transform duration-300 ease-in-out z-50 p-4 rounded-r-xl backdrop-blur-md text-white">
          {selectedDistrict ? (
            <div>
              <div className="flex flex-row justify-between relative">
                <h2 className="text-lg font-bold text-slate-300">{selectedDistrict.Vdnamn} ({selectedDistrict.Lkfv})</h2>
                <button onClick={closeSidebar} className="text-white h-6">
                  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z" /></svg>
                </button>
              </div>
              {/* Display results */}
              {renderDistrictResults(districtResults)}
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold">Click on a district</h2>
              <p>Click on a voting district to see the details.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
