import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'eft-standalone-build-marker',
    generateBundle() {
      if (process.env.VITE_EFT_STANDALONE === 'true') this.emitFile({ type: 'asset', fileName: 'standalone-build.json', source: JSON.stringify({ standalone: true }) });
    },
  }],
  base: './',
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_EFT_API_PROXY_TARGET || 'https://eftsip.ru',
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: '',
      },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        react: resolve(import.meta.dirname, 'react.html'),
        legacy: resolve(import.meta.dirname, 'legacy-v45.html'),
        questionnaire: resolve(import.meta.dirname, 'EFT_client_questionnaire.html')
      }
    }
  }
});
