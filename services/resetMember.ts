
/**
 * Empezar de cero con un participante al terminar un periodo del reto.
 *
 * POR QUÉ HACE FALTA: los pesajes no van etiquetados con el periodo al que
 * pertenecen. Cada uno guarda su fecha, y la app decide si cuenta comparándola
 * con las fechas del reto EN EL MOMENTO DE MIRARLA. Por eso, al cambiar las
 * fechas para un periodo nuevo, los pesajes del anterior siguen guardados: la
 * app deja de contarlos, pero no los borra. Y el primer pesaje del periodo nuevo
 * arrastra el peso del último del anterior, así que las cuentas salen mal desde
 * el primer día. Para empezar limpio hay que borrarlos de verdad.
 *
 * Está partido en dos a propósito, igual que la copia de seguridad:
 *   - la LÓGICA que decide qué se escribe (aquí, sin tocar la red) → se puede
 *     probar con tests de verdad, que es lo que garantiza que se borre lo que
 *     tiene que borrarse;
 *   - la ESCRITURA (en App.tsx) → necesita sesión de administrador.
 *
 * LO QUE NO TOCA, y es tan importante como lo que sí: la persona SIGUE en el
 * reto, con su pseudónimo, su avatar y su alta. Esto no es dar de baja.
 */

import { WeighIn } from '../types';

/** Lo que se escribe en el documento privado (`users/{uid}`). */
export interface CambioPrivado {
  history: WeighIn[];
}

/** Lo que se escribe en el documento público (`leaderboard/{uid}`). */
export interface CambioPublico {
  initialWeight: number;
  totalPoints: number;
  totalWeightLoss: number;
}

export interface PlanDeReinicio {
  privado: CambioPrivado;
  publico: CambioPublico;
}

/**
 * Límites del peso de partida.
 *
 * El límite bajo importa más de lo que parece: las reglas de Firestore exigen
 * `initialWeight > 0`, así que un cero no se llegaría a guardar y el error que
 * devuelve («Missing or insufficient permissions») no se parece en nada a la
 * causa. Mejor pararlo aquí, donde se puede decir qué pasa.
 */
export const PESO_MINIMO = 20;
export const PESO_MAXIMO = 400;

/** Devuelve el motivo por el que ese peso no vale, o `null` si vale. */
export function problemaConElPeso(valor: number): string | null {
  if (!Number.isFinite(valor)) {
    return 'Escribe el peso con números (por ejemplo 82,4).';
  }
  if (valor <= 0) {
    return 'El peso de partida tiene que ser mayor que cero.';
  }
  if (valor < PESO_MINIMO || valor > PESO_MAXIMO) {
    return `Escribe un peso entre ${PESO_MINIMO} y ${PESO_MAXIMO} kg, y revísalo antes de seguir.`;
  }
  return null;
}

/**
 * Convierte lo que escribe una persona en un número.
 * Acepta coma o punto: en el móvil sale la coma sola y `parseFloat('82,4')`
 * daría 82 sin avisar.
 */
export function aNumero(texto: string): number {
  return parseFloat(texto.trim().replace(',', '.'));
}

/**
 * Lo que hay que escribir para empezar de cero con alguien.
 *
 * Devuelve SOLO los campos que cambian: el historial (vacío), los totales (a
 * cero) y el peso de partida nuevo. Nada más: ni el pseudónimo, ni el avatar, ni
 * el rol. Hay un test que compara la lista EXACTA de campos que se tocan, para
 * que añadir algo aquí sea una decisión y no un descuido.
 *
 * Los dos documentos se escriben juntos, en un solo lote (ver App.tsx): si se
 * quedara a medias, la persona aparecería con cero pesajes y los puntos viejos.
 */
export function planDeReinicio(pesoInicial: number): PlanDeReinicio {
  return {
    privado: { history: [] },
    publico: {
      initialWeight: pesoInicial,
      totalPoints: 0,
      totalWeightLoss: 0,
    },
  };
}
