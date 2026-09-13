import * as fs from "node:fs";
import * as path from "node:path";
import proj4 from "proj4";
import type { Feature, FeatureCollection, GeometryObject } from "geojson";

/* Five decimal places is about 1 m at this latitude — well under the width of the thinnest
 * line the map draws, and the raw SWEREF99 values carry ten. Rounding is the single biggest
 * lever on payload size: for the 2026 set it takes the transformed output from 191.8 MB to
 * 37.6 MB, 9.2 MB gzipped. */
const COORDINATE_DECIMALS = 5;

const round = (n: number): number => Number(n.toFixed(COORDINATE_DECIMALS));

// Define and register the projections
proj4.defs("EPSG:3006", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs");
proj4.defs("EPSG:4326");

// Transformer
const transformCoordinate = (coord: [number, number]): [number, number] => {
  const [lon, lat] = proj4("EPSG:3006", "EPSG:4326", coord);
  return [round(lon), round(lat)];
};

// Recursive function to transform all coordinates in the GeoJSON
const transformCoordinates = (geometry: GeometryObject): GeometryObject => {
  switch (geometry.type) {
    case "Point":
      geometry.coordinates = transformCoordinate(geometry.coordinates as [number, number]);
      break;
    case "LineString":
    case "MultiPoint":
      geometry.coordinates = (geometry.coordinates as [number, number][]).map(transformCoordinate);
      break;
    case "Polygon":
    case "MultiLineString":
      geometry.coordinates = (geometry.coordinates as [number, number][][]).map((ring) =>
        ring.map(transformCoordinate),
      );
      break;
    case "MultiPolygon":
      geometry.coordinates = (geometry.coordinates as [number, number][][][]).map((polygon) =>
        polygon.map((ring) => ring.map(transformCoordinate)),
      );
      break;
    case "GeometryCollection":
      geometry.geometries = geometry.geometries.map(transformCoordinates);
      break;
    default:
      throw new Error("Unknown Geometry Type");
  }
  return geometry;
};

/* Valmyndigheten renamed these between 2024 and 2026 — `Lkfv` -> `Valdistriktskod`,
 * `Vdnamn` -> `Valdistriktsnamn` — while keeping the same 8-digit district code, so it is
 * a rename and not a change of meaning. Normalising here rather than in the app keeps one
 * shape across every election and keeps the published files small: the 2026 archives carry
 * fourteen properties per district, twelve of which nothing reads. Kommun and Län have no
 * 2024 equivalent, so they are passed through only when the source has them. */
interface NormalisedDistrict {
  Lkfv: string | null;
  Vdnamn: string | null;
  Kommun?: string;
  Lan?: string;
}

const normaliseProperties = (props: Record<string, unknown> | null): NormalisedDistrict => {
  const read = (key: string): string | undefined => {
    const value = props?.[key];
    /* Numbers are accepted too: a district code published as 10820101 rather than
     * "10820101" would otherwise be dropped, nulling the join key for a whole county. */
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return typeof value === "string" && value !== "" ? value : undefined;
  };

  const code = read("Valdistriktskod") ?? read("Lkfv") ?? null;
  const name = read("Valdistriktsnamn") ?? read("Vdnamn") ?? null;
  const kommun = read("Kommun");
  const lan = read("Län") ?? read("Lan");

  return {
    Lkfv: code,
    Vdnamn: name,
    ...(kommun ? { Kommun: kommun } : {}),
    ...(lan ? { Lan: lan } : {}),
  };
};

// Fetch command-line arguments for input and output directories
const [, , inputDir, outputDir] = process.argv;

if (!inputDir || !outputDir) {
  console.error("Please provide input and output directories.");
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

/* 2024's archives contain .json, 2026's contain .geojson. */
const files = fs
  .readdirSync(inputDir)
  .filter((file) => file.endsWith(".json") || file.endsWith(".geojson"));

if (files.length === 0) {
  console.error(`No GeoJSON files found in the directory: ${inputDir}`);
  process.exit(1);
}

// Process each JSON file
files.forEach((file) => {
  const inputFilePath = path.join(inputDir, file);
  const outputFilePath = path.join(outputDir, file.replace(/\.geojson$/, ".json"));

  // Load the GeoJSON file
  const geojson_data: FeatureCollection = JSON.parse(fs.readFileSync(inputFilePath, "utf8"));

  /* The source declares EPSG:3006 and we have just reprojected to WGS84. Leaving the old
   * declaration in place makes the published file lie to every consumer that reads it —
   * QGIS and ogr2ogr would reproject a second time. RFC 7946 GeoJSON is WGS84 by
   * definition, so the honest thing is to drop the member rather than restate it. */
  delete (geojson_data as { crs?: unknown }).crs;

  // Transform the geometries and normalise the properties
  geojson_data.features.forEach((feature: Feature) => {
    feature.geometry = transformCoordinates(feature.geometry);
    feature.properties = normaliseProperties(feature.properties);
  });

  /* The results side refuses to publish a district with no code; the geometry side is the
   * other half of the same join and had no equivalent check. A property rename upstream, or
   * a code published as a number rather than a string, would otherwise null every key here
   * and still report success. */
  const missingCode = geojson_data.features.filter(
    (feature) => !(feature.properties as NormalisedDistrict | null)?.Lkfv,
  ).length;
  if (missingCode > 0) {
    console.error(
      `${file}: ${String(missingCode)} of ${String(geojson_data.features.length)} features have no district code — refusing to write`,
    );
    process.exit(1);
  }

  // Save the transformed GeoJSON to the output file
  fs.writeFileSync(outputFilePath, JSON.stringify(geojson_data));

  console.log(`Coordinate transformation complete for ${file}. Saved to ${outputFilePath}.`);
});
