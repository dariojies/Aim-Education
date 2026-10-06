import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    plugins: [react(), {
      // Una marca por compilación: Heroku compila en cada deploy, y el servidor
      // la compara al arrancar para saber que ha llegado uno nuevo (los tickets
      // en «Espera de deploy» pasan entonces solos a «Resuelto»).
      name: 'marca-deploy',
      apply: 'build',
      closeBundle() {
        fs.writeFileSync(path.resolve(__dirname, 'dist/deploy.json'), JSON.stringify({ id: crypto.randomUUID(), fecha: new Date().toISOString() }));
      },
    }],
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
