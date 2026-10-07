import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import { iniciarApp } from './app-movil';

// Dentro de la app del móvil (#218): atrás, enlaces, descargas…
iniciarApp();

// Si estando dentro una petición dice «no autenticado», la sesión ha caducado
// (#366): se avisa a la App para que lo diga y lleve a entrar, en vez de que cada
// pantalla muestre su error. /api/me, el login y el logout no cuentan: ahí un 401
// es lo normal cuando no se ha entrado.
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (...args) => {
  const r = await fetchOriginal(...args);
  if (r.status === 401) {
    const url = String(args[0]?.url || args[0] || '');
    const ruta = url.replace(window.location.origin, '');
    if (ruta.startsWith('/api/') && !/^\/api\/(me(\?|$)|login|logout|register|auth|password)/.test(ruta)) {
      window.dispatchEvent(new CustomEvent('aim-sesion-caducada'));
    }
  }
  return r;
};

createRoot(document.getElementById('root')).render(<App />);
