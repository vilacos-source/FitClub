/**
 * Fichero exigido por Android para poder instalar la app con su icono.
 *
 * POR QUÉ EXISTE ESTE FICHERO, que parece no hacer nada:
 * Chrome en Android NO deja instalar la app con su icono propio si no encuentra
 * uno de estos. Sin él crea un simple marcador: un icono genérico y, además,
 * **abriendo CON la barra del navegador** — justo lo que queremos evitar. iOS no
 * lo necesita; Android sí.
 *
 * NO GUARDA NADA EN CACHÉ, a propósito. Aquí todo se pide a la red como siempre.
 * Guardar copias traería de vuelta el problema que ya nos ha costado dos
 * incidentes (la app en blanco porque el navegador servía ficheros de un
 * despliegue anterior) y rompería la recarga automática cuando se publica una
 * versión nueva. Si algún día se quiere que funcione sin conexión, hay que leer
 * los INC-010/011/012 de TESTING.md ANTES de tocar esto.
 */

// Al instalarse, toma el mando sin esperar a que se cierren las pestañas viejas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

// Un manejador de peticiones vacío: es lo que hace que la app cuente como
// «instalable» para Android. No toca ninguna respuesta.
self.addEventListener('fetch', () => {});
