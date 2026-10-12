import { expect, test } from '@playwright/test';
import {
  VERSION_COPIA,
  construirCopia,
  contarPesajes,
  nombreDelFichero,
  type DatosDelReto,
  type DocumentoCopiado,
} from '../../services/backup';

/**
 * Tests de la copia de seguridad. NO usan navegador: prueban la lógica que arma
 * el fichero, que es donde se puede perder información sin que nadie se entere.
 *
 * La propiedad que se protege, y es la única que de verdad importa:
 *   **TODO lo que entra, sale.** Una copia que se deja datos fuera es peor que
 *   no tener copia, porque da una falsa sensación de estar cubierto.
 *
 * Leer los datos de Firebase necesita sesión de administrador y no se puede
 * probar aquí; eso se comprueba con S13 (que se salta sin credenciales). Lo que
 * sí se prueba aquí es que, con los datos en la mano, el fichero sale completo.
 */

const persona = (id: string, nombre: string, pesajes: number): DocumentoCopiado => ({
  id,
  realName: nombre,
  history: Array.from({ length: pesajes }, (_, i) => ({
    id: `p${i}`,
    date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    weight: 80 - i * 0.1,
    delta: -0.1,
    points: 10,
    ateOut: false,
  })),
});

const publico = (id: string, pseudonimo: string): DocumentoCopiado => ({
  id,
  pseudonym: pseudonimo,
  avatar: 'https://img.icons8.com/fluency/200/grapes.png',
  initialWeight: 85,
  totalPoints: 120,
  totalWeightLoss: 3.4,
  isAdmin: false,
});

const datosDeEjemplo = (): DatosDelReto => ({
  ranking: [publico('u1', 'Mona'), publico('u2', 'Divina')],
  personas: [persona('u1', 'Elena', 5), persona('u2', 'Otra', 3)],
  configuracion: {
    id: 'competition',
    startDate: '2026-10-10',
    endDate: '2026-11-09',
    prizeDescription: 'Una botella de vino',
  },
  emailAdmin: 'vilacos@gmail.com',
});

test('B1 - la copia no pierde NADA: todo lo que entra sale igual', () => {
  const datos = datosDeEjemplo();
  const copia = JSON.parse(construirCopia(datos, new Date('2026-10-12T09:30:00')));

  // Cada documento del ranking está, y está idéntico
  for (const original of datos.ranking) {
    const guardado = copia.ranking.find((d: DocumentoCopiado) => d.id === original.id);
    expect(guardado, `Falta en la copia el documento ${original.id} del ranking`).toBeDefined();
    expect(guardado, `El documento ${original.id} se guardó cambiado`).toEqual(original);
  }

  // Cada persona está, con su historial COMPLETO (es el dato que no se recupera)
  for (const original of datos.personas) {
    const guardado = copia.personas.find((d: DocumentoCopiado) => d.id === original.id);
    expect(guardado, `Falta en la copia la persona ${original.id}`).toBeDefined();
    expect(guardado, `El historial de ${original.id} se guardó cambiado`).toEqual(original);
    expect(
      (guardado.history as unknown[]).length,
      `A ${original.id} le faltan pesajes en la copia`,
    ).toBe((original.history as unknown[]).length);
  }

  // Y la configuración del reto
  expect(copia.configuracionDelReto).toEqual(datos.configuracion);
});

test('B2 - el resumen cuadra con lo que hay dentro', () => {
  const datos = datosDeEjemplo();
  const copia = JSON.parse(construirCopia(datos, new Date('2026-10-12T09:30:00')));

  expect(copia.resumen.participantes).toBe(2);
  expect(copia.resumen.personas).toBe(2);
  // 5 + 3 pesajes: el número que la dueña comparará con lo que espera
  expect(copia.resumen.pesajes).toBe(8);
  expect(copia.resumen.pesajes).toBe(
    copia.personas.reduce((t: number, p: DocumentoCopiado) => t + (p.history as unknown[]).length, 0),
  );
  expect(contarPesajes(datos.personas)).toBe(8);
});

test('B3 - un caso grande: no se cae ningún pesaje por el camino', () => {
  // 10 personas x 31 días = 310 pesajes. Se comprueba el total, no una muestra:
  // un fallo que pierda "algunos" documentos pasaría desapercibido a ojo.
  const personas = Array.from({ length: 10 }, (_, i) => persona(`u${i}`, `Persona ${i}`, 31));
  const ranking = Array.from({ length: 10 }, (_, i) => publico(`u${i}`, `Pseudo ${i}`));
  const copia = JSON.parse(
    construirCopia(
      { ranking, personas, configuracion: null, emailAdmin: 'a@b.c' },
      new Date('2026-10-12T09:30:00'),
    ),
  );

  expect(copia.personas).toHaveLength(10);
  expect(copia.ranking).toHaveLength(10);
  const totalPesajes = copia.personas.reduce(
    (t: number, p: DocumentoCopiado) => t + (p.history as unknown[]).length,
    0,
  );
  expect(totalPesajes, 'Deberían estar los 310 pesajes').toBe(310);
  expect(copia.resumen.pesajes).toBe(310);
});

test('B4 - sin datos no revienta (y dice la verdad)', () => {
  const copia = JSON.parse(
    construirCopia(
      { ranking: [], personas: [], configuracion: null, emailAdmin: 'a@b.c' },
      new Date('2026-10-12T09:30:00'),
    ),
  );
  expect(copia.resumen).toEqual({ participantes: 0, personas: 0, pesajes: 0 });
  expect(copia.ranking).toEqual([]);
  expect(copia.personas).toEqual([]);
  expect(copia.configuracionDelReto).toBeNull();
});

test('B5 - una persona sin historial no rompe el recuento', () => {
  // Puede pasar de verdad: alguien apuntado a mano, que aún no se ha pesado.
  const sinHistorial: DocumentoCopiado = { id: 'u9', realName: 'Recién llegada' };
  const copia = JSON.parse(
    construirCopia(
      { ranking: [], personas: [sinHistorial], configuracion: null, emailAdmin: 'a@b.c' },
      new Date('2026-10-12T09:30:00'),
    ),
  );
  expect(copia.resumen.pesajes).toBe(0);
  expect(copia.personas[0]).toEqual(sinHistorial);
});

test('B6 - el fichero lleva la fecha, la hora y la versión del formato', () => {
  const ahora = new Date('2026-10-12T09:30:00');
  const copia = JSON.parse(construirCopia(datosDeEjemplo(), ahora));

  expect(nombreDelFichero(ahora)).toBe('fitclub-copia-2026-10-12-0930.json');
  // La hora está en el nombre para poder guardar varias copias el mismo día sin
  // que una machaque a la otra.
  expect(nombreDelFichero(new Date('2026-10-12T21:05:00'))).toBe('fitclub-copia-2026-10-12-2105.json');
  // El nombre usa la fecha LOCAL: es la que ve la persona, no la de Greenwich.
  expect(nombreDelFichero(new Date(2026, 0, 5, 8, 7))).toBe('fitclub-copia-2026-01-05-0807.json');

  expect(copia.version).toBe(VERSION_COPIA);
  expect(copia.aplicacion).toBe('FitClub');
  expect(copia.tipo).toBe('copia-de-seguridad');
  expect(copia.generadoPor).toBe('vilacos@gmail.com');
  // La fecha va en ISO, que no depende del idioma del dispositivo (a diferencia
  // de lo que pasaba con las fechas del premio).
  expect(copia.fecha).toBe(ahora.toISOString());
});

test('B7 - no se descarta ningún campo: lo nuevo entra solo', () => {
  // Regla: la copia guarda los documentos ENTEROS, sin filtrar campos. Así, si
  // mañana la app añade un dato, viaja en la copia sin tocar este módulo. Lo
  // contrario (copiar campo por campo) es cómo se pierden datos en silencio.
  const conCampoNuevo: DocumentoCopiado = {
    ...publico('u1', 'Mona'),
    campoQueNoExistiaAntes: { anidado: [1, 2, 3] },
  };
  const copia = JSON.parse(
    construirCopia(
      { ranking: [conCampoNuevo], personas: [], configuracion: null, emailAdmin: 'a@b.c' },
      new Date('2026-10-12T09:30:00'),
    ),
  );
  expect(copia.ranking[0]).toEqual(conCampoNuevo);
  expect(copia.ranking[0].campoQueNoExistiaAntes).toEqual({ anidado: [1, 2, 3] });
});
