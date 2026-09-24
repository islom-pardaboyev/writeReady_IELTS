import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';

const SHARED_DIR = resolve(__dirname, './api/_lib');
const SHARED_DEV_URL = '/src/__shared__/';
const SHARED_DEV_DIR = join(__dirname, SHARED_DEV_URL);

/**
 * Dev only. `vercel dev` sends every /api/... request to the serverless
 * functions, so the browser could not load the @shared files from Vite at
 * their real address (/api/_lib/bandScore.ts was a 404, and every page that
 * imports @shared failed to open). While developing, they are served from a
 * made-up folder under /src instead, which vercel dev passes to Vite. The
 * build bundles them into the page code as before and never uses this.
 */
function sharedFilesOutsideApi(): Plugin {
  return {
    name: 'writeready:shared-files-outside-api',
    apply: 'serve',
    enforce: 'pre',
    resolveId(source) {
      const path = source.split('?')[0];
      // An @shared import, after the alias below has turned it into a path.
      if (path.startsWith(SHARED_DIR + '/')) {
        const file = /\.[cm]?[jt]s$/.test(path) ? path : `${path}.ts`;
        if (!existsSync(file)) return null;
        return join(SHARED_DEV_DIR, file.slice(SHARED_DIR.length + 1));
      }
      // The browser asking for one of them.
      if (path.startsWith(SHARED_DEV_URL)) return join(__dirname, path);
      if (path.startsWith(SHARED_DEV_DIR)) return path;
      return null;
    },
    async load(id) {
      const path = id.split('?')[0];
      if (!path.startsWith(SHARED_DEV_DIR)) return null;
      const file = join(SHARED_DIR, path.slice(SHARED_DEV_DIR.length));
      this.addWatchFile(file);
      return readFile(file, 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [
    sharedFilesOutsideApi(),
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate': autoUpdate reloads the page the moment a
      // deploy lands, and someone forty minutes into a Task 2 essay would lose
      // the tab out from under them. src/components/ui/UpdatePrompt.tsx asks
      // instead, and waits.
      registerType: 'prompt',
      includeAssets: ['logo.svg', 'logo.png', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        id: '/',
        name: 'WriteReady IELTS — AI Writing Coach',
        short_name: 'WriteReady',
        description:
          'Practice IELTS Writing with instant AI feedback in Uzbek and English. Band scores, grammar corrections and vocabulary upgrades for Task 1 and Task 2.',
        // The landing page, not /dashboard: nothing redirects a signed-out
        // visitor away from the dashboard, so opening the installed app while
        // logged out would land on an empty one.
        start_url: '/',
        scope: '/',
        display: 'standalone',
        lang: 'en',
        categories: ['education'],
        // Same pair index.html sets as <meta name="theme-color">. A manifest
        // cannot vary by colour scheme, so this is the light one.
        theme_color: '#4f46e5',
        background_color: '#f8f9fa',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // vercel.json sends /sw.js with `max-age=0, must-revalidate`. Without
      // that a cached service worker would pin visitors to the deploy they
      // first saw, and UpdatePrompt would never have anything to offer.
      workbox: {
        // Without the denylist every navigation — including the /api/not-found
        // that vercel.json rewrites unknown URLs to — would be answered with a
        // cached index.html, and the API would stop returning real statuses.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Precaching runs for every visitor, not just the ones who install, so
        // it should not spend a student's mobile data on the admin console.
        // These two chunks are ~600 KB together and load from the network on
        // the rare visit that needs them. Vite names a lazy chunk after its
        // module, so renaming those pages means renaming these.
        globIgnores: ['**/AdminPage-*.js', '**/CenterAdminPage-*.js'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Files in api/_lib with no imports, shared by the site and the API.
      '@shared': resolve(__dirname, './api/_lib'),
    },
  },
  build: {
    rollupOptions: {
      external: ['firebase-admin'],
    },
  },
});
