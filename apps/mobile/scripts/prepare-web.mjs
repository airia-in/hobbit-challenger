#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.dirname(scriptDir);
const repoDir = path.resolve(mobileDir, '../..');
const webDir = path.join(repoDir, 'apps/web');
const webDist = path.join(webDir, 'dist');
const mobileWww = path.join(mobileDir, 'www');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoDir,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})`));
    });
  });
}

const apiUrl = process.env.PUBLIC_API_URL ?? 'https://api.drcode.app';

await run('pnpm', ['--filter', '@workspace-starter/web', 'build'], {
  env: {
    ASTRO_DEPLOY_TARGET: 'static',
    PUBLIC_API_URL: apiUrl,
  },
});

await rm(mobileWww, { recursive: true, force: true });
await mkdir(mobileWww, { recursive: true });
await cp(webDist, mobileWww, { recursive: true });

console.log(`Prepared Capacitor web bundle at ${mobileWww}`);
