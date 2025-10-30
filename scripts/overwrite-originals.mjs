#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';
import sharp from 'sharp';

const ROOT = process.cwd();

// Patterns include common raster images (we will skip svg and already optimized webp/avif)
const patterns = [
  'src/**/assets/**/*.{png,jpg,jpeg,JPG,PNG,JPEG}',
  'screenshots/*.{png,jpg,jpeg}',
  'public/*.{png,jpg,jpeg}'
];

const files = await fg(patterns, { dot: false, onlyFiles: true });

if (!files.length) {
  console.log('No raster images found to overwrite.');
  process.exit(0);
}

console.log(`Found ${files.length} raster images — overwriting originals with optimized versions.`);

const summary = [];

for (const rel of files) {
  try {
    const abs = path.join(ROOT, rel);
    const stat = await fs.stat(abs);
    const origSize = stat.size;

    // Skip tiny files
    if (origSize < 1024) {
      summary.push({ file: rel, note: 'skipped (too small)' });
      continue;
    }

    const ext = path.extname(rel).toLowerCase();

    // Prepare a temporary output path
    const tmpPath = abs + '.opt.tmp';

    if (ext === '.jpg' || ext === '.jpeg') {
      await sharp(abs).jpeg({ quality: 75 }).toFile(tmpPath);
    } else if (ext === '.png') {
      // Use palette (PNG8) where possible + max compression
      await sharp(abs)
        .png({ compressionLevel: 9, palette: true, quality: 80 })
        .toFile(tmpPath);
    } else {
      summary.push({ file: rel, note: 'skipped (unsupported ext)' });
      continue;
    }

    // Replace original with optimized file
    const newStat = await fs.stat(tmpPath);
    await fs.rename(tmpPath, abs);

    summary.push({ file: rel, original: origSize, optimized: newStat.size });
    console.log(`Overwrote: ${rel} — ${Math.round(origSize/1024)}KB → ${Math.round(newStat.size/1024)}KB`);
  } catch (err) {
    console.error('Error optimizing', rel, err.message || err);
    summary.push({ file: rel, error: err.message || String(err) });
  }
}

console.log('\nSummary:');
for (const s of summary) {
  if (s.error) console.log(`${s.file} — ERROR: ${s.error}`);
  else if (s.note) console.log(`${s.file} — ${s.note}`);
  else console.log(`${s.file} — ${Math.round(s.original/1024)}KB → ${Math.round(s.optimized/1024)}KB`);
}

console.log('\nDone. Originals have been overwritten. Please review changes and run git diff to inspect.');
