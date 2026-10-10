/**
 * Recarga la app sola cuando hay una versión nueva publicada.
 *
 * POR QUÉ HACE FALTA
 * GitHub Pages BORRA los assets del despliegue anterior y sirve el index.html
 * con `cache-control: max-age=600`. Un navegador que tenga la versión vieja en
 * caché sigue apuntando a un archivo que ya no existe: pide un 404 y la app se
 * queda en blanco hasta que el usuario limpia la caché o espera 10 minutos.
 * Nos pasó tres veces. Esto lo resuelve sin que el usuario haga nada.
 *
 * CÓMO FUNCIONA
 * Cada compilación escribe `version.json` con un id propio. La app lleva ese id
 * incrustado (`__BUILD_ID__`). Al arrancar, y luego cada pocos minutos o al
 * volver a la pestaña, pide `version.json` saltándose la caché: si el id es
 * distinto del suyo, es que hay una versión nueva y se recarga.
 */

declare const __BUILD_ID__: string;

/** Cada cuánto se comprueba, en milisegundos. */
const INTERVALO_MS = 5 * 60 * 1000;

/** Espera antes de reintentar si el usuario está escribiendo. */
const ESPERA_TECLEANDO_MS = 3 * 1000;

/**
 * Ruta de `version.json` dentro del subpath del despliegue (p. ej. /FitClub/).
 * Se resuelve contra la URL del documento, así que funciona igual en la raíz
 * que en un subpath, sin depender de variables de Vite.
 */
const VERSION_URL = new URL('version.json', document.baseURI).toString();

/**
 * Id de la versión publicada, o `null` si no se pudo saber.
 * Nunca lanza: un fallo aquí no puede afectar a la app.
 */
async function idPublicado(): Promise<string | null> {
  try {
    const respuesta = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    return typeof datos?.buildId === 'string' ? datos.buildId : null;
  } catch {
    return null;
  }
}

/** ¿El usuario está escribiendo ahora mismo? */
function escribiendo(): boolean {
  const activo = document.activeElement;
  return activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement;
}

/** Recarga si hay versión nueva. */
async function comprobar(): Promise<void> {
  if (document.visibilityState !== 'visible') return;

  const publicado = await idPublicado();
  if (!publicado || publicado === __BUILD_ID__) return;

  // No recargamos a mitad de un pesaje: perdería lo que esté tecleando.
  // Se reintenta en unos segundos, cuando suelte el campo.
  if (escribiendo()) {
    setTimeout(comprobar, ESPERA_TECLEANDO_MS);
    return;
  }

  // El parámetro es lo que rompe la caché: sin él, el navegador podría
  // devolvernos otra vez el index.html viejo y no saldríamos nunca.
  const destino = new URL(window.location.href);
  destino.searchParams.set('v', publicado);
  window.location.replace(destino.toString());
}

/** Arranca la vigilancia. Se llama una sola vez, desde el punto de entrada. */
export function vigilarVersion(): void {
  comprobar();
  setInterval(comprobar, INTERVALO_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') comprobar();
  });
}
