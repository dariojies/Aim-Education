import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './admin'),
      }
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin/index.html')
        }
      }
    }
  };
});
