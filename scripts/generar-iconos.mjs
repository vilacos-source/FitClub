/**
 * Genera los iconos de la app instalable (el icono del móvil).
 *
 * Por qué un script y no cuatro ficheros sueltos: si algún día cambia el color de
 * la marca o el dibujo, se vuelve a lanzar esto y ya está. Un icono hecho a mano
 * se queda viejo y nadie se entera.
 *
 * Uso:  node scripts/generar-iconos.mjs
 *
 * Dibuja una "F" con TRAZOS, no con texto: así no depende de que el navegador
 * tenga instalada una tipografía concreta — que es la forma habitual de que un
 * icono salga con un cuadradito raro en otra máquina.
 *
 * Tamaños que hacen falta de verdad:
 *   - icon-192 / icon-512 ....... Android (192 es obligatorio para que lo acepte)
 *   - icon-maskable-512 ......... Android recorta el icono en círculo o cuadrado:
 *                                 este lleva el dibujo más pequeño y con margen,
 *                                 para que no lo corte
 *   - apple-touch-icon-180 ...... iPhone/iPad. iOS NO admite transparencia y pone
 *                                 él las esquinas redondeadas, así que va cuadrado
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const SALIDA = 'public/icons';

// La marca, tal como está en la app: degradado índigo → violeta y la F en blanco.
const AZUL = '#4f46e5';
const VIOLETA = '#7c3aed';

/**
 * El dibujo de la F en trazos, sobre un lienzo de 512×512.
 * `escala` sirve para encogerla en la versión recortable.
 */
function dibujoF(escala = 1) {
  // Los trazos van de 196 a 316 en horizontal y de 150 a 362 en vertical: así el
  // dibujo queda centrado de verdad en el lienzo de 512 (centro 256,256).
  const trazos = 'M 196 150 H 316 V 200 H 248 V 240 H 304 V 288 H 248 V 362 H 196 Z';
  const centro = 256;
  const transformar = escala === 1 ? '' : `transform="translate(${centro} ${centro}) scale(${escala}) translate(${-centro} ${-centro})"`;
  return `<path d="${trazos}" fill="#ffffff" ${transformar}/>`;
}

function svg(tam, { esquinas = 0, escalaF = 1 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="marca" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${AZUL}"/>
      <stop offset="1" stop-color="${VIOLETA}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="${esquinas}" fill="url(#marca)"/>
  ${dibujoF(escalaF)}
</svg>`;
}

const PIEZAS = [
  // Android: cuadradas y a sangre (el sistema les pone la forma que quiera).
  { fichero: 'icon-192.png', tam: 192, esquinas: 0, escalaF: 1 },
  { fichero: 'icon-512.png', tam: 512, esquinas: 0, escalaF: 1 },
  // Recortable: el dibujo cabe dentro del círculo que el sistema recorta. La zona
  // segura es el 80% central, así que la F se queda al 85%: dentro con margen,
  // pero sin quedar diminuta (al 62% se veía ridícula tras el recorte).
  { fichero: 'icon-maskable-512.png', tam: 512, esquinas: 0, escalaF: 0.85 },
  // iPhone: sin transparencia, sin esquinas (las pone iOS).
  { fichero: 'apple-touch-icon-180.png', tam: 180, esquinas: 0, escalaF: 1 },
];

mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const pagina = await navegador.newPage();

for (const pieza of PIEZAS) {
  await pagina.setViewportSize({ width: pieza.tam, height: pieza.tam });
  await pagina.setContent(
    `<html><body style="margin:0;padding:0">${svg(pieza.tam, pieza)}</body></html>`,
  );
  const destino = `${SALIDA}/${pieza.fichero}`;
  await pagina.screenshot({ path: destino });
  console.log(`  ${destino}  (${pieza.tam}×${pieza.tam})`);
}

await navegador.close();

// Un fichero de texto para que el script sea re-ejecutable sin reescribirlo a mano.
writeFileSync(`${SALIDA}/LEEME.txt`, `Iconos generados con: node scripts/generar-iconos.mjs
No editar a mano: cambia el script y vuelve a lanzarlo.
Marca: degradado ${AZUL} → ${VIOLETA} con una F blanca.
`);

console.log('\nListo. Los iconos están en', SALIDA);
