import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const rootDir = new URL('../', import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function listPackageJsonFiles(directory) {
  const entries = await readdir(new URL(`${directory}/`, rootDir), {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${directory}/${entry.name}/package.json`);
}

test('root exposes repository guardrail scripts with pinned tooling', async () => {
  const pkg = await readJson('package.json');

  assert.equal(pkg.packageManager, 'pnpm@11.1.3');
  assert.equal(pkg.engines?.node, '>=22.13.0');
  assert.equal(pkg.engines?.pnpm, '>=11.1.3 <12');
  assert.equal(pkg.devDependencies?.prettier, 'catalog:dev-tools');
  assert.equal(
    pkg.devDependencies?.['prettier-plugin-astro'],
    'catalog:dev-tools',
  );

  assert.match(pkg.scripts?.['verify:fast'] ?? '', /pnpm lint/);
  assert.match(pkg.scripts?.['verify:fast'] ?? '', /pnpm format:check/);
  assert.match(pkg.scripts?.['verify:fast'] ?? '', /pnpm typecheck/);
  assert.match(pkg.scripts?.['verify:fast'] ?? '', /git diff --check/);
  assert.match(pkg.scripts?.format ?? '', /prettier --write/);
  assert.match(pkg.scripts?.['format:check'] ?? '', /prettier --check/);
  assert.equal(
    pkg.scripts?.['template:remove-web-apps'],
    'node scripts/template/remove-web-apps.mjs',
  );
  assert.equal(
    pkg.scripts?.['template:remove-web-apps:dry-run'],
    'node scripts/template/remove-web-apps.mjs --dry-run',
  );
  assert.match(pkg.scripts?.verify ?? '', /pnpm verify:fast/);
  assert.match(pkg.scripts?.verify ?? '', /pnpm build/);
  assert.match(pkg.scripts?.verify ?? '', /pnpm smoke:api/);
  assert.match(pkg.scripts?.verify ?? '', /pnpm test/);
  assert.equal(pkg.scripts?.['smoke:api'], 'node scripts/smoke-api.mjs');
  assert.match(
    pkg.scripts?.['hooks:install'] ?? '',
    /core\.hooksPath .githooks/,
  );
});

test('local Git hooks call the repository verification scripts', async () => {
  const [preCommit, prePush, preCommitStat, prePushStat] = await Promise.all([
    readText('.githooks/pre-commit'),
    readText('.githooks/pre-push'),
    stat(new URL('.githooks/pre-commit', rootDir)),
    stat(new URL('.githooks/pre-push', rootDir)),
  ]);

  assert.match(preCommit, /pnpm verify:fast/);
  assert.match(prePush, /pnpm verify/);
  assert.notEqual(
    preCommitStat.mode & 0o111,
    0,
    'pre-commit should be executable',
  );
  assert.notEqual(prePushStat.mode & 0o111, 0, 'pre-push should be executable');
});

test('GitHub CI runs the same repository verification command', async () => {
  const workflow = await readText('.github/workflows/ci.yml');
  const corepackInstallIndex = workflow.indexOf(
    'npm install --global corepack@0.34.2',
  );
  const pnpmPrepareIndex = workflow.indexOf(
    'corepack prepare pnpm@11.1.3 --activate',
  );

  assert.match(workflow, /node-version: 22\.13\.0/);
  assert.notEqual(corepackInstallIndex, -1);
  assert.notEqual(pnpmPrepareIndex, -1);
  assert.ok(
    corepackInstallIndex < pnpmPrepareIndex,
    'GitHub CI should update Corepack before preparing pinned pnpm',
  );
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm verify/);
});

test('build-and-publish workflow is gated on CI and publishes per-app images', async () => {
  const workflow = await readText('.github/workflows/build-and-publish.yml');

  // Deploy must never run on a red build: it triggers off CI completion and
  // only proceeds when the CI run concluded successfully.
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \['CI'\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);

  // Images are discovered by convention (apps/<name>/Dockerfile) and pushed to
  // a registry tagged by git SHA.
  assert.match(workflow, /find apps -maxdepth 2 -name Dockerfile/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /docker\/build-push-action/);
  assert.match(workflow, /ghcr\.io/);

  // The deploy step routes through the host-agnostic dispatcher.
  assert.match(workflow, /node scripts\/deploy\/run\.mjs/);
});

test('release workflow publishes mobile web bundle and Android debug APK', async () => {
  const workflow = await readText('.github/workflows/release.yml');
  const apkDownloadStep =
    workflow.match(
      /- name: Download Android debug APK[\s\S]*?(?=\n      - name:|\n  [a-z-]+:|$)/,
    )?.[0] ?? '';
  const releaseStep =
    workflow.match(
      /- name: Create GitHub release[\s\S]*?(?=\n      - name:|\n  [a-z-]+:|$)/,
    )?.[0] ?? '';

  assert.match(workflow, /actions\/setup-java@v4/);
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /android-actions\/setup-android@v3/);
  assert.match(workflow, /pnpm --filter @workspace-starter\/mobile build/);
  assert.match(workflow, /\.\/gradlew assembleDebug --no-daemon/);
  assert.match(workflow, /ANDROID_VERSION_NAME: \$\{\{ inputs\.version \}\}/);
  assert.match(
    workflow,
    /ANDROID_VERSION_CODE: \$\{\{ github\.run_number \}\}/,
  );
  assert.match(workflow, /mobile-web-bundle\.tar\.gz/);
  assert.match(
    workflow,
    /apps\/mobile\/android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/,
  );
  assert.match(apkDownloadStep, /name: android-debug-apk/);
  assert.match(releaseStep, /files:\s*\|/);
  assert.match(releaseStep, /mobile-web-bundle\.tar\.gz/);
  assert.match(releaseStep, /app-debug\.apk/);
  assert.match(workflow, /default: 'https:\/\/hobbit-api\.drcode\.ai'/);
  assert.doesNotMatch(workflow, /api\.drcode\.app/);
  assert.match(workflow, /name: HOBBIT \$\{\{ inputs\.version \}\}/);
  assert.doesNotMatch(workflow, /DRCODE/);
  assert.match(workflow, /PUBLIC_API_URL=\$\{\{ inputs\.public_api_url \}\}/);
});

test('deployment is convention-driven by apps/<name>/Dockerfile', async () => {
  // Frontends are aggregated behind web-host, so they ship no individual
  // Dockerfile; web-host and the api do.
  assert.equal(
    await stat(new URL('apps/web/Dockerfile', rootDir))
      .then(() => true)
      .catch(() => false),
    false,
    'apps/web should not have its own Dockerfile (it is bundled by web-host)',
  );
  await stat(new URL('apps/web-host/Dockerfile', rootDir));
  await stat(new URL('apps/api/Dockerfile', rootDir));
});

test('workspace package manifests keep shared graph invariants', async () => {
  const packageFiles = [
    ...(await listPackageJsonFiles('apps')),
    ...(await listPackageJsonFiles('packages')),
  ];
  const manifests = await Promise.all(
    packageFiles.map(async (file) => [file, await readJson(file)]),
  );
  const workspaceNames = new Set(manifests.map(([, pkg]) => pkg.name));

  for (const [file, pkg] of manifests) {
    const hasSource = await stat(new URL(`${path.dirname(file)}/src`, rootDir))
      .then((stats) => stats.isDirectory())
      .catch(() => false);

    if (hasSource) {
      assert.equal(
        typeof pkg.scripts?.lint,
        'string',
        `${file} should expose a lint script`,
      );
      assert.equal(
        typeof pkg.scripts?.typecheck,
        'string',
        `${file} should expose a typecheck script`,
      );
    }

    for (const field of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      for (const [dependencyName, version] of Object.entries(
        pkg[field] ?? {},
      )) {
        if (workspaceNames.has(dependencyName)) {
          assert.equal(
            version,
            'workspace:*',
            `${file} should link ${dependencyName} with workspace:*`,
          );
        }
      }
    }
  }
});

test('web Tailwind scans shared UI package classes', async () => {
  const globalCss = await readText('apps/web/src/styles/global.css');

  assert.match(
    globalCss,
    /@source\s+['"]\.\.\/\.\.\/\.\.\/\.\.\/packages\/ui\/src['"]/,
    'apps/web must @source packages/ui so responsive utilities from shared components are emitted',
  );
});

test('root Turbo invocations reference configured tasks', async () => {
  const [pkg, turbo] = await Promise.all([
    readJson('package.json'),
    readJson('turbo.json'),
  ]);
  const taskNames = new Set(Object.keys(turbo.tasks ?? {}));

  for (const [scriptName, command] of Object.entries(pkg.scripts ?? {})) {
    for (const [, taskName] of command.matchAll(/\bturbo\s+([a-z:-]+)/g)) {
      assert.ok(
        taskNames.has(taskName),
        `${scriptName} references missing turbo task ${taskName}`,
      );
    }
  }
});
