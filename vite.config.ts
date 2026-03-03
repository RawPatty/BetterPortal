import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import webExtension from '@samrum/vite-plugin-web-extension';
import { readFileSync, copyFileSync, mkdirSync } from 'fs';

const target = process.env.TARGET || 'chrome';
const outDir = target === 'firefox' ? 'dist-firefox' : 'dist';
const manifestPath =
  target === 'firefox' ? './src/manifest.firefox.json' : './src/manifest.chrome.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

export default defineConfig({
  plugins: [
    svelte(),
    webExtension({ manifest }),
    {
      name: 'copy-static-assets',
      closeBundle() {
        try {
          copyFileSync('LICENSE', `${outDir}/LICENSE`);
        } catch {
          // LICENSE may not exist
        }
        try {
          mkdirSync(`${outDir}/src/icons`, { recursive: true });
          for (const size of ['16', '48', '128']) {
            copyFileSync(`src/icons/icon${size}.png`, `${outDir}/src/icons/icon${size}.png`);
          }
        } catch (err) {
          console.warn('Could not copy icons:', err);
        }
      },
    },
  ],
  build: {
    outDir,
    rollupOptions: {
      input: {
        settings: 'src/settings/index.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
