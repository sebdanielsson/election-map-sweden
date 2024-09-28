import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as unzipper from 'unzipper';

const districtsUrls = [
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
const outputDir = process.argv[2];

if (!outputDir) {
  console.error('Please provide an output directory.');
  process.exit(1);
}

// Check if output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const downloadAndExtract = async (url: string) => {
  const zipFile = path.join(outputDir, path.basename(url));

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(zipFile);

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await fs
      .createReadStream(zipFile)
      .pipe(unzipper.Extract({ path: outputDir }))
      .promise();

    fs.unlinkSync(zipFile);

    // Log extracted files in the directory
    const files = fs.readdirSync(outputDir);
    const geoJsonFiles = files.filter((file) => file.endsWith('.json'));

    console.log(`Downloaded and extracted ${geoJsonFiles.length} GeoJSON files from ${url}`);
    if (geoJsonFiles.length === 0) {
      console.log('Files in directory:', files.join(', '));
    }
  } catch (error) {
    console.error(`Failed to download or extract ${url}:`, error);
  }
};

const downloadAllDistricts = async () => {
  for (const url of districtsUrls) {
    await downloadAndExtract(url);
  }
};

downloadAllDistricts();
