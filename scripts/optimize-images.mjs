#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';
import sharp from 'sharp';

const ROOT = process.cwd();

const patterns = [
  'src/**/assets/**/*.{png,jpg,jpeg,JPG,PNG,JPEG}',
  'screenshots/*.{png,jpg,jpeg}',
  'public/*.{png,jpg,jpeg}'
];

const files = await fg(patterns, { dot: false, onlyFiles: true });

if (!files.length) {
  console.log('No images found to optimize.');
  process.exit(0);
}

console.log(`Found ${files.length} images — starting optimization...`);

const summary = [];

for (const rel of files) {
  try {
    const abs = path.join(ROOT, rel);
    const stat = await fs.stat(abs);
    const origSize = stat.size;

    // Skip very small images (icons) to avoid overhead
    const ext = path.extname(rel).toLowerCase();
    if (origSize < 5_000 && ext === '.png') {
      summary.push({ file: rel, note: 'skipped (tiny icon)' });
      continue;
    }

    // Use sharp to create webp and avif versions.
    const img = sharp(abs, { animated: false });
    const meta = await img.metadata();

    // Resize large images to max width 1920 to save size (only for raster images)
    const resizeOpts = {};
    if (meta.width && meta.width > 1920) resizeOpts.width = 1920;

    const webpPath = abs.replace(/\.[^.]+$/, '.webp');
    const avifPath = abs.replace(/\.[^.]+$/, '.avif');

    await img
      .resize(resizeOpts)
      .webp({ quality: 75, smartSubsample: true })
      .toFile(webpPath);

    // Recreate from original again for avif (to avoid reusing already converted buffer)
    await sharp(abs)
      .resize(resizeOpts)
      .avif({ quality: 60 })
      .toFile(avifPath);

    const webpStat = await fs.stat(webpPath);
    const avifStat = await fs.stat(avifPath);

    summary.push({
      file: rel,
      original: origSize,
      webp: webpStat.size,
      avif: avifStat.size
    });
    console.log(`Optimized: ${rel} → webp ${Math.round(webpStat.size/1024)}KB, avif ${Math.round(avifStat.size/1024)}KB`);
  } catch (err) {
    console.error('Error processing', rel, err.message || err);
    summary.push({ file: rel, error: (err.message || String(err)) });
  }
}

// Print summary
console.log('\nOptimization summary:');
for (const s of summary) {
  if (s.error) console.log(`${s.file} — ERROR: ${s.error}`);
  else if (s.note) console.log(`${s.file} — ${s.note}`);
  else console.log(`${s.file} — original ${Math.round(s.original/1024)}KB, webp ${Math.round(s.webp/1024)}KB, avif ${Math.round(s.avif/1024)}KB`);
}

console.log('\nDone. New .webp and .avif files were created next to originals. Review them and replace originals if you want smaller assets in repo.');
