#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { validateAssetLinksPayload } from './lib/android-app-links.mjs';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      'Usage: node scripts/validate-assetlinks.mjs <path-to-assetlinks.json>',
    );
    process.exitCode = 1;
    return;
  }

  const content = await readFile(filePath, 'utf8');
  validateAssetLinksPayload(JSON.parse(content));
  console.log(`Validated ${filePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
