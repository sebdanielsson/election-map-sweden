import * as fs from 'fs';
import * as path from 'path';
import proj4 from 'proj4';
import { Feature, FeatureCollection, GeometryObject } from 'geojson';

// Define and register the projections
proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:4326');

// Transformer
const transformCoordinate = (coord: [number, number]): [number, number] => {
  return proj4('EPSG:3006', 'EPSG:4326', coord);
};

// Recursive function to transform all coordinates in the GeoJSON
const transformCoordinates = (geometry: GeometryObject): GeometryObject => {
  switch (geometry.type) {
    case 'Point':
      geometry.coordinates = transformCoordinate(geometry.coordinates as [number, number]);
      break;
    case 'LineString':
    case 'MultiPoint':
      geometry.coordinates = (geometry.coordinates as [number, number][]).map(transformCoordinate);
      break;
    case 'Polygon':
    case 'MultiLineString':
      geometry.coordinates = (geometry.coordinates as [number, number][][]).map((ring) =>
        ring.map(transformCoordinate),
      );
      break;
    case 'MultiPolygon':
      geometry.coordinates = (geometry.coordinates as [number, number][][][]).map((polygon) =>
        polygon.map((ring) => ring.map(transformCoordinate)),
      );
      break;
    case 'GeometryCollection':
      geometry.geometries = geometry.geometries.map(transformCoordinates);
      break;
    default:
      throw new Error('Unknown Geometry Type');
  }
  return geometry;
};

// Fetch command-line arguments for input and output directories
const [, , inputDir, outputDir] = process.argv;

if (!inputDir || !outputDir) {
  console.error('Please provide input and output directories.');
  process.exit(1);
}

// Check if input and output directories exist
if (!fs.existsSync(inputDir)) {
  console.error(`Input directory does not exist: ${inputDir}`);
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read all JSON files in the input directory
const files = fs.readdirSync(inputDir).filter((file) => file.endsWith('.json'));

if (files.length === 0) {
  console.error(`No JSON files found in the directory: ${inputDir}`);
  process.exit(1);
}

// Process each JSON file
files.forEach((file) => {
  const inputFilePath = path.join(inputDir, file);
  const outputFilePath = path.join(outputDir, file);

  // Load the GeoJSON file
  const geojson_data: FeatureCollection = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));

  // Transform the geometries
  geojson_data.features.forEach((feature: Feature) => {
    feature.geometry = transformCoordinates(feature.geometry);
  });

  // Save the transformed GeoJSON to the output file
  fs.writeFileSync(outputFilePath, JSON.stringify(geojson_data, null, 2));

  console.log(`Coordinate transformation complete for ${file}. Saved to ${outputFilePath}.`);
});
