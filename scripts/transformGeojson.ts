import * as fs from "node:fs";
import * as path from "node:path";
import proj4 from "proj4";
import { commitDir, recoverInterrupted, stagingPathFor } from "./publishDir.ts";
import type { Feature, FeatureCollection, GeometryObject } from "geojson";

/* Five decimal places is about 1 m at this latitude — well under the width of the thinnest
 * line the map draws, and the raw SWEREF99 values carry ten. Rounding is the single biggest
 * lever on payload size: for the 2026 set it takes the transformed output from 191.8 MB to
 * 37.6 MB, 9.2 MB gzipped. */
const COORDINATE_DECIMALS = 5;

const round = (n: number): number => Number(n.toFixed(COORDINATE_DECIMALS));

// Define and register the projections
proj4.defs("EPSG:3006", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs");
/* EPSG:4326 needs no definition — proj4 ships it built in. A one-argument defs() call is
 * a getter, so the line that used to sit here defined nothing. */

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
    /* Strings only, deliberately. A district code published as a number cannot be recovered
     * safely: 2653 of the 6312 real 2026 codes begin with a zero, and String(09800110) is
     * "9800110" — a key that silently joins to nothing. Leaving numbers unread means the
     * missing-code guard below fires and the run stops, which is the outcome we want. */
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

/* Repairs an earlier run that was killed mid-swap. It has to happen before anything else
 * touches the target, because the repair keys off the target being absent. */
recoverInterrupted(outputDir);

/* The target is deliberately NOT created here. Nothing below writes to it — every file goes
 * to the staging directory and commitDir installs the validated set, creating the parent
 * itself — so creating it up front only produced an empty directory when a first run failed
 * validation. Verified: a county with an uncoded feature exited 1 and still left an empty
 * output directory behind, which reads as "transformed to nothing" rather than "never ran". */

/* 2024's archives contain .json, 2026's contain .geojson. */
const files = fs
  .readdirSync(inputDir)
  .filter((file) => file.endsWith(".json") || file.endsWith(".geojson"));

if (files.length === 0) {
  console.error(`No GeoJSON files found in the directory: ${inputDir}`);
  process.exit(1);
}

const transformed: { path: string; data: string; file: string }[] = [];

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
   * a code published as a number rather than a string (see read() above), would otherwise
   * null every key here and still report success. */
  /* Checked before the missing-code guard, which an empty collection passes trivially: a
   * county file with no features would be written happily and simply remove that county's
   * districts from the map. */
  if (geojson_data.features.length === 0) {
    console.error(`${file}: contains no features — refusing to write`);
    process.exit(1);
  }

  const missingCode = geojson_data.features.filter(
    (feature) => !(feature.properties as NormalisedDistrict | null)?.Lkfv,
  ).length;
  if (missingCode > 0) {
    console.error(
      `${file}: ${String(missingCode)} of ${String(geojson_data.features.length)} features have no district code — refusing to write`,
    );
    process.exit(1);
  }

  /* Held back rather than written here: a bad code in county 15 used to exit with counties
   * 1-14 already on disk, and a caller that uploads or serves that directory would publish
   * a partial map despite the refusal message. Nothing is written until all 21 pass. */
  transformed.push({ path: outputFilePath, data: JSON.stringify(geojson_data), file });
});

/* Built beside the target and swapped in, rather than written into it. Holding the writes
 * back until every input passed stopped a *partial* set being written, but it did nothing
 * about files already there: a run over twenty counties into a directory holding
 * twenty-one leaves the twenty-first behind, stale, with every check green and a map that
 * mixes two vintages. Replacing the directory wholesale is the only version of this that
 * is actually true. */
const stagingDir = stagingPathFor(outputDir);
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

for (const { path: outputFilePath, data, file } of transformed) {
  fs.writeFileSync(path.join(stagingDir, path.basename(outputFilePath)), data);
  console.log(`Coordinate transformation complete for ${file}.`);
}

commitDir(stagingDir, outputDir);
console.log(`\nWrote ${String(transformed.length)} files to ${outputDir}`);
