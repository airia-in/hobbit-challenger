import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

test('docker-compose exposes nginx on 80/443 and keeps app services internal', async () => {
  const compose = await readText('docker-compose.yml');

  assert.match(compose, /^\s+nginx:/m);
  assert.match(compose, /-\s+'80:80'/);
  assert.match(compose, /-\s+'443:443'/);
  assert.match(compose, /\.\/nginx\/conf\.d:\/etc\/nginx\/conf\.d:ro/);

  assert.match(compose, /web-host:[\s\S]*?expose:\s*\n\s+- '4321'/);
  assert.match(compose, /^\s+api:[\s\S]*?expose:\s*\n\s+- '3001'/m);

  const appServices = compose.split(/^\s+nginx:/m)[0];
  assert.doesNotMatch(appServices, /\n\s+ports:\n/);

  assert.match(
    compose,
    /PUBLIC_API_URL: \$\{PUBLIC_API_URL:-https:\/\/hobbit-api\.drcode\.ai\}/,
  );
  assert.match(
    compose,
    /CORS_ORIGIN: \$\{CORS_ORIGIN:-https:\/\/hobbit\.drcode\.ai\}/,
  );
});

test('nginx config routes hobbit domains to the correct upstreams', async () => {
  const [webConf, apiConf, proxyParams] = await Promise.all([
    readText('nginx/conf.d/hobbit-web.conf'),
    readText('nginx/conf.d/hobbit-api.conf'),
    readText('nginx/snippets/proxy-params.conf'),
  ]);

  assert.match(webConf, /server_name hobbit\.drcode\.ai;/);
  assert.match(webConf, /set \$upstream http:\/\/web-host:4321;/);
  assert.match(webConf, /return 301 https:\/\/\$host\$request_uri;/);

  assert.match(apiConf, /server_name hobbit-api\.drcode\.ai;/);
  assert.match(apiConf, /set \$upstream http:\/\/api:3001;/);
  assert.match(apiConf, /client_max_body_size 10m;/);

  assert.match(proxyParams, /X-Forwarded-Proto/);
  assert.match(proxyParams, /Upgrade \$http_upgrade/);
});

test('cert generation script writes SANs for both hostnames', async () => {
  const script = await readText('scripts/nginx/generate-self-signed-certs.sh');

  assert.match(script, /fullchain\.pem/);
  assert.match(script, /privkey\.pem/);
  assert.match(script, /DNS:hobbit\.drcode\.ai,DNS:hobbit-api\.drcode\.ai/);
});
