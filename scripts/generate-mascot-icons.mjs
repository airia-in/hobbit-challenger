#!/usr/bin/env node
// Regenerates the raster icon set from the mascot SVGs. The SVGs are the source
// of truth; the PNGs are committed so builds don't depend on sharp. Re-run this
// after editing apps/web/public/{favicon,icon-maskable}.svg:
//   node scripts/generate-mascot-icons.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// sharp is an apps/api dependency (added in #174); resolve it from there so this
// root script works without adding a duplicate root dependency.
const sharp = require(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../apps/api/node_modules/sharp/lib/index.js',
  ),
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webPublic = join(root, 'apps/web/public');
const androidRes = join(root, 'apps/mobile/android/app/src/main/res');

async function png(svgPath, size, outPath) {
  const svg = await readFile(svgPath);
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return { outPath, size };
}

async function main() {
  const favicon = join(webPublic, 'favicon.svg');
  const maskable = join(webPublic, 'icon-maskable.svg');

  const outputs = [];
  // Web favicons + touch/PWA icons
  outputs.push(await png(favicon, 32, join(webPublic, 'favicon-32.png')));
  outputs.push(await png(favicon, 16, join(webPublic, 'favicon-16.png')));
  outputs.push(
    await png(favicon, 180, join(webPublic, 'apple-touch-icon.png')),
  );
  outputs.push(await png(maskable, 192, join(webPublic, 'icon-192.png')));
  outputs.push(await png(maskable, 512, join(webPublic, 'icon-512.png')));

  // Android launcher (square) across densities. Adaptive foreground/background
  // layering is a future refinement; these square icons replace the default.
  const androidSizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };
  for (const [dir, size] of Object.entries(androidSizes)) {
    outputs.push(
      await png(maskable, size, join(androidRes, dir, 'ic_launcher.png')),
    );
    outputs.push(
      await png(maskable, size, join(androidRes, dir, 'ic_launcher_round.png')),
    );
    outputs.push(
      await png(
        maskable,
        size,
        join(androidRes, dir, 'ic_launcher_foreground.png'),
      ),
    );
  }

  for (const o of outputs) {
    console.log(`wrote ${o.outPath} (${o.size}px)`);
  }
  console.log(`\nGenerated ${outputs.length} icon files.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
