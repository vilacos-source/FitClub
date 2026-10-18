
/**
 * El PESO DE PARTIDA de un periodo, y cómo empezar de cero con alguien.
 *
 * QUÉ ES: el peso desde el que se cuentan los kilos perdidos. Al registrarse, cada
 * persona lo declara (su peso de entonces).
 *
 * POR QUÉ HAY UN CASO "SIN PESO DE PARTIDA": al terminar un periodo y empezar otro,
 * la persona no declara un peso nuevo. Y no se le puede inventar uno, porque
 * cualquier número que pusiéramos sería de otro momento y las cuentas saldrían
 * torcidas desde el primer día. Lo que manda es **su primer pesaje del periodo
 * nuevo**: ese pasa a ser su peso de partida. Hasta que se pesa, está "sin empezar"
 * y sus kilos perdidos son cero.
 *
 * Ese estado se representa con `initialWeight = 0` (`SIN_PESO_DE_PARTIDA`). Es
 * importante saber dónde se lee ese campo, porque un cero no se puede usar para
 * dividir ni para decirle a nadie "tu peso de salida fue 0 kg": los cuatro sitios
 * están cubiertos aquí abajo y en sus pantallas (ranking, inicio, mensaje de la
 * IA y el cálculo de cada pesaje).
 *
 * Está partido en dos a propósito, como la copia de seguridad: la LÓGICA que
 * decide (aquí, sin tocar la red) → se prueba con tests de verdad; la ESCRITURA
 * (en App.tsx) → necesita sesión.
 */

import { WeighIn } from '../types';

/** Un perfil con lo que hace falta para contar kilos: público, y su historial si se tiene. */
export interface PerfilPesable {
  initialWeight: number;
  totalWeightLoss: number;
  history?: WeighIn[];
}

/** Valor de `initialWeight` cuando todavía no hay peso de partida. */
export const SIN_PESO_DE_PARTIDA = 0;

/**
 * ¿Está sin empezar el periodo? (Empezó de cero y aún no se ha pesado.)
 *
 * Se usa para no enseñar "0.0 kg" como si fuera un peso de verdad ni decirle a la
 * IA que su peso de salida fue cero.
 */
export const sinPesoDePartida = (perfil: PerfilPesable): boolean =>
  !(perfil.initialWeight > SIN_PESO_DE_PARTIDA);

/**
 * Porcentaje de kilos perdidos, que es como ordena el ranking.
 *
 * El cero se trata aparte: dividir por un peso de partida inexistente daría
 * infinito o NaN, y un NaN al ordenar deja a la persona en un sitio cualquiera.
 * Sin empezar, el porcentaje es cero.
 */
export const porcentajePerdido = (perfil: PerfilPesable): number => {
  if (sinPesoDePartida(perfil)) return 0;
  return (perfil.totalWeightLoss / perfil.initialWeight) * 100;
};

/**
 * Lo que cambia en un pesaje nuevo: cuánto ha subido o bajado desde el anterior y
 * cuántos kilos lleva perdidos.
 *
 * ESTE ES EL SITIO DEL PRIMER PESAJE. Si la persona está sin empezar (viene de
 * empezar de cero), su primer pesaje no compara con nada: fija su peso de partida
 * y sale 0. Si comparase con el peso del periodo anterior, el primer día se
 * apuntaría una subida o una bajada que no ha ocurrido.
 */
export function calcularPesaje(
  perfil: PerfilPesable,
  pesoNuevo: number,
): { delta: number; kilosPerdidos: number; fijaElPesoDePartida: boolean } {
  if (sinPesoDePartida(perfil)) {
    // Primer pesaje del periodo: manda él.
    return { delta: 0, kilosPerdidos: 0, fijaElPesoDePartida: true };
  }
  const historial = perfil.history ?? [];
  const anterior =
    historial.length > 0 ? historial[historial.length - 1].weight : perfil.initialWeight;
  return {
    delta: pesoNuevo - anterior,
    kilosPerdidos: perfil.initialWeight - pesoNuevo,
    fijaElPesoDePartida: false,
  };
}

/** Lo que se escribe en el documento privado (`users/{uid}`) al empezar de cero. */
export interface CambioPrivado {
  history: WeighIn[];
}

/** Lo que se escribe en el documento público (`leaderboard/{uid}`) al empezar de cero. */
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
 * Lo que hay que escribir para empezar de cero con alguien.
 *
 * Devuelve SOLO los campos que cambian: el historial (vacío), los totales (a cero)
 * y el peso de partida, que se **borra** (`SIN_PESO_DE_PARTIDA`). Nada más: ni el
 * pseudónimo, ni el avatar, ni el rol, ni su alta en el reto. Hay un test que
 * compara la lista EXACTA de campos que se tocan, para que añadir algo aquí sea
 * una decisión y no un descuido.
 *
 * El peso de partida se borra a propósito y no se pregunta: lo fijará su primer
 * pesaje del periodo nuevo (ver `calcularPesaje`).
 *
 * Los dos documentos se escriben juntos, en un solo lote (ver App.tsx): si se
 * quedara a medias, la persona aparecería con cero pesajes y los puntos viejos.
 */
export function planDeReinicio(): PlanDeReinicio {
  return {
    privado: { history: [] },
    publico: {
      initialWeight: SIN_PESO_DE_PARTIDA,
      totalPoints: 0,
      totalWeightLoss: 0,
    },
  };
}
