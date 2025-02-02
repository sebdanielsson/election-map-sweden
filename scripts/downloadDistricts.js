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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var axios_1 = __importDefault(require("axios"));
var unzipper = __importStar(require("unzipper"));
var districtsUrls = [
    'https://www.val.se/download/18.5acd32d818deefef85cfbe/1710431898533/valdistrikt-blekinge-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfc0/1710431917792/valdistrikt-dalarnas-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfc2/1710431935757/valdistrikt-gavleborgs-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfc4/1710431950738/valdistrikt-gotlands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfc6/1710431966012/valdistrikt-hallands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfc6/1710431966012/valdistrikt-hallands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfc8/1710431981447/valdistrikt-jamtlands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfca/1710431995574/valdistrikt-jonkopings-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfcc/1710432008974/valdistrikt-kalmar-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfce/1710432023047/valdistrikt-kronobergs-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfd0/1710432038927/valdistrikt-norrbottens-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfd2/1710432058310/valdistrikt-skane-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfd4/1710946075746/valdistrikt-sodermanlands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfd6/1710432087226/valdistrikt-stockholms-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfd8/1710432103944/valdistrikt-uppsala-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfda/1710432118710/valdistrikt-varmlands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfdc/1710432134273/valdistrikt-vasterbottens-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfde/1710432151134/valdistrikt-vasternorrlands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfe0/1710432166106/valdistrikt-vastmanlands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfe2/1710432182831/valdistrikt-vastra-gotalands-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfe4/1710432198776/valdistrikt-orebro-lan-eu-val.zip',
    'https://www.val.se/download/18.5acd32d818deefef85cfe6/1710432226966/valdistrikt-ostergotlands-lan-eu-val.zip',
];
// First user-provided argument should be the output directory
var outputDir = process.argv[2];
if (!outputDir) {
    console.error('Please provide an output directory.');
    process.exit(1);
}
// Check if output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}
var downloadAndExtract = function (url) { return __awaiter(void 0, void 0, void 0, function () {
    var zipFile, response, writer_1, files, geoJsonFiles, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                zipFile = path.join(outputDir, path.basename(url));
                _a.label = 1;
            case 1:
                _a.trys.push([1, 5, , 6]);
                return [4 /*yield*/, (0, axios_1.default)({
                        url: url,
                        method: 'GET',
                        responseType: 'stream',
                    })];
            case 2:
                response = _a.sent();
                writer_1 = fs.createWriteStream(zipFile);
                response.data.pipe(writer_1);
                return [4 /*yield*/, new Promise(function (resolve, reject) {
                        writer_1.on('finish', resolve);
                        writer_1.on('error', reject);
                    })];
            case 3:
                _a.sent();
                return [4 /*yield*/, fs
                        .createReadStream(zipFile)
                        .pipe(unzipper.Extract({ path: outputDir }))
                        .promise()];
            case 4:
                _a.sent();
                fs.unlinkSync(zipFile);
                files = fs.readdirSync(outputDir);
                geoJsonFiles = files.filter(function (file) { return file.endsWith('.json'); });
                console.log("Downloaded and extracted ".concat(geoJsonFiles.length, " GeoJSON files from ").concat(url));
                if (geoJsonFiles.length === 0) {
                    console.log('Files in directory:', files.join(', '));
                }
                return [3 /*break*/, 6];
            case 5:
                error_1 = _a.sent();
                console.error("Failed to download or extract ".concat(url, ":"), error_1);
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); };
var downloadAllDistricts = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _i, districtsUrls_1, url;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _i = 0, districtsUrls_1 = districtsUrls;
                _a.label = 1;
            case 1:
                if (!(_i < districtsUrls_1.length)) return [3 /*break*/, 4];
                url = districtsUrls_1[_i];
                return [4 /*yield*/, downloadAndExtract(url)];
            case 2:
                _a.sent();
                _a.label = 3;
            case 3:
                _i++;
                return [3 /*break*/, 1];
            case 4: return [2 /*return*/];
        }
    });
}); };
downloadAllDistricts();
