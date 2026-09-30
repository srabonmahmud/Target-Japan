import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'www');
const webAssets = [
  'index.html',
  'style.css',
  'script.js',
  'finance.js',
  'manifest.json',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  '_headers'
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(webAssets.map(asset =>
  copyFile(path.join(projectRoot, asset), path.join(outputDirectory, asset))
));

console.log(`Built ${webAssets.length} web assets into ${path.relative(projectRoot, outputDirectory)}.`);
