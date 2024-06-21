'use client'

import React, { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import Image from "next/image";
import { Feature, FeatureCollection } from 'geojson';

export default function Home() {
  useEffect(() => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;
    const map = new mapboxgl.Map({
      container: 'map',
      center: [16.325556, 62.3875],
      zoom: 5,
    });

    import('../public/data/VD_20_20240313_EU-val_2024_wgs84.json')
      .then((data) => {
        console.log('Data loaded');

        // Type assertion for FeatureCollection with Features
        const transformedData: FeatureCollection = {
          type: "FeatureCollection",
          features: data.features.map((feature: any): Feature => {
            return {
              type: "Feature",
              geometry: feature.geometry,
              properties: feature.properties,
            };
          }),
        };

        map.on('load', () => {
          console.log('Map loaded');

          map.addSource('voting-districts', {
            type: 'geojson',
            data: transformedData,
          });

          console.log('Source added');

          map.addLayer({
            id: 'voting-districts-fill',
            type: 'fill',
            source: 'voting-districts',
            layout: {},
            paint: {
              'fill-color': '#000000',
              'fill-opacity': 0.2,
            },
          });

          console.log('Fill layer added');

          map.addLayer({
            id: 'voting-districts-outline',
            type: 'line',
            source: 'voting-districts',
            layout: {},
            paint: {
              'line-color': '#000000',
              'line-width': 0.5,
            },
          });

          console.log('Outline layer added');

          // Calculate the bounding box of the transformed data
          const bounds = new mapboxgl.LngLatBounds();

          transformedData.features.forEach((feature) => {
            const geometry = feature.geometry;
            if (geometry) {
              if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
                const coordinates = geometry.coordinates as number[][][][] | number[][][];
                coordinates.forEach((polygon: any) => {
                  polygon.forEach((ring: any) => {
                    ring.forEach((coord: number[]) => {
                      bounds.extend(coord as [number, number]);
                    });
                  });
                });
              } else {
                console.warn('Feature geometry type is not Polygon or MultiPolygon:', geometry.type);
              }
            } else {
              console.warn('Feature geometry or coordinates are missing:', feature);
            }
          });

          // Fit the map to the bounding box of the features
          map.fitBounds(bounds, {
            padding: 20
          });

          console.log('Bounds:', bounds);
        });

        map.on('error', (e) => {
          console.error('Map error:', e);
        });
      })
      .catch((error) => {
        console.error('Failed to load data:', error);
      });

    return () => map.remove();
  }, []);

  return (
    <main className="min-h-dvh flex flex-row items-center justify-between p-24">
      <div id="map" className="w-full h-96" />
    </main>
  );
}
