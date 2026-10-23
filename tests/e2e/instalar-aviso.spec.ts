import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { detectarPlataforma } from '../../services/instalarApp';

/**
 * Tests del aviso de "instala la app".
 *
 * POR QUÉ IMPORTA: el aviso sale en el MOVIDO donde la gente llega desde el enlace
 * de WhatsApp, y ahí cada plataforma necesita una cosa distinta. Equivocarse no da
 * error: da un aviso que no sirve.
 *
 *   - En **Android** hay que ofrecer el botón, que sí instala.
 *   - En **iPhone** NO existe forma de lanzar la instalación desde la web, así que
 *     ofrecer un botón sería mentir: hay que explicar los dos toques.
 *   - En **Chrome de iPhone** ni siquiera sirve explicarlos: solo instala Safari.
 *
 * Y el aviso no debe salir si la app ya está instalada (se abrió desde el icono).
 */

const raiz = process.cwd();
const leer = (f: string) => readFileSync(path.join(raiz, f), 'utf8');

const AGENTE_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const AGENTE_IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const AGENTE_IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const AGENTE_ORDENADOR =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

test('Y1 - cada móvil recibe el aviso que le sirve', () => {
  const base = { esTactil: true, topeTactil: 5 };

  // Android: botón de instalar (el navegador sí deja).
  expect(detectarPlataforma({ ...base, agente: AGENTE_ANDROID })).toBe('androide');

  // iPhone con Safari: los dos toques a mano. NO un botón: el navegador no permite
  // lanzar la instalación desde la web, y un botón que no hace nada es peor.
  expect(detectarPlataforma({ ...base, agente: AGENTE_IPHONE_SAFARI })).toBe('iphone');

  // iPhone con Chrome: hay que mandarle a Safari, porque instalar desde aquí no se
  // puede de ninguna manera.
  expect(detectarPlataforma({ ...base, agente: AGENTE_IPHONE_CHROME })).toBe(
    'iphone-otro-navegador',
  );

  // Y en un ordenador no se molesta a nadie.
  expect(detectarPlataforma({ agente: AGENTE_ORDENADOR, esTactil: false })).toBe('ordenador');

  // El iPad moderno se anuncia como Mac: si se ignorara, a un iPad no le saldría
  // nunca el aviso y no hay forma de instalar ahí desde Chrome.
  expect(
    detectarPlataforma({
      agente: AGENTE_ORDENADOR,
      esTactil: true,
      plataformaSafari: 'MacIntel',
      topeTactil: 5,
    }),
  ).toBe('iphone');
});

test('Y2 - el aviso está montado donde se ve y pide lo que hace falta', () => {
  const app = leer('App.tsx');
  expect(
    app,
    'El aviso debería estar en la pantalla de quien no tiene sesión (la que se ve ' +
      'al llegar desde el enlace de WhatsApp)',
  ).toContain('<AvisoInstalar');

  const aviso = leer('components/AvisoInstalar.tsx');
  expect(aviso, 'Android necesita el botón que lanza la instalación').toContain(
    'Instalar la app',
  );
  expect(
    aviso,
    'iPhone necesita los dos toques exactos: Compartir y Añadir a pantalla de inicio',
  ).toContain('Añadir a pantalla de inicio');
  expect(
    aviso,
    'Si la app ya está instalada, el aviso no debe salir',
  ).toContain('yaInstalada');
  expect(
    aviso,
    'Si la persona lo cierra, no se le debe volver a insistir en cada visita',
  ).toContain('descartado');
});

test('Y3 - el manifiesto trae la captura y los iconos que Chrome exige', () => {
  const manifiesto = JSON.parse(leer('public/manifest.json'));

  // Sin capturas, Android enseña la barrita pequeña de "añadir" en vez del diálogo
  // grande con la app presentada. Sigue valiendo, pero mucho menos visible.
  expect(
    Array.isArray(manifiesto.screenshots) && manifiesto.screenshots.length > 0,
    'Sin captura de pantalla, Chrome enseña su aviso pequeño en vez del grande',
  ).toBe(true);
  const captura = manifiesto.screenshots[0];
  expect(captura.form_factor).toBe('narrow');
  expect(captura.sizes).toMatch(/^\d+x\d+$/);

  // Y que el fichero de la captura exista de verdad: una captura declarada y no
  // publicada rompe el aviso sin decir nada.
  const ruta = path.join(raiz, 'public', captura.src);
  const bytes = readFileSync(ruta);
  expect(bytes.length, `La captura ${captura.src} está vacía`).toBeGreaterThan(10_000);

  // Lo que Chrome exige para considerarla instalable.
  const tamanos = manifiesto.icons.map((i: { sizes: string }) => i.sizes);
  expect(tamanos, 'Hace falta un icono de 192 px').toContain('192x192');
  expect(tamanos, 'Hace falta un icono de 512 px').toContain('512x512');
  expect(['fullscreen', 'standalone', 'minimal-ui']).toContain(manifiesto.display);
  expect(manifiesto.start_url).toBeTruthy();
  expect(manifiesto.short_name || manifiesto.name).toBeTruthy();
});
