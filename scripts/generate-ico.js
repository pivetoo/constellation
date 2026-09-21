import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '../assets');
const pngPath = path.join(assetsDir, 'galaxy_fluent.png');
const icoPath = path.join(assetsDir, 'constellation-galaxy.ico');
const icoPath2 = path.join(assetsDir, 'icon.ico');

const pngBuffer = fs.readFileSync(pngPath);

// Windows Vista/7/8/10/11 supports full PNG inside ICO header
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // ICO Type
header.writeUInt16LE(1, 4); // 1 Image

const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(0, 0);  // Width 256 (0 means 256)
dirEntry.writeUInt8(0, 1);  // Height 256 (0 means 256)
dirEntry.writeUInt8(0, 2);  // Colors
dirEntry.writeUInt8(0, 3);  // Reserved
dirEntry.writeUInt16LE(1, 4); // Color planes
dirEntry.writeUInt16LE(32, 6); // Bits per pixel
dirEntry.writeUInt32LE(pngBuffer.length, 8); // Image size
dirEntry.writeUInt32LE(22, 12); // Offset: 6 + 16 = 22

const finalIco = Buffer.concat([header, dirEntry, pngBuffer]);

fs.writeFileSync(icoPath, finalIco);
fs.writeFileSync(icoPath2, finalIco);
console.log('Generated ICO with full 256x256 3D color PNG payload, size:', finalIco.length, 'bytes');
