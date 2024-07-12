"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var proj4_1 = __importDefault(require("proj4"));
// Define and register the projections
proj4_1.default.defs("EPSG:3006", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs");
proj4_1.default.defs("EPSG:4326");
// Transformer
var transformCoordinate = function (coord) {
    return (0, proj4_1.default)("EPSG:3006", "EPSG:4326", coord);
};
// Recursive function to transform all coordinates in the GeoJSON
var transformCoordinates = function (geometry) {
    switch (geometry.type) {
        case 'Point':
            geometry.coordinates = transformCoordinate(geometry.coordinates);
            break;
        case 'LineString':
        case 'MultiPoint':
            geometry.coordinates = geometry.coordinates.map(transformCoordinate);
            break;
        case 'Polygon':
        case 'MultiLineString':
            geometry.coordinates = geometry.coordinates.map(function (ring) {
                return ring.map(transformCoordinate);
            });
            break;
        case 'MultiPolygon':
            geometry.coordinates = geometry.coordinates.map(function (polygon) {
                return polygon.map(function (ring) { return ring.map(transformCoordinate); });
            });
            break;
        case 'GeometryCollection':
            geometry.geometries = geometry.geometries.map(transformCoordinates);
            break;
        default:
            throw new Error("Unknown Geometry Type");
    }
    return geometry;
};
// Fetch command-line arguments for input and output directories
var _a = process.argv, inputDir = _a[2], outputDir = _a[3];
if (!inputDir || !outputDir) {
    console.error("Please provide input and output directories.");
    process.exit(1);
}
// Check if input and output directories exist
if (!fs.existsSync(inputDir)) {
    console.error("Input directory does not exist: ".concat(inputDir));
    process.exit(1);
}
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}
// Read all JSON files in the input directory
var files = fs.readdirSync(inputDir).filter(function (file) { return file.endsWith('.json'); });
if (files.length === 0) {
    console.error("No JSON files found in the directory: ".concat(inputDir));
    process.exit(1);
}
// Process each JSON file
files.forEach(function (file) {
    var inputFilePath = path.join(inputDir, file);
    var outputFilePath = path.join(outputDir, file);
    // Load the GeoJSON file
    var geojson_data = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
    // Transform the geometries
    geojson_data.features.forEach(function (feature) {
        feature.geometry = transformCoordinates(feature.geometry);
    });
    // Save the transformed GeoJSON to the output file
    fs.writeFileSync(outputFilePath, JSON.stringify(geojson_data, null, 2));
    console.log("Coordinate transformation complete for ".concat(file, ". Saved to ").concat(outputFilePath, "."));
});
