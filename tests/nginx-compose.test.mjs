import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootDir = new URL('../', import.meta.url);

async function readText(relativePath) {
  return readFile(new URL(relativePath, rootDir), 'utf8');
}

test('docker-compose exposes nginx on 80/443 with variable domains', async () => {
  const compose = await readText('docker-compose.yml');

  assert.match(compose, /^\s+nginx:/m);
  assert.match(compose, /-\s+'80:80'/);
  assert.match(compose, /-\s+'443:443'/);
  assert.match(compose, /\.\/nginx\/templates:\/etc\/nginx\/templates:ro/);
  assert.match(compose, /WEB_DOMAIN: \$\{WEB_DOMAIN:-hobbit\.drcode\.ai\}/);
  assert.match(compose, /API_DOMAIN: \$\{API_DOMAIN:-hobbit-api\.drcode\.ai\}/);

  assert.match(compose, /web-host:[\s\S]*?expose:\s*\n\s+- '4321'/);
  assert.match(compose, /^\s+api:[\s\S]*?expose:\s*\n\s+- '3001'/m);

  const appServices = compose.split(/^\s+nginx:/m)[0];
  assert.doesNotMatch(appServices, /\n\s+ports:\n/);

  assert.match(
    compose,
    /PUBLIC_API_URL: \$\{PUBLIC_API_URL:-https:\/\/\$\{API_DOMAIN:-hobbit-api\.drcode\.ai\}\}/,
  );
  assert.match(
    compose,
    /CORS_ORIGIN: \$\{CORS_ORIGIN:-https:\/\/\$\{WEB_DOMAIN:-hobbit\.drcode\.ai\}\}/,
  );
});

test('nginx templates route variable domains to the correct upstreams', async () => {
  const [webTemplate, apiTemplate, proxyParams] = await Promise.all([
    readText('nginx/templates/web.conf.template'),
    readText('nginx/templates/api.conf.template'),
    readText('nginx/snippets/proxy-params.conf'),
  ]);

  assert.match(webTemplate, /server_name \$\{WEB_DOMAIN\};/);
  assert.match(webTemplate, /set \$upstream http:\/\/web-host:4321;/);
  assert.match(webTemplate, /return 301 https:\/\/\$host\$request_uri;/);

  assert.match(apiTemplate, /server_name \$\{API_DOMAIN\};/);
  assert.match(apiTemplate, /set \$upstream http:\/\/api:3001;/);
  assert.match(apiTemplate, /client_max_body_size 10m;/);

  assert.match(proxyParams, /X-Forwarded-Proto/);
  assert.match(proxyParams, /Upgrade \$http_upgrade/);
});

test('cert generation script reads WEB_DOMAIN and API_DOMAIN from env', async () => {
  const script = await readText('scripts/nginx/generate-self-signed-certs.sh');

  assert.match(script, /WEB_DOMAIN="\$\{WEB_DOMAIN:-hobbit\.drcode\.ai\}"/);
  assert.match(script, /API_DOMAIN="\$\{API_DOMAIN:-hobbit-api\.drcode\.ai\}"/);
  assert.match(
    script,
    /subjectAltName=DNS:\$\{WEB_DOMAIN\},DNS:\$\{API_DOMAIN\}/,
  );
});
