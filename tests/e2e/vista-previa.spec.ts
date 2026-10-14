import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { marcar } from '../../scripts/marcar-vista-previa.mjs';

/**
 * Tests de la marca de VISTA PREVIA.
 *
 * Lo que se protege aquí no es un adorno: es que se pueda saber **de un vistazo**
 * qué versión se está mirando. Sin marca, se acaba diciendo «ya está arreglado»
 * cuando solo estaba arreglado en el borrador. Y al revés: si la marca se colara
 * en la versión real, el grupo vería el aviso.
 */

const HTML_REAL = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>FitClub</title>
  <script type="module" crossorigin src="/FitClub/assets/index-Ct2.js"></script>
  <link rel="stylesheet" crossorigin href="/FitClub/assets/index-DAyS.css">
</head>
<body>
    <div id="root"></div>
</body>
</html>`;

test('V1 - el aviso, el noindex, el título y el hueco para la cabecera', () => {
  const salida = marcar(HTML_REAL);

  // 1. El aviso, con su texto y su id
  expect(salida).toContain('id="aviso-vista-previa"');
  expect(salida).toContain('VISTA PREVIA');
  expect(salida).toContain('esto NO es lo que ve el grupo');

  // 2. Que no lo listen los buscadores. (No la hace privada: solo evita Google.)
  expect(salida).toContain('<meta name="robots" content="noindex, nofollow">');

  // 3. El título, para distinguirla en la pestaña
  expect(salida).toContain('<title>FitClub · VISTA PREVIA</title>');

  // 4. El hueco arriba, para que el aviso no tape la app
  expect(salida).toContain('padding-top:30px');

  // 5. Y la cabecera desplazada: es `sticky; top: 0`, así que sin esto se pegaría
  //    al borde y quedaría detrás del aviso — justo la parte que hay que juzgar.
  expect(salida).toContain('header { top: 30px !important; }');

  // El aviso va al principio del body, no al final.
  expect(salida.indexOf('aviso-vista-previa')).toBeLessThan(salida.indexOf('<div id="root">'));
});

test('V2 - no rompe la app: sobrevive todo lo que había', () => {
  const salida = marcar(HTML_REAL);

  // El armazón y los assets tienen que seguir intactos: una vista previa que se
  // come el bundle no se puede juzgar, y el fallo sería del marcador, no de la app.
  expect(salida).toContain('<div id="root"></div>');
  expect(salida).toContain('src="/FitClub/assets/index-Ct2.js"');
  expect(salida).toContain('href="/FitClub/assets/index-DAyS.css"');
  expect(salida).toContain('<meta charset="UTF-8">');
  expect(salida).toContain('<html lang="es">');
  // Y sigue siendo un HTML de una sola etiqueta html/body (no se ha duplicado).
  expect(salida.match(/<html/gi)).toHaveLength(1);
  expect(salida.match(/<body/gi)).toHaveLength(1);
});

test('V3 - aplicarla dos veces no duplica nada', () => {
  // El paso de CI podría ejecutarse dos veces (un reintento, por ejemplo): si
  // duplicara el aviso, se verían dos barras.
  const una = marcar(HTML_REAL);
  const dos = marcar(una);
  expect(dos).toBe(una);
  expect(dos.match(/aviso-vista-previa/g)).toHaveLength(1);
  expect(dos.match(/noindex/g)).toHaveLength(1);
});

test('V4 - sin <body> falla en vez de servir una vista previa sin marcar', () => {
  // Antes que servir una vista previa indistinguible de la real, que se rompa el
  // despliegue: el error se ve, la confusión no.
  expect(() => marcar('<html><head><title>x</title></head></html>')).toThrow(/no tiene <body>/);
});

test('V5 - en el navegador el aviso se ve de verdad, arriba y a lo ancho', async ({ page }) => {
  // Un test que solo mira el texto del HTML no detecta un aviso invisible (por
  // ejemplo, posicionado fuera de la pantalla). Aquí se renderiza y se mide.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(marcar(HTML_REAL));

  const aviso = page.locator('#aviso-vista-previa');
  await expect(aviso).toBeVisible();
  await expect(aviso).toHaveText(/VISTA PREVIA/);

  const caja = await aviso.boundingBox();
  if (!caja) throw new Error('El aviso debería ocupar sitio en la pantalla');
  expect(Math.round(caja.y), 'Debería estar pegado al borde de arriba').toBe(0);
  expect(Math.round(caja.width), 'Debería ocupar todo el ancho (móvil de 390)').toBe(390);
  expect(caja.height, 'Ni una línea fina invisible ni un bloque enorme').toBeGreaterThan(20);
  expect(caja.height).toBeLessThan(50);

  // Y el hueco de arriba existe: el aviso no está tapando la app.
  const relleno = await page.evaluate(() => getComputedStyle(document.body).paddingTop);
  expect(relleno).toBe('30px');
});

test('V6 - la versión real NO lleva la marca', () => {
  // La versión real se sirve desde `dist/index.html`, que se compila sin pasar por
  // el marcador. Si alguien metiera la marca en el HTML base de la app, el grupo
  // vería el aviso ámbar en la web de verdad.
  const base = readFileSync('index.html', 'utf8');
  expect(base, 'El index.html de la app no puede llevar la marca de vista previa').not.toContain(
    'aviso-vista-previa',
  );
  expect(base).not.toContain('VISTA PREVIA');
});
