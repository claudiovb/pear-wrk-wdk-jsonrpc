#!/usr/bin/env node
/**
 * Convert ESM modules to CJS in a bare-pack bundle for JSC compatibility.
 *
 * Usage: node convert-bundle-esm-to-cjs.js <bundle-path> [--in-place] [--minify]
 *
 * Bare-pack bundles include modules verbatim — ESM packages keep
 * import/export syntax that JSC can't handle via CJS require().
 * This script runs esbuild (format: 'cjs') on all .js/.mjs files and
 * removes "type": "module" from package.json files.
 *
 * Note: .mjs files keep their extension — the worklet patches
 * Module._extensions['.mjs'] at runtime to load them as CJS.
 *
 * Bundle format: <N>\n<JSON>\n<DATA>
 * where N = JSON.length + 2, offsets in header.files are relative to DATA.
 */

const fs = require('fs');
const esbuild = require('esbuild');

const bundlePath = process.argv[2];
const inPlace = process.argv.includes('--in-place');
const minify = process.argv.includes('--minify');

if (!bundlePath) {
  console.error('Usage: node convert-bundle-esm-to-cjs.js <bundle-path> [--in-place] [--minify]');
  process.exit(1);
}

// --- Parse bundle ---
function parseBundle(buf) {
  const nl = buf.indexOf(0x0a);
  const headerStart = nl + 1;
  const headerArea = buf.slice(headerStart, headerStart + parseInt(buf.slice(0, nl).toString(), 10) + 10).toString();
  let depth = 0, jsonEnd = -1;
  for (let i = 0; i < headerArea.length; i++) {
    if (headerArea[i] === '{') depth++;
    if (headerArea[i] === '}') depth--;
    if (depth === 0) { jsonEnd = i + 1; break; }
  }
  if (jsonEnd < 0) throw new Error('Could not find JSON end');
  const header = JSON.parse(buf.slice(headerStart, headerStart + jsonEnd).toString());
  const dataStart = headerStart + jsonEnd + 1;
  return { header, dataStart };
}

const buf = fs.readFileSync(bundlePath);
const { header, dataStart } = parseBundle(buf);

const files = header.files;
if (!files) { console.error('No files map in header'); process.exit(1); }

// --- Convert all JS/MJS files to CJS via esbuild ---
const sortedEntries = Object.entries(files)
  .filter(([, info]) => info.offset !== undefined)
  .sort((a, b) => a[1].offset - b[1].offset);

const newBuffers = [];
let converted = 0, failed = 0, pkgPatched = 0;

for (const [filePath, info] of sortedEntries) {
  const originalContent = buf.slice(dataStart + info.offset, dataStart + info.offset + info.length);
  let newContent = originalContent;

  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    try {
      const result = esbuild.transformSync(originalContent.toString(), {
        format: 'cjs',
        target: 'es2020',
        minify,
      });
      newContent = Buffer.from(result.code);
      converted++;
    } catch (e) {
      console.error(`FAIL ${filePath}: ${e.message.split('\n')[0]}`);
      failed++;
    }
  } else if (filePath.endsWith('/package.json')) {
    try {
      const pkg = JSON.parse(originalContent.toString());
      if (pkg.type === 'module') {
        delete pkg.type;
        newContent = Buffer.from(JSON.stringify(pkg));
        pkgPatched++;
      }
    } catch (e) { /* skip */ }
  }

  newBuffers.push(newContent);
}

console.log(`Converted: ${converted}, Failed: ${failed}, Packages patched: ${pkgPatched}`);

if (failed > 0) {
  console.error('Some files failed to convert');
  process.exit(1);
}

// --- Recalculate offsets ---
let offset = 0;
for (let i = 0; i < sortedEntries.length; i++) {
  sortedEntries[i][1].offset = offset;
  sortedEntries[i][1].length = newBuffers[i].length;
  offset += newBuffers[i].length;
}

// --- Rebuild bundle ---
const newData = Buffer.concat(newBuffers);
const newJsonStr = JSON.stringify(header);
const N = newJsonStr.length + 2;
const newBundle = Buffer.concat([
  Buffer.from(N.toString() + '\n'),
  Buffer.from(newJsonStr),
  Buffer.from('\n'),
  newData
]);

const outPath = inPlace ? bundlePath : bundlePath.replace(/\.bundle$/, '.cjs.bundle');
fs.writeFileSync(outPath, newBundle);
console.log(`Written: ${outPath} (${(newBundle.length / 1024 / 1024).toFixed(1)} MB)`);

// --- Verify ---
const { header: vHeader, dataStart: vDataStart } = parseBundle(fs.readFileSync(outPath));
const vFiles = vHeader.files;
const first = Object.entries(vFiles).find(e => e[1].offset === 0);
if (first) {
  const vBuf = fs.readFileSync(outPath);
  const content = vBuf.slice(vDataStart, vDataStart + Math.min(first[1].length, 50)).toString();
  console.log(`Verify first file: ${first[0]} -> "${content.substring(0, 40)}..."`);
}