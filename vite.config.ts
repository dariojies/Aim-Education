import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
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
        // El commit que se publica, para el registro de «Cambios» (#397). Heroku lo
        // da al compilar (SOURCE_VERSION); en local, el de git. Este archivo es
        // público: aquí solo va el hash, nunca mensajes ni notas.
        let commit = process.env.SOURCE_VERSION || null;
        if (!commit) {
          try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null; } catch { commit = null; }
        }
        fs.writeFileSync(path.resolve(__dirname, 'dist/deploy.json'), JSON.stringify({ id: crypto.randomUUID(), fecha: new Date().toISOString(), commit }));
      },
    }],
    // La app del móvil (movil/, #218) tiene sus propios proyectos de Android e
    // iOS: que el servidor de desarrollo no los mire.
    optimizeDeps: { entries: ['index.html'] },
    server: {
      watch: { ignored: ['**/movil/**'] },
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
