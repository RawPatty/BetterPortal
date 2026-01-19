import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import { copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    svelte(),
    crx({ manifest }),
    {
      name: 'copy-license',
      closeBundle() {
        // Copy LICENSE to dist after build
        try {
          copyFileSync('LICENSE', 'dist/LICENSE');
          console.log('LICENSE copied to dist/');
        } catch (err) {
          console.warn('Could not copy LICENSE:', err);
        }
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
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
