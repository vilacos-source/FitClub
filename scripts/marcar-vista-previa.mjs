#!/usr/bin/env node
/**
 * Marca un build como VISTA PREVIA.
 *
 * POR QUÉ EXISTE: la vista previa vive en la misma web, un piso más abajo
 * (`/FitClub/preview/`). Sin una marca clara, es imposible saber de un vistazo si
 * estás mirando lo que ve el grupo o una copia en pruebas — y confundirlas lleva
 * a «ya está arreglado» cuando solo estaba arreglado en el borrador.
 *
 * QUÉ HACE sobre el `index.html` del build de la vista previa:
 *   1. Un aviso fijo arriba, ámbar: se ve SIEMPRE, también cuando la app está
 *      rota o en blanco (que es justo cuando más importa saber qué versión miras).
 *   2. `<meta name="robots" content="noindex">`: que los buscadores no listen un
 *      borrador a medias. Ojo: esto solo evita que salga en Google. NO hace la
 *      vista previa privada: quien tenga la dirección puede abrirla.
 *   3. El título, para distinguirla en la pestaña y en el historial del móvil.
 *   4. Desplaza la cabecera de la app hacia abajo, para que el aviso no tape nada
 *      y se pueda juzgar la pantalla de verdad.
 *
 * Uso:  node scripts/marcar-vista-previa.mjs <carpeta-del-build>
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Marca para saber si ya está aplicada (evita duplicar el aviso). */
const SENAL = 'id="aviso-vista-previa"';

/** Alto del aviso, en píxeles. Tiene que coincidir con el `padding-top`. */
const ALTO = 30;

/** Nombre con el que se guarda la app instalada desde la vista previa. */
export const NOMBRE_VISTA = 'FitClub Test';

const AVISO = `
    <!-- Aviso de vista previa: añadido por scripts/marcar-vista-previa.mjs -->
    <style>
      /* La cabecera de la app es \`sticky; top: 0\`. Sin esto se pegaría al borde
         y quedaría debajo del aviso, justo la parte que no se podría juzgar. */
      header { top: ${ALTO}px !important; }
    </style>
    <div id="aviso-vista-previa" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#f59e0b;color:#1f2937;font:600 13px/1.5 system-ui,-apple-system,sans-serif;text-align:center;padding:6px 8px;box-shadow:0 2px 8px rgba(0,0,0,.3)">
      VISTA PREVIA · esto NO es lo que ve el grupo
    </div>`;

/**
 * Aplica la marca al `index.html` de la carpeta dada.
 * Devuelve el mismo texto si ya estaba aplicada (se puede llamar dos veces).
 */
export function marcar(html) {
  if (html.includes(SENAL)) return html;

  let salida = html;

  // El aviso, justo al abrir el body, y el hueco para que no tape la app.
  if (/<body[^>]*>/i.test(salida)) {
    salida = salida.replace(/(<body[^>]*>)/i, `$1${AVISO}`);
  } else {
    // Sin <body> no se puede colocar donde toca; mejor fallar que servir una vista
    // previa sin marca (nadie sabría qué versión está mirando).
    throw new Error('El HTML no tiene <body>: no se puede marcar la vista previa.');
  }

  salida = salida.replace(
    /<body([^>]*)>/i,
    `<body$1 style="padding-top:${ALTO}px">`,
  );

  // Que no acabe listada en un buscador.
  if (/<\/head>/i.test(salida)) {
    salida = salida.replace(
      /<\/head>/i,
      '  <meta name="robots" content="noindex, nofollow">\n</head>',
    );
  }

  salida = salida.replace(/<title>([^<]*)<\/title>/i, '<title>$1 · VISTA PREVIA</title>');

  return salida;
}

/**
 * Marca el manifiesto de la vista previa.
 *
 * Android e iOS guardan el nombre y los iconos **al instalar**, y no los
 * actualizan solos. Si las dos versiones se llamaran igual, en el móvil quedarían
 * dos iconos idénticos y no habría forma de saber cuál es el de pruebas — que es
 * exactamente el error que este mecanismo existe para evitar.
 *
 * El resto del manifiesto NO se toca: usa rutas relativas, así que el mismo
 * fichero vale igual un piso más abajo.
 */
export function marcarManifiesto(texto, nombre = NOMBRE_VISTA) {
  const datos = JSON.parse(texto);
  datos.name = nombre;
  datos.short_name = nombre;
  return JSON.stringify(datos, null, 2) + '\n';
}

/** Marca el `index.html` de la carpeta indicada. */
export function marcarCarpeta(carpeta) {
  const fichero = path.join(carpeta, 'index.html');
  const antes = readFileSync(fichero, 'utf8');
  const despues = marcar(antes);
  writeFileSync(fichero, despues);

  // El manifiesto tiene que estar: es lo que hace que la app se pueda instalar
  // con su icono. Si falta, la vista previa no se parecería a lo que se publica
  // justo en la parte que estamos probando, así que aquí se para.
  const ficheroManifiesto = path.join(carpeta, 'manifest.json');
  if (!existsSync(ficheroManifiesto)) {
    throw new Error(
      `No hay manifest.json en ${carpeta}: la vista previa no se podría instalar con su icono.`,
    );
  }
  writeFileSync(ficheroManifiesto, marcarManifiesto(readFileSync(ficheroManifiesto, 'utf8')));

  return { fichero, cambiado: antes !== despues };
}

// Solo hace algo si se ejecuta directamente (no al importarlo desde un test).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const carpeta = process.argv[2];
  if (!carpeta) {
    console.error('Falta la carpeta del build. Uso: node scripts/marcar-vista-previa.mjs <carpeta>');
    process.exit(2);
  }
  const { fichero, cambiado } = marcarCarpeta(carpeta);
  console.log(cambiado ? `Vista previa marcada en ${fichero}` : `${fichero} ya estaba marcado`);
}
