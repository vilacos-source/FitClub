import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Identificador único de esta compilación. Cambia en cada despliegue.
    const buildId = process.env.VITE_BUILD_ID || Date.now().toString(36);

    // Escribe `version.json` en el build. La app lo consulta al arrancar y cada
    // pocos minutos; si el id no es el suyo, se recarga sola.
    //
    // Hace falta porque GitHub Pages BORRA los assets del despliegue anterior y
    // sirve el index.html con 10 minutos de caché: un navegador que tenga la
    // versión vieja en caché pide un archivo que ya no existe y se queda en
    // blanco. Con esto se sale solo, sin que el usuario haga nada.
    const emitVersion = (): Plugin => ({
      name: 'emit-version',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId }),
        });
      },
    });

    return {
      base: env.VITE_BASE_PATH || '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
        emitVersion(),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__BUILD_ID__': JSON.stringify(buildId)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
