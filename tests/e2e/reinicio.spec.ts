import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SIN_PESO_DE_PARTIDA,
  calcularPesaje,
  porcentajePerdido,
  planDeReinicio,
  sinPesoDePartida,
} from '../../services/pesoDePartida';

/**
 * Tests de "empezar de cero" con un participante (cambio de periodo).
 *
 * POR QUÉ IMPORTA: esto BORRA pesajes de verdad y no se puede deshacer. Un fallo
 * aquí no da error: da datos mal, en silencio. Los tres modos de fallo que se
 * cubren son:
 *
 *   - que borre de más (el nombre, la foto, su alta en el reto) → la persona queda
 *     tocada o desaparece sin que nadie lo haya pedido;
 *   - que deje a medias (cero pesajes pero los puntos viejos) → el ranking miente;
 *   - que el «sin peso de partida» se cuele donde hace falta un número → el ranking
 *     divide por cero y sale NaN, y un NaN al ordenar deja a la persona en
 *     cualquier sitio.
 *
 * Los tres primeros NO usan navegador: prueban la lógica que decide. Las pruebas
 * contra la base de datos de verdad están en `reinicio-real.spec.ts`.
 */

const raiz = process.cwd();
const leer = (f: string) => readFileSync(path.join(raiz, f), 'utf8');

test('R1 - borra lo que tiene que borrar, NO toca nada más y está conectado', () => {
  const plan = planDeReinicio();

  // Se va el historial, se ponen los totales a cero y se BORRA el peso de partida…
  expect(plan.privado.history, 'El historial debería quedar vacío').toEqual([]);
  expect(plan.publico).toEqual({
    initialWeight: SIN_PESO_DE_PARTIDA,
    totalPoints: 0,
    totalWeightLoss: 0,
  });

  // …y la lista EXACTA de campos que se tocan. Esta es la parte que protege a la
  // persona: reiniciar NO puede cambiarle el pseudónimo, ni la foto, ni el rol, ni
  // su alta en el reto. Si alguien añade aquí otro campo, este test lo dice.
  expect(
    Object.keys(plan.privado).sort(),
    'Reiniciar no debería tocar nada del documento privado salvo el historial',
  ).toEqual(['history']);
  expect(
    Object.keys(plan.publico).sort(),
    'Reiniciar no debería tocar nada del perfil público salvo los totales y el peso de partida',
  ).toEqual(['initialWeight', 'totalPoints', 'totalWeightLoss']);

  // Y que las piezas están conectadas de verdad: un botón que no llama a nada se
  // vería igual en pantalla y no haría nada.
  const panel = leer('components/AdminSettings.tsx');
  expect(panel, 'El panel no tiene el botón de empezar de cero').toContain('Empezar de cero');
  expect(
    panel,
    'La ventana de confirmación no dice qué NO se borra: es un borrado irreversible',
  ).toContain('Lo que NO se borra');
  expect(
    panel,
    'La ventana no explica que el peso de partida lo fija su primer pesaje',
  ).toContain('primer pesaje');
  expect(panel, 'El panel no llama al reinicio').toContain('onResetUser');

  const app = leer('App.tsx');
  expect(app, 'App.tsx no usa el plan de reinicio').toContain('planDeReinicio');
  expect(
    app,
    'El reinicio debería escribir los dos documentos en un solo lote (writeBatch)',
  ).toContain('writeBatch');

  // La parte que de verdad evita el estado a medias: DOS escrituras, un solo
  // commit. Si fueran sueltas y fallara la segunda, la persona quedaría con cero
  // pesajes y los puntos viejos, y eso no se ve a simple vista.
  const lote = app.match(/const lote = writeBatch\(db\);[\s\S]{0,900}?lote\.commit\(\)/);
  expect(lote, 'No se encontró el lote con sus escrituras y su commit').not.toBeNull();
  expect(
    lote![0].match(/lote\.update\(/g)?.length ?? 0,
    'El lote debería llevar DOS escrituras: el historial (privado) y los totales (público)',
  ).toBe(2);
});

test('R2 - el primer pesaje del periodo fija el peso de partida', () => {
  // Quien viene de empezar de cero: su primer pesaje no compara con nada. Si
  // comparase con el peso del periodo anterior, el primer día se apuntaría una
  // subida o una bajada que no ha ocurrido.
  const primero = calcularPesaje(
    { initialWeight: SIN_PESO_DE_PARTIDA, totalWeightLoss: 0, history: [] },
    82.4,
  );
  expect(primero).toEqual({ delta: 0, kilosPerdidos: 0, fijaElPesoDePartida: true });

  // Y a partir de ahí, cuenta desde ese primero.
  const segundo = calcularPesaje(
    {
      initialWeight: 82.4,
      totalWeightLoss: 0,
      history: [
        { id: 'a', date: '2026-10-20', weight: 82.4, delta: 0, points: 15, ateOut: false },
      ],
    },
    81,
  );
  expect(segundo.delta, 'Debería comparar con su pesaje anterior').toBeCloseTo(-1.4);
  expect(segundo.kilosPerdidos, 'Perdidos desde su peso de partida').toBeCloseTo(1.4);
  expect(segundo.fijaElPesoDePartida).toBe(false);

  // Y quien tiene peso declarado pero aún no se ha pesado sigue contando desde ahí
  // (el caso de siempre, sin cambios).
  const recienApuntado = calcularPesaje({ initialWeight: 90, totalWeightLoss: 0, history: [] }, 88);
  expect(recienApuntado.delta).toBeCloseTo(-2);
  expect(recienApuntado.kilosPerdidos).toBeCloseTo(2);
  expect(recienApuntado.fijaElPesoDePartida).toBe(false);
});

test('R3 - sin peso de partida, el ranking NO se rompe (nada de NaN)', () => {
  const sinEmpezar = { initialWeight: SIN_PESO_DE_PARTIDA, totalWeightLoss: 0 };

  expect(sinPesoDePartida(sinEmpezar), 'Debería reconocerse como «sin empezar»').toBe(true);
  expect(porcentajePerdido(sinEmpezar), 'Sin empezar, el porcentaje es cero').toBe(0);
  expect(
    Number.isNaN(porcentajePerdido(sinEmpezar)),
    'Dividir por un peso de partida inexistente daría NaN, y un NaN al ordenar ' +
      'deja a la persona en un sitio cualquiera del ranking',
  ).toBe(false);

  const normal = { initialWeight: 80, totalWeightLoss: 2 };
  expect(sinPesoDePartida(normal)).toBe(false);
  expect(porcentajePerdido(normal)).toBeCloseTo(2.5);
});
