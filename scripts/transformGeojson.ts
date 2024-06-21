import * as fs from "fs";
import proj4 from "proj4";
import { Feature, FeatureCollection, GeometryObject } from "geojson";

// Define and register the projections
proj4.defs("EPSG:3006", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs");
proj4.defs("EPSG:4326");

// Transformer
const transformCoordinate = (coord: [number, number]): [number, number] => {
    return proj4("EPSG:3006", "EPSG:4326", coord);
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
            geometry.coordinates = (geometry.coordinates as [number, number][][]).map(ring =>
                ring.map(transformCoordinate)
            );
            break;
        case 'MultiPolygon':
            geometry.coordinates = (geometry.coordinates as [number, number][][][]).map(polygon =>
                polygon.map(ring => ring.map(transformCoordinate))
            );
            break;
        case 'GeometryCollection':
            geometry.geometries = geometry.geometries.map(transformCoordinates);
            break;
        default:
            throw new Error("Unknown Geometry Type");
    }
    return geometry;
};

// Fetch command-line arguments for input and output files
const [, , inputFilePath, outputFilePath] = process.argv;

if (!inputFilePath || !outputFilePath) {
    console.error("Please provide input and output file paths.");
    process.exit(1);
}

// Load the GeoJSON file
const geojson_data: FeatureCollection = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));

// Transform the geometries
geojson_data.features.forEach((feature: Feature) => {
    feature.geometry = transformCoordinates(feature.geometry);
});

// Save the transformed GeoJSON to a new file
fs.writeFileSync(outputFilePath, JSON.stringify(geojson_data));

console.log(`Coordinate transformation complete. Saved to ${outputFilePath}.`);
