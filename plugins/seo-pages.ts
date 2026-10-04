import type { Plugin } from 'vite';
import { buildContentPages } from '../seo/render';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function contentTypeFor(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return CONTENT_TYPES[fileName.slice(dot)] ?? 'text/plain; charset=utf-8';
}

/**
 * Reads the request path without touching the ambient `IncomingMessage` shape.
 * Which `http` declarations land in scope depends on the installed @types/node
 * and on what Vite's bundled `connect` types pull in, and `url` is not on every
 * version of `IncomingMessage`. Reading it structurally keeps this file type
 * checking the same in CI as it does locally.
 */
function pathnameOf(req: unknown): string {
  const url = (req as { url?: unknown }).url;
  if (typeof url !== 'string' || url.length === 0) return '/';
  return url.split('?')[0] ?? '/';
}

/**
 * Emits the SEO pages, sitemap, robots.txt, manifest and their stylesheet as
 * build assets, and serves the same set in dev so the routes work in both.
 *
 * Generating them from `seo/content.ts` keeps titles, canonicals, the nav, the
 * footer and the sitemap from drifting apart as pages are added.
 */
export function seoPages(): Plugin {
  const files = buildContentPages();

  return {
    name: 'ledgerlens-seo-pages',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = pathnameOf(req);
        const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

        const match = [`${trimmed}/index.html`, trimmed.slice(1)].find((key) => files.has(key));
        if (!match) return next();

        res.setHeader('Content-Type', contentTypeFor(match));
        res.setHeader('Cache-Control', 'no-cache');
        res.end(files.get(match));
      });
    },

    generateBundle() {
      for (const [fileName, source] of files) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}