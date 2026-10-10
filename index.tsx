
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { vigilarVersion } from './services/versionCheck';

// Recarga la app sola si hay una versión nueva publicada. Evita la pantalla en
// blanco por caché: GitHub Pages borra los assets del despliegue anterior.
vigilarVersion();

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
