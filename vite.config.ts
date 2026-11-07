import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { imagetools } from 'vite-imagetools';

const PRESETS = path.resolve(import.meta.dirname, './src/lab/presets');

// The lab panel's "Save defaults": writes a store's values to
// `src/lab/presets/<id>.json`, which `controls.ts` reads as that store's
// defaults. Dev server only — the built site just reads the committed files.
function labPresets(): Plugin {
  return {
    name: 'lab-presets',
    apply: 'serve',
    // The panel already holds the saved values, so a preset changing shouldn't
    // hot-reload the experiment out from under it. The modules are still
    // invalidated, so the next page load reads the file as it now is — that
    // includes presets edited or deleted by hand.
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(PRESETS)) return;
      for (const f of [file, path.join(PRESETS, '../controls.ts')]) {
        const mod = server.moduleGraph.getModuleById(f);
        if (mod) server.moduleGraph.invalidateModule(mod);
      }
      return [];
    },
    configureServer(server) {
      server.middlewares.use('/__lab/preset', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { id, values } = JSON.parse(body);
            if (typeof id !== 'string' || !/^[\w-]+$/.test(id))
              throw new Error('bad id');
            if (!values || typeof values !== 'object')
              throw new Error('bad values');
            fs.mkdirSync(PRESETS, { recursive: true });
            const file = path.join(PRESETS, `${id}.json`);
            fs.writeFileSync(file, `${JSON.stringify(values, null, 2)}\n`);
            // The preset itself, and `controls.ts`, whose glob has to see a
            // file that didn't exist when it was compiled.
            for (const f of [file, path.join(PRESETS, '../controls.ts')]) {
              const mod = server.moduleGraph.getModuleById(f);
              if (mod) server.moduleGraph.invalidateModule(mod);
            }
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

const WORKS = path.resolve(import.meta.dirname, './src/works');

// The studio's "Save": writes `src/works/<slug>/artwork.json` and the
// `thumb.jpg` captured from the compositor. Dev server only, like presets.
function labArtworks(): Plugin {
  const invalidate = (server: ViteDevServer, files: string[]) => {
    for (const f of files) {
      const mod = server.moduleGraph.getModuleById(f);
      if (mod) server.moduleGraph.invalidateModule(mod);
    }
  };
  const isSaved = (file: string) =>
    file.startsWith(WORKS) && /[\\/](artwork\.json|thumb\.jpg)$/.test(file);
  return {
    name: 'lab-artworks',
    apply: 'serve',
    // The studio already holds what it saved; don't hot-reload it away. The
    // works index is invalidated so the next page load sees the new file.
    handleHotUpdate({ file, server }) {
      if (!isSaved(file)) return;
      invalidate(server, [file, path.join(WORKS, 'index.ts')]);
      return [];
    },
    configureServer(server) {
      server.middlewares.use('/__lab/artwork', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { slug, artwork, thumb } = JSON.parse(body);
            if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(slug))
              throw new Error('bad slug');
            if (!artwork || typeof artwork !== 'object')
              throw new Error('bad artwork');
            const dir = path.join(WORKS, slug);
            fs.mkdirSync(dir, { recursive: true });
            const json = path.join(dir, 'artwork.json');
            fs.writeFileSync(json, `${JSON.stringify(artwork, null, 2)}\n`);
            const files = [json, path.join(WORKS, 'index.ts')];
            const m = /^data:image\/jpeg;base64,(.+)$/.exec(thumb ?? '');
            if (m) {
              const jpg = path.join(dir, 'thumb.jpg');
              fs.writeFileSync(jpg, Buffer.from(m[1], 'base64'));
              files.push(jpg);
            }
            invalidate(server, files);
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

const ASSETS = path.resolve(import.meta.dirname, './public/studio-assets');

// Images and videos dropped or pasted into the studio: written to
// `public/studio-assets/<hash>.<ext>` (named by content, so the same file
// lands once) and referenced from artworks by URL. Dev server only.
function studioAssets(): Plugin {
  return {
    name: 'studio-assets',
    apply: 'serve',
    configureServer(server) {
      // Serve new files straight away; Vite's public-folder list only learns
      // of them a moment later, so the first request would 404.
      server.middlewares.use('/studio-assets', (req, res, next) => {
        const name = path.basename(decodeURIComponent(req.url ?? ''));
        const file = path.join(ASSETS, name);
        if (!name || !fs.existsSync(file)) return next();
        const ext = path.extname(name).slice(1).toLowerCase();
        const types: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          webp: 'image/webp',
          avif: 'image/avif',
          svg: 'image/svg+xml',
          mp4: 'video/mp4',
          webm: 'video/webm',
          mov: 'video/quicktime',
        };
        res.setHeader('content-type', types[ext] ?? 'application/octet-stream');
        res.setHeader('accept-ranges', 'bytes');
        // Videos seek with byte ranges.
        const size = fs.statSync(file).size;
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
        if (m) {
          const start = m[1] ? Number(m[1]) : 0;
          const end = m[2] ? Number(m[2]) : size - 1;
          res.statusCode = 206;
          res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
          res.setHeader('content-length', end - start + 1);
          fs.createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader('content-length', size);
          fs.createReadStream(file).pipe(res);
        }
      });
      server.middlewares.use('/__lab/asset', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', async () => {
          try {
            const ext = String(req.headers['x-ext'] ?? '').toLowerCase();
            if (!/^(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov)$/.test(ext))
              throw new Error('unsupported file type');
            const body = Buffer.concat(chunks);
            if (!body.length) throw new Error('empty file');
            const { createHash } = await import('crypto');
            const name = `${createHash('sha1').update(body).digest('hex').slice(0, 16)}.${ext}`;
            fs.mkdirSync(ASSETS, { recursive: true });
            const file = path.join(ASSETS, name);
            if (!fs.existsSync(file)) fs.writeFileSync(file, body);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ url: `/studio-assets/${name}` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    // Generates `src/routeTree.gen.ts` from `src/routes/`; has to run before react.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    imagetools(),
    labPresets(),
    labArtworks(),
    studioAssets(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
