import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PESO_MAXIMO,
  PESO_MINIMO,
  aNumero,
  planDeReinicio,
  problemaConElPeso,
} from '../../services/resetMember';

/**
 * Tests de "empezar de cero" con un participante (cambio de periodo).
 *
 * POR QUÉ IMPORTA: esto BORRA pesajes de verdad y no se puede deshacer. Un fallo
 * aquí no da error: da datos mal, en silencio. Los dos modos de fallo que se
 * cubren son:
 *
 *   - que borre de más (el nombre, el avatar, su alta en el reto) → la persona
 *     desaparece o queda tocada sin que nadie lo pida;
 *   - que borre de menos o a medias (cero pesajes pero los puntos viejos) → el
 *     ranking miente y no se ve a simple vista.
 *
 * Los tres primeros tests NO usan navegador: prueban la lógica que decide qué se
 * escribe. El de la pantalla comprueba que las piezas están conectadas y que la
 * escritura es atómica, que es lo que evita el estado a medias.
 */

const raiz = process.cwd();
const leer = (f: string) => readFileSync(path.join(raiz, f), 'utf8');

test('R1 - empezar de cero borra lo que tiene que borrar y NO toca nada más', () => {
  const plan = planDeReinicio(82.4);

  // Se va el historial y se ponen los totales a cero…
  expect(plan.privado.history, 'El historial debería quedar vacío').toEqual([]);
  expect(plan.publico).toEqual({
    initialWeight: 82.4,
    totalPoints: 0,
    totalWeightLoss: 0,
  });

  // …y la lista EXACTA de campos que se tocan. Esta es la parte que protege a la
  // persona: reiniciar NO puede cambiarle el pseudónimo, ni el avatar, ni el rol.
  // Si algún día alguien añade aquí otro campo, este test lo dice.
  expect(
    Object.keys(plan.privado).sort(),
    'Reiniciar no debería tocar nada del documento privado salvo el historial',
  ).toEqual(['history']);
  expect(
    Object.keys(plan.publico).sort(),
    'Reiniciar no debería tocar nada del perfil público salvo los totales y el peso de partida',
  ).toEqual(['initialWeight', 'totalPoints', 'totalWeightLoss']);
});

test('R2 - un peso imposible se para antes de intentar guardarlo', () => {
  expect(problemaConElPeso(82.4)).toBeNull();

  // El caso del cero importa: las reglas de Firestore exigen `initialWeight > 0`,
  // así que no se llegaría a guardar y el error que devuelve («permisos
  // insuficientes») no se parece en nada a la causa. Se para antes, con el motivo.
  expect(problemaConElPeso(0), 'Un peso de cero debería rechazarse').not.toBeNull();
  expect(problemaConElPeso(-5), 'Un peso negativo debería rechazarse').not.toBeNull();
  expect(problemaConElPeso(NaN), 'Un peso que no es número debería rechazarse').not.toBeNull();
  expect(problemaConElPeso(PESO_MINIMO - 1), 'Un peso absurdo debería rechazarse').not.toBeNull();
  expect(problemaConElPeso(PESO_MAXIMO + 1), 'Un peso absurdo debería rechazarse').not.toBeNull();

  // Los límites exactos sí valen: si no, el rango estaría mal puesto.
  expect(problemaConElPeso(PESO_MINIMO)).toBeNull();
  expect(problemaConElPeso(PESO_MAXIMO)).toBeNull();

  // La coma del móvil: `parseFloat('82,4')` devolvería 82 sin avisar de nada.
  expect(aNumero('82,4')).toBeCloseTo(82.4);
  expect(aNumero(' 82.4 ')).toBeCloseTo(82.4);
});

test('R3 - la pantalla está conectada y escribe los dos documentos en UN SOLO lote', () => {
  const panel = leer('components/AdminSettings.tsx');
  expect(panel, 'El panel no tiene el botón de empezar de cero').toContain('Empezar de cero');
  expect(
    panel,
    'La ventana de confirmación no dice qué NO se borra: es un borrado irreversible',
  ).toContain('Lo que NO se borra');
  expect(panel, 'El panel no llama al reinicio').toContain('onResetUser');

  const app = leer('App.tsx');
  expect(app, 'App.tsx no usa el plan de reinicio').toContain('planDeReinicio');
  expect(
    app,
    'El reinicio debería escribir los dos documentos en un solo lote (writeBatch)',
  ).toContain('writeBatch');

  // Y la parte que de verdad evita el estado a medias: DOS escrituras y un solo
  // commit. Si fueran sueltas y fallara la segunda, la persona quedaría con cero
  // pesajes y los puntos viejos, que no se ve a simple vista.
  const lote = app.match(/const lote = writeBatch\(db\);[\s\S]{0,900}?lote\.commit\(\)/);
  expect(lote, 'No se encontró el lote con sus escrituras y su commit').not.toBeNull();
  expect(
    lote![0].match(/lote\.update\(/g)?.length ?? 0,
    'El lote debería llevar DOS escrituras: el historial (privado) y los totales (público)',
  ).toBe(2);
});
