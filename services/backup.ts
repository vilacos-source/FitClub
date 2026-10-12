
/**
 * Copia de seguridad de los datos del reto.
 *
 * POR QUÉ EXISTE: los pesajes de todo el grupo viven SOLO en Firestore. No hay
 * ninguna copia en ningún sitio, así que si se pierden, se pierden para siempre.
 * Este módulo construye un fichero con TODO para que la dueña pueda guardarlo.
 *
 * Está partido en dos a propósito:
 *   - la LÓGICA que arma el fichero (aquí, sin tocar la red) → se puede probar
 *     de verdad con tests, que es lo que garantiza que no se pierda nada;
 *   - la LECTURA de los datos (en App.tsx) → necesita sesión de administrador.
 *
 * La regla que no se puede romper: **en la copia va absolutamente todo**. Una
 * copia de seguridad que se deja cosas fuera es peor que no tener copia, porque
 * da una falsa sensación de estar cubierto.
 */

/** Un documento tal cual sale de Firestore, con su identificador. */
export interface DocumentoCopiado {
  id: string;
  [campo: string]: unknown;
}

export interface DatosDelReto {
  /** Colección pública: pseudónimo, puntos, kilos perdidos. */
  ranking: DocumentoCopiado[];
  /** Colección privada: nombre real e historial de pesajes. */
  personas: DocumentoCopiado[];
  /** Configuración del reto (fechas y premio), o `null` si no se pudo leer. */
  configuracion: DocumentoCopiado | null;
  /** Email de quien hizo la copia, para saber de dónde salió. */
  emailAdmin: string;
}

export interface ResumenCopia {
  participantes: number;
  pesajes: number;
  fichero: string;
  tamanoKB: number;
}

/** Formato del fichero. Subirlo cuando cambie la forma de lo que se guarda. */
export const VERSION_COPIA = 1;

/**
 * Cuenta los pesajes de todas las personas. Se usa para el resumen y para que la
 * dueña vea de un vistazo si el número cuadra con lo que espera.
 */
export const contarPesajes = (personas: DocumentoCopiado[]): number =>
  personas.reduce((total, persona) => {
    const historial = persona.history;
    return total + (Array.isArray(historial) ? historial.length : 0);
  }, 0);

/**
 * Nombre del fichero, con fecha Y hora. Lleva la hora a propósito: así se pueden
 * guardar varias copias el mismo día sin que una machaque a la otra.
 * Se usan los valores LOCALES (no UTC) porque es la fecha que ve la persona.
 */
export const nombreDelFichero = (ahora: Date): string => {
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
  const hora = `${dosDigitos(ahora.getHours())}${dosDigitos(ahora.getMinutes())}`;
  return `fitclub-copia-${fecha}-${hora}.json`;
};

/**
 * Arma el contenido del fichero de copia.
 *
 * Devuelve texto JSON (no un objeto) porque lo que se guarda es el fichero, y
 * así lo que se prueba es exactamente lo que se escribe en el disco.
 *
 * Los documentos se copian enteros y sin filtrar campos: si algún día se añade
 * un dato nuevo a la app, entra en la copia solo, sin tocar esto.
 */
export const construirCopia = (datos: DatosDelReto, ahora: Date): string => {
  const copia = {
    aplicacion: 'FitClub',
    tipo: 'copia-de-seguridad',
    version: VERSION_COPIA,
    fecha: ahora.toISOString(),
    generadoPor: datos.emailAdmin,
    resumen: {
      participantes: datos.ranking.length,
      personas: datos.personas.length,
      pesajes: contarPesajes(datos.personas),
    },
    configuracionDelReto: datos.configuracion,
    ranking: datos.ranking,
    personas: datos.personas,
  };
  return JSON.stringify(copia, null, 2);
};

/**
 * Descarga un texto como fichero, en el navegador.
 *
 * Se hace con un enlace temporal y `createObjectURL`: funciona igual en el móvil
 * y en el ordenador, y no necesita permisos especiales. Se libera la URL después
 * para no dejar memoria colgando.
 */
export const descargarTexto = (contenido: string, nombre: string): void => {
  const blob = new Blob([contenido], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
};
