
/**
 * Aviso de "instala la app" dentro de la propia web.
 *
 * QUÉ PROBLEMA RESUELVE: al abrir el enlace desde WhatsApp, el móvil abre el
 * navegador y la app sale CON la barra del navegador. Para tener el icono y que
 * abra sin barra hay que instalarla, y eso no se descubre: en Android está escondido
 * en el menú y en iPhone detrás del botón de compartir. La gente se queda con la
 * versión "de navegador" sin saber que existe la otra.
 *
 * CÓMO FUNCIONA, Y POR QUÉ NO ES IGUAL EN LOS DOS MÓVILES:
 *
 *  - **Android**: el navegador avisa (`beforeinstallprompt`) de que la app se puede
 *    instalar, y desde ahí se llama a `prompt()` para abrir la instalación de verdad.
 *    OJO: ese aviso SOLO llega si el usuario ha tocado la página y ha pasado un rato
 *    mirándola, así que no se puede enseñar el botón desde el primer segundo: por
 *    eso el módulo espera al evento en vez de decidir por su cuenta.
 *  - **iPhone**: no existe ese aviso y no se puede abrir la instalación desde la web
 *    (**no se puede saltar**: es el navegador, no la app). La única vía es que la
 *    persona toque Compartir → «Añadir a pantalla de inicio». Lo que sí se puede
 *    hacer es explicárselo con el dedo en el sitio correcto; en Chrome para iPhone,
 *    además, no sirve de nada porque solo se instala desde Safari.
 *
 * Y en los dos casos, si la app YA está instalada (se abrió desde el icono), el
 * aviso no debe salir: por eso se mira `display-mode: standalone`.
 */

export type Plataforma = 'androide' | 'iphone' | 'iphone-otro-navegador' | 'ordenador';

/** Dónde está mirando la persona. Solo se usa `navigator`, para poder pasarle valores en los tests. */
export interface Entorno {
  agente: string;
  esTactil: boolean;
  plataformaSafari?: string;
  topeTactil?: number;
}

export function detectarPlataforma(e: Entorno): Plataforma {
  const agente = e.agente;
  const esIPhone = /iPhone|iPad|iPod/.test(agente) || (e.plataformaSafari === 'MacIntel' && (e.topeTactil ?? 0) > 1);
  if (esIPhone) {
    // En iPhone hay tres navegadores de verdad (Safari, Chrome y Firefox) y solo
    // Safari puede instalar. "CriOS" es Chrome, "FxiOS" Firefox, "EdgiOS" Edge.
    const esSafari = /Safari/.test(agente) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(agente);
    return esSafari ? 'iphone' : 'iphone-otro-navegador';
  }
  if (/Android/.test(agente)) return 'androide';
  return 'ordenador';
}

/** ¿Se abrió desde el icono (ya instalada) o dentro del navegador? */
export function yaInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  // iPhone no implementa `display-mode` en todas sus versiones: ahí manda
  // `navigator.standalone`, que es lo que pone Safari al añadirla a la pantalla.
  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}

/**
 * Guarda el aviso del navegador para usarlo cuando la persona toque el botón.
 * Devuelve una función para desengancharse (se usa al cerrar la app).
 */
export function escucharInstalacion(
  alPoderInstalar: (disparar: () => Promise<'instalada' | 'cancelada'>) => void,
): () => void {
  const manejar = (evento: Event) => {
    // Sin esto, el navegador enseña su propio cartel pequeño y se pierde el
    // momento bueno: el aviso lo damos nosotros, cuando la persona ya ha visto
    // de qué va la app.
    evento.preventDefault();
    const diferido = evento as Event & {
      prompt: () => Promise<void>;
      userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    alPoderInstalar(async () => {
      await diferido.prompt();
      const eleccion = await diferido.userChoice;
      return eleccion?.outcome === 'accepted' ? 'instalada' : 'cancelada';
    });
  };
  window.addEventListener('beforeinstallprompt', manejar);
  return () => window.removeEventListener('beforeinstallprompt', manejar);
}
