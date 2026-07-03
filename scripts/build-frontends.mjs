#!/usr/bin/env node

// Discovers every Astro frontend under apps/*, builds each as a static site,
// and stages the output under apps/web-host/sites/<name>. apps/web-host then
// serves them all from one process: the primary frontend at /, the rest at
// /<name>. Adding a frontend needs no edits here or in web-host — drop an
// Astro app under apps/ and it is picked up automatically.

import { spawn } from 'node:child_process';
import { access, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  ASSETLINKS_PUBLIC_RELATIVE_PATH,
  writeAssetLinksFile,
} from './generate-assetlinks.mjs';

// Self-contained command runner. This script must keep working in generated
// products, where the installer-only scripts/lib directory is removed.
function runCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(
          new Error(
            `Command failed: ${command} ${args.join(' ')} (exit ${code})`,
          ),
        );
      }
    });
  });
}

const ASTRO_CONFIG_NAMES = [
  'astro.config.ts',
  'astro.config.mts',
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.cjs',
];

const DEFAULT_PRIMARY = 'web';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function isAstroApp(appDir) {
  for (const configName of ASTRO_CONFIG_NAMES) {
    if (await pathExists(path.join(appDir, configName))) {
      return true;
    }
  }
  return false;
}

// Resolves the mount path for a frontend. The primary frontend owns the root;
// every other frontend mounts under its directory name so its Astro `base`
// (set below) and the web-host mount path always agree.
function mountPathFor(name, primary) {
  return name === primary ? '/' : `/${name}`;
}

export async function discoverFrontends({ repoDir, primary } = {}) {
  const appsDir = path.join(repoDir, 'apps');
  const entries = await readdir(appsDir, { withFileTypes: true });

  const frontends = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const appDir = path.join(appsDir, entry.name);
    if (!(await isAstroApp(appDir))) {
      continue;
    }

    const manifest = await readJson(path.join(appDir, 'package.json'));
    frontends.push({
      name: entry.name,
      dir: appDir,
      packageName: manifest.name,
    });
  }

  frontends.sort((left, right) => left.name.localeCompare(right.name));

  if (frontends.length === 0) {
    throw new Error('No Astro frontends found under apps/.');
  }

  const resolvedPrimary = resolvePrimary(frontends, primary);

  return frontends.map((frontend) => {
    const mountPath = mountPathFor(frontend.name, resolvedPrimary);
    return { ...frontend, mountPath, base: mountPath };
  });
}

function resolvePrimary(frontends, primary) {
  const names = frontends.map((frontend) => frontend.name);

  if (primary) {
    if (!names.includes(primary)) {
      throw new Error(
        `PRIMARY_FRONTEND "${primary}" is not an Astro app under apps/.`,
      );
    }
    return primary;
  }

  if (names.includes(DEFAULT_PRIMARY)) {
    return DEFAULT_PRIMARY;
  }

  return names[0];
}

export async function buildAndStageFrontends({
  repoDir = process.cwd(),
  primary = process.env.PRIMARY_FRONTEND || undefined,
  stagingDir = path.join(repoDir, 'apps/web-host/sites'),
} = {}) {
  const frontends = await discoverFrontends({ repoDir, primary });

  await writeAssetLinksFile({
    outputPath: path.join(repoDir, ASSETLINKS_PUBLIC_RELATIVE_PATH),
  });

  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  for (const frontend of frontends) {
    // Build through Turbo so each frontend's workspace dependencies (ui, i18n,
    // …) are built first via the build task's `^build` dependency. The build
    // env is declared in turbo.json so a per-app ASTRO_BASE invalidates cache.
    await runCommand(
      'pnpm',
      ['turbo', 'build', '--filter', frontend.packageName],
      {
        cwd: repoDir,
        env: {
          ASTRO_DEPLOY_TARGET: 'static',
          ASTRO_BASE: frontend.base,
        },
      },
    );

    const distDir = path.join(frontend.dir, 'dist');
    if (!(await pathExists(distDir))) {
      throw new Error(
        `Expected static build output at ${distDir} for ${frontend.packageName}.`,
      );
    }

    const destDir = path.join(stagingDir, frontend.name);
    await cp(distDir, destDir, { recursive: true });
  }

  return frontends.map(({ name, packageName, mountPath }) => ({
    name,
    packageName,
    mountPath,
  }));
}

async function main() {
  const staged = await buildAndStageFrontends();
  console.log('Staged frontends for web-host:');
  for (const frontend of staged) {
    console.log(`- ${frontend.name} -> ${frontend.mountPath}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
