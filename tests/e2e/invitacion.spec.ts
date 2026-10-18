import { test, expect } from '@playwright/test';

/**
 * El texto de la invitación por WhatsApp.
 *
 * Los dos fallos posibles de este texto son invisibles a simple vista:
 *
 *  1. Que el mensaje pierda una línea (o el enlace) y se mande a medio escribir.
 *  2. Que el cambio no llegue a publicarse y Elena siga mandando el viejo.
 *
 * Aquí se cubren los dos: **W1** ancla el texto EXACTO que Elena aprobó y **W2**
 * comprueba que el enlace sigue cerrándolo, porque sin enlace la invitación no
 * sirve para nada.
 *
 * Lo que NO cubre: pulsar el botón (hace falta una cuenta de administrador, eso
 * es el test S13, que se salta sin credenciales). Esto comprueba lo publicado.
 */

const APP_URL = process.env.BASE_URL || 'https://vilacos-source.github.io/FitClub/';

// El texto aprobado por Elena, literal. Si algún día lo cambia, hay que
// actualizarlo AQUÍ a propósito: que falle es justo el objetivo, para que
// cambiar el mensaje sea una decisión y no un descuido.
const LINEA_1 = '¡Te invito al Reto FitClub! 🏆';
const LINEA_2 = 'Regístrate y a por todas. Tu esfuerzo tiene premio.';

/**
 * Descarga el fichero de la aplicación que sirve la web publicada.
 *
 * Con la guarda de tamaño a propósito: si la descarga viniera vacía o fuera un
 * 404 con HTML, las comprobaciones de dentro darían un verde que no significa
 * nada (el error clásico de un test que no encuentra lo que busca).
 */
async function bundlePublicado(request: import('@playwright/test').APIRequestContext) {
  const html = await (await request.get(APP_URL)).text();
  const encontrado = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  expect(encontrado, 'No se encontró el fichero de la aplicación en el HTML publicado').not.toBeNull();

  const respuesta = await request.get(new URL(encontrado![0], APP_URL).toString());
  expect(respuesta.status(), 'El fichero de la aplicación publicado no responde').toBe(200);
  const codigo = await respuesta.text();
  expect(codigo.length, 'El fichero descargado está vacío: no es la aplicación publicada').toBeGreaterThan(10_000);
  return codigo;
}

test('W1 - el texto de la invitación publicado es exactamente el aprobado', async ({ request }) => {
  const codigo = await bundlePublicado(request);

  expect(codigo, `Falta la primera línea del mensaje: «${LINEA_1}»`).toContain(LINEA_1);
  expect(
    codigo,
    `Falta (o ha cambiado) la segunda línea: «${LINEA_2}». ` +
      'Si el cambio es a propósito, actualízala en este test.',
  ).toContain(LINEA_2);
});

test('W2 - la invitación sigue llevando el enlace al final', async ({ request }) => {
  const codigo = await bundlePublicado(request);

  // El botón construye el mensaje y lo abre en WhatsApp. Si desapareciera esta
  // plantilla, el botón dejaría de funcionar sin que se viera nada roto.
  expect(codigo, 'El botón de WhatsApp ha perdido su enlace de wa.me').toContain('https://wa.me/?text=');
  // El enlace de la app se calcula en vivo, así que lo que se puede comprobar en
  // el fichero es que sigue añadiéndose a partir de la dirección de la página.
  expect(
    codigo,
    'El mensaje parece haber perdido el enlace de la app (ya no se calcula desde la dirección de la página)',
  ).toContain('location.origin');
});
