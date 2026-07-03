import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

test('.env.example documents FRONTEND_URL for invite link generation', async () => {
  const envExample = await readText('.env.example');

  assert.match(envExample, /FRONTEND_URL/);
  assert.match(envExample, /invite/i);
  assert.match(envExample, /CORS_ORIGIN/);
});

test('invite-url.ts reads FRONTEND_URL before CORS_ORIGIN', async () => {
  const inviteUrl = await readText('apps/api/src/utils/invite-url.ts');

  assert.match(inviteUrl, /process\.env\.FRONTEND_URL/);
  assert.match(
    inviteUrl,
    /process\.env\.FRONTEND_URL \|\|[\s\S]*process\.env\.CORS_ORIGIN/,
  );
});
