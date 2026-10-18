import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { marcarManifiesto, NOMBRE_VISTA } from '../../scripts/marcar-vista-previa.mjs';

/**
 * Tests de la app INSTALABLE (el icono en el móvil y sin barra del navegador).
 *
 * Estos fallos son **silenciosos**, que es lo que los hace peligrosos: si un icono
 * o una ruta está mal, no sale ningún error en ninguna parte — simplemente el móvil
 * no ofrece instalar la app, o la instala con un icono genérico y con la barra.
 * Nadie se enteraría hasta verlo en un teléfono. Por eso se comprueba fichero a
 * fichero, y por eso los iconos se DESCARGAN en vez de dar por hecho que están.
 */

const APP_URL = process.env.BASE_URL || 'https://vilacos-source.github.io/FitClub/';

test('X1 - el manifiesto publicado es válido y sus iconos se pueden descargar', async ({ request }) => {
  const respuesta = await request.get(new URL('manifest.json', APP_URL).toString());
  expect(respuesta.status(), 'El manifiesto publicado no responde').toBe(200);

  // Si no fuera JSON válido, esta línea ya falla con el motivo.
  const manifiesto = await respuesta.json();

  expect(
    manifiesto.display,
    'Falta «display: standalone»: la app se abriría CON la barra del navegador',
  ).toBe('standalone');
  expect(manifiesto.name, 'El manifiesto no tiene nombre').toBeTruthy();
  expect(manifiesto.start_url, 'El manifiesto no dice dónde tiene que empezar la app').toBeTruthy();

  const iconos: Array<{ src: string; sizes?: string }> = manifiesto.icons ?? [];
  expect(
    iconos.length,
    'El manifiesto no declara ningún icono: el móvil pondría uno genérico',
  ).toBeGreaterThan(0);

  // Que los declare no basta: hay que comprobar que cada uno DESCARGA. Un nombre
  // de fichero mal escrito no da ningún error, solo un icono que no aparece.
  for (const icono of iconos) {
    const url = new URL(icono.src, new URL('manifest.json', APP_URL)).toString();
    const descarga = await request.get(url);
    expect(descarga.status(), `El icono «${icono.src}» del manifiesto no se puede descargar`).toBe(200);
    const bytes = await descarga.body();
    expect(bytes.length, `El icono «${icono.src}» está vacío`).toBeGreaterThan(1000);
  }

  // El de 192 es el que Android exige para dejar instalarse la app.
  expect(
    iconos.some((i) => (i.sizes ?? '').includes('192')),
    'Falta el icono de 192×192, que es el que Android exige',
  ).toBe(true);
});

test('X2 - el HTML trae lo que hace falta para que no salga la barra (sobre todo en iPhone)', async ({ request }) => {
  const html = await (await request.get(APP_URL)).text();

  expect(html, 'El HTML no enlaza el manifiesto').toContain('rel="manifest"');

  // En iPhone estas dos son las que consiguen que se abra SIN la barra de Safari:
  // sin ellas, al abrir desde el icono sigue apareciendo el navegador.
  expect(
    html,
    'Falta «apple-mobile-web-app-capable»: en iPhone seguiría saliendo la barra del navegador',
  ).toContain('apple-mobile-web-app-capable');
  expect(html, 'Falta el icono para iPhone (apple-touch-icon)').toContain('apple-touch-icon');
  expect(html, 'Falta el color de la barra del sistema (theme-color)').toContain('theme-color');

  const encontrado = html.match(/href="([^"]*apple-touch[^"]*)"/);
  expect(encontrado, 'No se encontró la dirección del icono de iPhone en el HTML').not.toBeNull();
  const descarga = await request.get(new URL(encontrado![1], APP_URL).toString());
  expect(descarga.status(), 'El icono de iPhone no se puede descargar').toBe(200);
});

test('X3 - está el fichero que Android exige para instalar con su icono', async ({ request }) => {
  const respuesta = await request.get(new URL('sw.js', APP_URL).toString());
  expect(
    respuesta.status(),
    'No responde sw.js: en Android la app se instalaría como un simple marcador, ' +
      'con icono genérico y CON la barra del navegador',
  ).toBe(200);

  const codigo = await respuesta.text();
  expect(codigo.length, 'El fichero sw.js está vacío: Android no lo daría por válido').toBeGreaterThan(50);
  expect(
    codigo,
    'A sw.js le falta atender peticiones, que es justo lo que Android exige para dejarse instalar',
  ).toContain("addEventListener('fetch'");
});

test('X4 - la app de la vista previa se llama distinto, para no tener dos iconos iguales', () => {
  const original = readFileSync('public/manifest.json', 'utf8');
  const base = JSON.parse(original);
  const marcado = JSON.parse(marcarManifiesto(original));

  expect(
    marcado.name,
    'La vista previa se llamaría igual que la app real: en el móvil quedarían dos iconos idénticos',
  ).toBe(NOMBRE_VISTA);
  expect(marcado.short_name).toBe(NOMBRE_VISTA);
  expect(base.name, 'La app real no debería llamarse ya «prueba»').not.toBe(NOMBRE_VISTA);

  // Lo que NO debe cambiar al marcar. Si se tocara, la app instalada desde la vista
  // previa abriría en el sitio equivocado o perdería sus iconos.
  expect(marcado.start_url, 'La vista previa ha perdido su punto de partida').toBe(base.start_url);
  expect(marcado.scope, 'La vista previa ha perdido su alcance').toBe(base.scope);
  expect(marcado.display, 'La vista previa ha perdido el «sin barra»').toBe('standalone');
  expect(marcado.icons, 'La vista previa ha perdido sus iconos').toEqual(base.icons);
});
