#!/usr/bin/env node
/**
 * Vigilante de la web publicada de FitClub.
 *
 * Responde a una pregunta: **¿está la app en pie y sigue cerrada?** Comprueba
 * cuatro cosas que fallan de verdad, no teoría:
 *
 *   1. La web carga y trae el armazón de la app (no una página en blanco).
 *      El bundle y el CSS responden 200 → es el INC-001 (assets 404).
 *   2. Los tres ficheros del despliegue son DEL MISMO despliegue: el `buildId`
 *      que publica `version.json` tiene que estar incrustado en el bundle. Es lo
 *      que caza el INC-013 (dos despliegues compitiendo, sitio a medias o viejo).
 *   3. La base de datos responde y la configuración del reto se puede leer.
 *   4. Las reglas siguen cerradas: la colección privada no se puede listar sin
 *      sesión y la pública no se lee sin entrar. Reutiliza la sonda ya probada
 *      (`scripts/probe-rules.mjs`) en vez de reimplementar las comprobaciones.
 *
 * USO
 *   node scripts/health-check.mjs                → informe completo (CI, a mano)
 *   node scripts/health-check.mjs --silencioso   → calla si todo va bien, y solo
 *                                                  habla si algo falla (patrón
 *                                                  vigilante: para la tarea
 *                                                  programada, que avise solo
 *                                                  cuando haya algo que contar)
 *
 * Sale con código 0 si todo está bien y 1 si algo falla, así que sirve igual en
 * CI (rompe la ejecución) que en una tarea programada.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = process.cwd();
const BASE = (process.env.BASE_URL || process.argv.find((a) => a.startsWith('http')) ||
  'https://vilacos-source.github.io/FitClub/').replace(/\/?$/, '/');
const SILENCIOSO = process.argv.includes('--silencioso');
const ESPERA_MS = 20_000;

/** Texto que tiene que estar en el bundle: si no, no es nuestra app. */
const MARCA_DE_LA_APP = 'FitClub';

const problemas = [];
const correctas = [];

const ok = (texto, detalle = '') => {
  correctas.push(detalle ? `${texto} — ${detalle}` : texto);
};
const fallo = (texto, detalle = '') => {
  problemas.push(detalle ? `${texto} — ${detalle}` : texto);
};

/** Pide una URL y devuelve el texto, o lanza con un motivo corto y claro. */
async function pedir(url) {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS) });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return respuesta.text();
}

// --- 1 y 2: la web, el bundle, el CSS y que sean del mismo despliegue ---------

let bundleUrl = null;
let cssUrl = null;
let buildId = null;

try {
  const html = await pedir(BASE);

  if (!/<div id="root">/i.test(html)) {
    fallo('La web carga pero no trae el armazón de la app', 'falta <div id="root">');
  } else {
    ok('La web carga y trae el armazón de la app');
  }

  const bundle = html.match(/src="([^"]*assets\/index-[^"]*\.js)"/i);
  const css = html.match(/href="([^"]*assets\/index-[^"]*\.css)"/i);
  if (!bundle) fallo('El HTML no referencia ningún bundle', '¿despliegue incompleto?');
  if (!css) fallo('El HTML no referencia ninguna hoja de estilos');
  bundleUrl = bundle ? new URL(bundle[1], BASE).toString() : null;
  cssUrl = css ? new URL(css[1], BASE).toString() : null;
} catch (e) {
  fallo('La web no responde', e.message);
}

// El bundle es el que más importa: si da 404, la app se queda EN BLANCO para todo
// el grupo aunque el HTML cargue. Es exactamente el INC-001.
let contenidoBundle = null;
if (bundleUrl) {
  try {
    contenidoBundle = await pedir(bundleUrl);
    if (!contenidoBundle.includes(MARCA_DE_LA_APP)) {
      fallo('El bundle carga pero no parece de esta app', `no contiene "${MARCA_DE_LA_APP}"`);
    } else {
      ok('El bundle responde y es el de la app', `${Math.round(contenidoBundle.length / 1024)} KB`);
    }
  } catch (e) {
    fallo('El bundle NO responde', `${e.message} — la app se quedaría en blanco para todos`);
  }
}

if (cssUrl) {
  try {
    await pedir(cssUrl);
    ok('La hoja de estilos responde');
  } catch (e) {
    fallo('La hoja de estilos NO responde', e.message);
  }
}

// La comprobación que caza un despliegue a medias o viejo (INC-013): el id que
// anuncia `version.json` TIENE que estar dentro del bundle servido. Si no, el
// HTML y el bundle no son del mismo despliegue.
try {
  const version = JSON.parse(await pedir(new URL('version.json', BASE).toString()));
  buildId = typeof version?.buildId === 'string' ? version.buildId : null;
  if (!buildId) {
    fallo('version.json no trae un buildId válido');
  } else if (contenidoBundle && !contenidoBundle.includes(buildId)) {
    fallo(
      'El despliegue está descuadrado',
      `version.json dice "${buildId}" y el bundle no lo lleva: hay ficheros de dos despliegues distintos`,
    );
  } else if (contenidoBundle) {
    ok('Los ficheros publicados son del mismo despliegue', `buildId ${buildId}`);
  }
} catch (e) {
  fallo('No se pudo leer version.json', e.message);
}

// --- 3: la base de datos responde y la configuración del reto está -----------

try {
  const config = JSON.parse(readFileSync(path.join(RAIZ, 'firebase-applet-config.json'), 'utf8'));
  const url =
    `https://firestore.googleapis.com/v1/projects/${config.projectId}` +
    `/databases/${config.firestoreDatabaseId}/documents/settings/competition?key=${config.apiKey}`;
  const documento = JSON.parse(await pedir(url));
  const campos = documento?.fields ?? {};
  if (!campos.startDate || !campos.endDate) {
    fallo('La configuración del reto existe pero no tiene fechas', Object.keys(campos).join(', '));
  } else {
    ok('La base de datos responde y la configuración del reto se puede leer');
  }
} catch (e) {
  fallo('No se pudo leer la configuración del reto', e.message);
}

// --- 4: las reglas siguen cerradas ------------------------------------------

const sonda = spawnSync(process.execPath, ['scripts/probe-rules.mjs'], {
  cwd: RAIZ,
  encoding: 'utf8',
  timeout: 120_000,
});
if (sonda.status === 0) {
  ok('Las reglas siguen cerradas (privada sin listar, pública necesita sesión)');
} else {
  const salida = `${sonda.stdout ?? ''}${sonda.stderr ?? ''}`;
  const fallosDeLaSonda = salida
    .split('\n')
    .filter((l) => /FALLA|no se pudo|deber[ií]a/i.test(l))
    .slice(0, 4)
    .join(' | ');
  fallo(
    'LA SONDA DE REGLAS FALLA',
    fallosDeLaSonda || `código ${sonda.status}${sonda.error ? ` (${sonda.error.message})` : ''}`,
  );
}

// --- Informe ----------------------------------------------------------------

const hayProblemas = problemas.length > 0;

if (!SILENCIOSO) {
  console.log(`Vigilante de FitClub — ${BASE}`);
  console.log(`buildId: ${buildId ?? '(no se pudo leer)'}\n`);
  for (const c of correctas) console.log(`  OK    ${c}`);
  for (const p of problemas) console.log(`  FALLA ${p}`);
  console.log(
    `\n${correctas.length} correctas, ${problemas.length} fallos → ${hayProblemas ? 'HAY PROBLEMAS' : 'todo en orden'}`,
  );
  if (hayProblemas) {
    console.log('\nComprueba a mano: https://github.com/vilacos-source/FitClub/actions');
  }
} else if (hayProblemas) {
  // Con --silencioso solo se imprime si hay algo que contar: así la tarea
  // programada no manda un mensaje cada vez que va bien.
  console.log('⚠️ FitClub: algo va mal en la web publicada\n');
  for (const p of problemas) console.log(`• ${p}`);
  console.log(`\n${correctas.length} comprobaciones correctas, ${problemas.length} con problemas.`);
  console.log(`Web: ${BASE}`);
  console.log('Comprueba a mano: https://github.com/vilacos-source/FitClub/actions');
}

process.exit(hayProblemas ? 1 : 0);
