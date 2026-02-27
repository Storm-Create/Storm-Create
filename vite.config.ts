import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Determine base path based on environment or default to root
  // For GitHub Pages, this should be the repository name (e.g., '/storm-create/')
  // We use process.env.BASE_URL if provided, otherwise '/'
  const base = process.env.BASE_URL || '/';

  return {
    base: base,
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin.html'),
          blog: path.resolve(__dirname, 'blog.html'),
          post: path.resolve(__dirname, 'post.html'),
          tariffs: path.resolve(__dirname, 'tariffs.html'),
        },
      },
    },
  };
});
