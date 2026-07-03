import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

test('.env.example documents WEB_DOMAIN for WhatsApp dashboard links', async () => {
  const envExample = await readText('.env.example');

  assert.match(envExample, /WEB_DOMAIN/);
  // The comment must warn that an unset value falls back to production, so a
  // local/staging API does not silently emit production dashboard links.
  assert.match(envExample, /dashboard links/i);
  assert.match(envExample, /PRODUCTION dashboard links/);
});

test('WhatsApp message service reads WEB_DOMAIN with a documented default', async () => {
  const service = await readText(
    'apps/api/src/whatsapp/openai-reminder.service.ts',
  );

  assert.match(service, /config\.get<string>\('WEB_DOMAIN'\)/);
});
