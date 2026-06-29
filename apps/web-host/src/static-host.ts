import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';

export interface MountedSite {
  name: string;
  basePath: string;
  rootDir: string;
}

export interface StaticHostOptions {
  sites: MountedSite[];
}

interface FileMatch {
  filePath: string;
  contentType: string;
}

const contentTypes = new Map<string, string>([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

// Each subdirectory of rootDir is a static frontend build. The primary
// frontend is mounted at /, every other frontend at /<dir-name>. This keeps
// adding a frontend to a zero-edit operation: stage its build under rootDir.
export function discoverMountedSites(
  rootDir: string,
  primaryName: string,
): MountedSite[] {
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (entries.length === 0) {
    return [];
  }

  const primary = entries.includes(primaryName) ? primaryName : entries[0];

  return entries.map((name) => ({
    name,
    basePath: name === primary ? '/' : `/${name}`,
    rootDir: path.join(rootDir, name),
  }));
}

export function createStaticHostServer(options: StaticHostOptions) {
  const sites = options.sites.map((site) => ({
    ...site,
    basePath: normalizeBasePath(site.basePath),
    rootDir: path.resolve(site.rootDir),
  }));

  if (sites.length === 0) {
    console.log(
      'No sites to serve. Stage frontends under sites/ or run scripts/build-frontends.mjs.',
    );
    return createServer((_request, response) => {
      sendText(response, 404, 'Not found');
    });
  }

  if (!sites.some((site) => site.basePath === '/')) {
    throw new Error('Static host requires one site mounted at /.');
  }

  const sortedSites = sites.sort((left, right) => {
    return right.basePath.length - left.basePath.length;
  });

  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response, sortedSites);
    } catch (error) {
      console.error('Static host request failed:', error);
      sendText(response, 500, 'Internal server error');
    }
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  sites: MountedSite[],
) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendText(response, 405, 'Method not allowed');
    return;
  }

  const requestUrl = parseRequestUrl(request);
  if (!requestUrl) {
    sendText(response, 400, 'Bad request');
    return;
  }

  const site = findMountedSite(sites, requestUrl.pathname);
  if (!site) {
    sendText(response, 404, 'Not found');
    return;
  }

  if (site.basePath !== '/' && requestUrl.pathname === site.basePath) {
    response.statusCode = 308;
    response.setHeader('Location', `${site.basePath}/`);
    response.end();
    return;
  }

  const relativePath =
    site.basePath === '/'
      ? requestUrl.pathname
      : requestUrl.pathname.slice(site.basePath.length) || '/';

  await serveSiteFile(request, response, site, relativePath);
}

function parseRequestUrl(request: IncomingMessage) {
  try {
    const host = request.headers.host ?? 'localhost';
    return new URL(request.url ?? '/', `http://${host}`);
  } catch {
    return null;
  }
}

function findMountedSite(sites: MountedSite[], pathname: string) {
  return sites.find((site) => {
    if (site.basePath === '/') {
      return true;
    }

    return (
      pathname === site.basePath || pathname.startsWith(`${site.basePath}/`)
    );
  });
}

function parseJoinInviteToken(relativePath: string): string | null {
  const match = relativePath.match(/^\/join\/([^/]+)\/?$/);
  if (!match || match[1] === '_') return null;
  return match[1];
}

function joinInviteRedirectPath(relativePath: string): string | null {
  const token = parseJoinInviteToken(relativePath);
  if (!token) return null;
  return `/join?token=${encodeURIComponent(token)}`;
}

async function serveSiteFile(
  request: IncomingMessage,
  response: ServerResponse,
  site: MountedSite,
  relativePath: string,
) {
  let file = await findStaticFile(site.rootDir, relativePath);

  const joinRedirect = joinInviteRedirectPath(relativePath);
  if (!file && joinRedirect) {
    response.statusCode = 302;
    response.setHeader('Location', joinRedirect);
    response.end();
    return;
  }

  if (!file) {
    await serveMissingFile(request, response, site.rootDir, relativePath);
    return;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Cache-Control', getCacheControl(file.filePath));

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(file.filePath).pipe(response);
}

async function serveMissingFile(
  request: IncomingMessage,
  response: ServerResponse,
  rootDir: string,
  relativePath: string,
) {
  if (joinInviteRedirectPath(relativePath)) {
    const redirect = joinInviteRedirectPath(relativePath)!;
    response.statusCode = 302;
    response.setHeader('Location', redirect);
    response.end();
    return;
  }

  const notFoundFile = await findStaticFile(rootDir, '/404.html');

  if (!notFoundFile) {
    sendText(response, 404, 'Not found');
    return;
  }

  response.statusCode = 404;
  response.setHeader('Content-Type', notFoundFile.contentType);
  response.setHeader('Cache-Control', 'no-cache');

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(notFoundFile.filePath).pipe(response);
}

async function findStaticFile(
  rootDir: string,
  requestPath: string,
): Promise<FileMatch | null> {
  const normalizedPath = normalizeRequestPath(requestPath);

  if (!normalizedPath) {
    return null;
  }

  const candidates = getFileCandidates(rootDir, normalizedPath);

  for (const candidate of candidates) {
    const filePath = resolveSafePath(rootDir, candidate);

    if (!filePath) {
      continue;
    }

    const fileStat = await stat(filePath).catch(() => null);

    if (fileStat?.isFile()) {
      return {
        filePath,
        contentType:
          contentTypes.get(path.extname(filePath).toLowerCase()) ??
          'application/octet-stream',
      };
    }
  }

  return null;
}

function normalizeRequestPath(requestPath: string) {
  try {
    const decodedPath = decodeURIComponent(requestPath);
    return path.posix.normalize(`/${decodedPath}`);
  } catch {
    return null;
  }
}

function getFileCandidates(rootDir: string, normalizedPath: string) {
  const directPath = path.join(rootDir, normalizedPath);

  return [
    directPath,
    path.join(directPath, 'index.html'),
    `${directPath}.html`,
  ];
}

function resolveSafePath(rootDir: string, candidatePath: string) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);

  if (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    return resolvedCandidate;
  }

  return null;
}

function getCacheControl(filePath: string) {
  if (filePath.includes(`${path.sep}_astro${path.sep}`)) {
    return 'public, max-age=31536000, immutable';
  }

  if (path.extname(filePath).toLowerCase() === '.html') {
    return 'no-cache';
  }

  return 'public, max-age=3600';
}

function normalizeBasePath(basePath: string) {
  if (!basePath.startsWith('/')) {
    return `/${basePath}`;
  }

  if (basePath.length > 1 && basePath.endsWith('/')) {
    return basePath.slice(0, -1);
  }

  return basePath;
}

function sendText(response: ServerResponse, statusCode: number, body: string) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(body);
}
