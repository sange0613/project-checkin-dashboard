import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'dashboard-offline',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (mode === 'desktop') return
      const assets = Object.keys(bundle).filter(name => !name.endsWith('.map'))
      const version = Date.now().toString(36)
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify({ name: '项目进度', short_name: '项目进度', start_url: './', scope: './', display: 'standalone', background_color: '#f5f5f4', theme_color: '#f5f5f4', icons: [{ src: './app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] }) })
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'project-dashboard-${version}';
const FILES = ${JSON.stringify(['./', './app-icon.svg', ...assets.map(name => './' + name)])};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('message', event => { if (event.data === 'activate-update') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = (await caches.keys()).filter(name => name.startsWith('project-dashboard-'));
  const keep = names.slice(-2);
  await Promise.all(names.filter(name => name !== CACHE && !keep.includes(name)).map(name => caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('./', { ignoreVary: true }))));
  } else if (url.pathname.includes('/assets/') || url.pathname.endsWith('/app-icon.svg')) {
    event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached => cached || fetch(event.request)));
  }
});` })
    },
  }],
  resolve: {
    alias: {
      '@app-sync': fileURLToPath(new URL(mode === 'desktop' ? './src/hooks/useLocalOnlySync.ts' : './src/hooks/useSuiteSync.ts', import.meta.url)),
    },
  },
  base: process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/',
}))
