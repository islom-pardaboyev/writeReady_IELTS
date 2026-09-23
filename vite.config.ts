import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
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
