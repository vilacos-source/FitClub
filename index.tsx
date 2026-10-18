
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { vigilarVersion } from './services/versionCheck';

// Recarga la app sola si hay una versión nueva publicada. Evita la pantalla en
// blanco por caché: GitHub Pages borra los assets del despliegue anterior.
vigilarVersion();

// La app instalable (icono en el móvil, sin barra del navegador).
//
// Android necesita que exista este fichero para dejar instalar la app con su
// icono propio; si no, crea un marcador con icono genérico y CON barra. Ver
// public/sw.js, que explica por qué NO guarda nada en caché.
//
// La ruta sale de `BASE_URL` para que funcione igual en la web real (/FitClub/) y
// en la vista previa (/FitClub/preview/), sin tocar nada.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Si no se puede registrar, la app funciona igual: lo único que pasa es que
      // no se podrá instalar con su icono. No merece molestar a nadie con un aviso.
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
