import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: UI on :5173, API on :2112 (proxied). Production: server serves dist on :2112.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:2112', changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          math: ['katex', 'react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex'],
        },
      },
    },
  },
});
