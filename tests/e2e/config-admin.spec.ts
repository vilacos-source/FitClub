import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * El email de administrador está escrito en DOS sitios:
 *
 *   - `App.tsx`          → `ADMIN_EMAILS`: decide qué perfil se marca como admin
 *                          al registrarse (y por tanto si se ve el panel).
 *   - `firestore.rules`  → `adminEmails()`: decide quién puede escribir de verdad
 *                          en la base de datos. Esta es la que manda.
 *
 * Si se desajustan, no falla nada de forma visible: pasan cosas raras y difíciles
 * de diagnosticar. Los dos casos posibles son malos por igual:
 *
 *   - Email en la app pero NO en las reglas → el panel se abre y no deja guardar
 *     nada ("Missing or insufficient permissions").
 *   - Email en las reglas pero NO en la app → alguien es admin en la base de datos
 *     y la app no le enseña el panel.
 *
 * Y hay un tercer caso, peor: si alguien cambia el formato de una de las dos
 * listas, una búsqueda ingenua no encuentra nada y las dos quedan "vacías", que
 * comparadas dan iguales. Por eso abajo se comprueba que se han leído de verdad.
 */

const raiz = process.cwd();
const leer = (f: string) => readFileSync(path.join(raiz, f), 'utf8');

/** De `['a@b.c', 'd@e.f']` saca `['a@b.c', 'd@e.f']`. */
const limpiar = (bruto: string): string[] =>
  bruto
    .split(',')
    .map((t) => t.trim().replace(/^['"`]|['"`]$/g, '').trim().toLowerCase())
    .filter((t) => t.length > 0);

/** Lista de admin declarada en el cliente. */
function listasDeLaApp(): string[] {
  const contenido = leer('App.tsx');
  const encontrado = contenido.match(/const\s+ADMIN_EMAILS\s*=\s*\[([^\]]*)\]/s);
  expect(
    encontrado,
    'No se encontró `const ADMIN_EMAILS = [...]` en App.tsx. Si se ha cambiado el ' +
      'formato, hay que actualizar este test (no borrarlo).',
  ).not.toBeNull();
  return limpiar(encontrado![1]);
}

/** Lista de admin que aplican las reglas de Firestore (la que de verdad manda). */
function listasDeLasReglas(): string[] {
  const contenido = leer('firestore.rules');
  const encontrado = contenido.match(/function\s+adminEmails\s*\(\s*\)\s*\{\s*return\s*\[([^\]]*)\]/s);
  expect(
    encontrado,
    'No se encontró `function adminEmails() { return [...] }` en firestore.rules. Si se ' +
      'ha cambiado el formato, hay que actualizar este test (no borrarlo).',
  ).not.toBeNull();
  return limpiar(encontrado![1]);
}

test('C1 - las dos listas de administradores dicen lo mismo', () => {
  const enLaApp = listasDeLaApp();
  const enLasReglas = listasDeLasReglas();

  // GUARDA contra un falso "todo bien": si el formato cambia y la búsqueda no
  // encuentra nada, las dos listas quedarían vacías y comparadas darían iguales.
  expect(
    enLaApp.length,
    'La lista de App.tsx se ha leído VACÍA: o está mal, o ha cambiado el formato. ' +
      'Una lista de admin vacía deja el panel inaccesible.',
  ).toBeGreaterThan(0);
  expect(
    enLasReglas.length,
    'La lista de firestore.rules se ha leído VACÍA: o está mal, o ha cambiado el ' +
      'formato. Una lista vacía dejaría a todo el mundo sin permisos de admin.',
  ).toBeGreaterThan(0);

  // El mensaje de fallo tiene que decir QUÉ email está descolocado y DÓNDE: si no,
  // hay que ir a mirar dos ficheros a mano para averiguarlo.
  const soloEnLaApp = enLaApp.filter((e) => !enLasReglas.includes(e));
  const soloEnLasReglas = enLasReglas.filter((e) => !enLaApp.includes(e));

  expect(
    soloEnLaApp,
    `Estos emails son admin en la APP pero no en las REGLAS (el panel se abriría y no ` +
      `dejaría guardar nada): ${soloEnLaApp.join(', ')}`,
  ).toEqual([]);
  expect(
    soloEnLasReglas,
    `Estos emails son admin en las REGLAS pero no en la APP (tendrían permisos y no ` +
      `verían el panel): ${soloEnLasReglas.join(', ')}`,
  ).toEqual([]);
});

test('C2 - el email de admin se compara sin depender de mayúsculas ni espacios', () => {
  // Firestore compara emails en minúsculas; si la lista llevara mayúsculas, la
  // comparación con `request.auth.token.email` fallaría sin decir por qué.
  for (const email of [...listasDeLaApp(), ...listasDeLasReglas()]) {
    expect(email, `El email "${email}" debería estar en minúsculas`).toBe(email.toLowerCase());
    expect(email.trim(), `El email "${email}" no debería tener espacios`).toBe(email);
    expect(email, `"${email}" no parece un email`).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  }
});
