import express from 'express';
import { createApp } from './app.ts';

let cachedApp: express.Express | null = null;

function normalizeVercelUrl(req: express.Request): string {
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const rawPath = urlObj.searchParams.get('__vercel_path');

  if (rawPath && rawPath.length > 0) {
    let decoded = rawPath;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      decoded = rawPath;
    }
    const cleanPath = decoded.replace(/^\/+/, '');
    urlObj.searchParams.delete('__vercel_path');
    const restSearch = urlObj.searchParams.toString();
    if (cleanPath.includes('?')) {
      const [pathPart, queryPart] = cleanPath.split('?', 2);
      const mergedParams = new URLSearchParams(queryPart);
      urlObj.searchParams.forEach((v, k) => mergedParams.append(k, v));
      const mergedStr = mergedParams.toString();
      return `/api/${pathPart.replace(/^\/+/, '')}${mergedStr ? `?${mergedStr}` : ''}`;
    }
    return `/api/${cleanPath}${restSearch ? `?${restSearch}` : ''}`;
  }

  const origUriHeader = req.headers['x-vercel-original-uri'] || req.headers['x-forwarded-uri'];
  const origUri = Array.isArray(origUriHeader) ? origUriHeader[0] : origUriHeader;

  if (
    origUri &&
    typeof origUri === 'string' &&
    origUri.startsWith('/api/') &&
    !origUri.startsWith('/api/index')
  ) {
    return origUri;
  }

  urlObj.searchParams.delete('...path');
  urlObj.searchParams.delete('path');

  if (
    urlObj.pathname === '/' ||
    urlObj.pathname === '/api' ||
    urlObj.pathname === '/api/index' ||
    urlObj.pathname === '/api/index.js'
  ) {
    urlObj.pathname = '/api/health';
  } else if (!urlObj.pathname.startsWith('/api/')) {
    urlObj.pathname = `/api${urlObj.pathname.startsWith('/') ? '' : '/'}${urlObj.pathname}`;
  }

  const restSearch = urlObj.searchParams.toString();
  return `${urlObj.pathname}${restSearch ? `?${restSearch}` : ''}`;
}

function getVercelApp(): express.Express {
  if (cachedApp) return cachedApp;

  const apiApp = createApp();
  const vercelApp = express();

  vercelApp.use((req, _res, next) => {
    req.url = normalizeVercelUrl(req);
    next();
  });

  vercelApp.use(apiApp);
  cachedApp = vercelApp;
  return cachedApp;
}

export default function handler(req: express.Request, res: express.Response) {
  try {
    const app = getVercelApp();
    return app(req, res);
  } catch (err) {
    console.error('Error iniciando función serverless:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Error interno del servidor al iniciar la API.',
    });
  }
}
