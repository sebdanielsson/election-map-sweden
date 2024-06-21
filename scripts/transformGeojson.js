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
// Fetch command-line arguments for input and output files
var _a = process.argv, inputFilePath = _a[2], outputFilePath = _a[3];
if (!inputFilePath || !outputFilePath) {
    console.error("Please provide input and output file paths.");
    process.exit(1);
}
// Load the GeoJSON file
var geojson_data = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
// Transform the geometries
geojson_data.features.forEach(function (feature) {
    feature.geometry = transformCoordinates(feature.geometry);
});
// Save the transformed GeoJSON to a new file
fs.writeFileSync(outputFilePath, JSON.stringify(geojson_data));
console.log("Coordinate transformation complete. Saved to ".concat(outputFilePath, "."));
