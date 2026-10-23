
import React, { useEffect, useState } from 'react';
import { Download, X, Share, Check } from 'lucide-react';
import {
  detectarPlataforma,
  escucharInstalacion,
  yaInstalada,
  type Plataforma,
} from '../services/instalarApp';

/**
 * Aviso de "instala la app".
 *
 * POR QUÉ EXISTE: quien abre el enlace desde WhatsApp se queda con la app DENTRO
 * del navegador, con su barra, y sin saber que puede tenerla como una app con su
 * icono. Este aviso se lo dice, y en Android además lo instala de un toque.
 *
 * Cuándo NO sale (importante, cada caso es una razón distinta):
 *   - si ya está instalada (se abrió desde el icono): no tiene sentido pedirlo;
 *   - si la persona lo ha cerrado antes: no se insiste, se guarda la decisión;
 *   - en un ordenador: aquí se instala en el escritorio, que a nadie le importa
 *     para un reto que se sigue desde el móvil.
 *
 * En iPhone NO se puede lanzar la instalación desde la web (no es un fallo
 * nuestro: el navegador no lo permite). Ahí el aviso explica los dos toques
 * exactos, que es lo único que funciona.
 */

const CLAVE_DESCARTADO = 'fitclub.avisoInstalar.descartado';
const CLAVE_INSTALADA = 'fitclub.avisoInstalar.instalada';

export const AvisoInstalar: React.FC = () => {
  const [plataforma, setPlataforma] = useState<Plataforma>('ordenador');
  const [visible, setVisible] = useState(false);
  const [disparar, setDisparar] = useState<(() => Promise<'instalada' | 'cancelada'>) | null>(null);
  const [estado, setEstado] = useState<'quieto' | 'instalando' | 'hecha' | 'cancelada'>('quieto');

  useEffect(() => {
    // Si ya se instaló una vez en este móvil, no se vuelve a ofrecer nunca: el
    // aviso solo sirve para el primer contacto.
    const yaSeInstalo = (() => {
      try {
        return localStorage.getItem(CLAVE_INSTALADA) === 'si';
      } catch {
        return false;
      }
    })();
    if (yaInstalada() || yaSeInstalo) return;

    const detectada = detectarPlataforma({
      agente: navigator.userAgent,
      esTactil: navigator.maxTouchPoints > 0,
      plataformaSafari: navigator.platform,
      topeTactil: navigator.maxTouchPoints,
    });
    setPlataforma(detectada);

    const descartado = (() => {
      try {
        return localStorage.getItem(CLAVE_DESCARTADO) === 'si';
      } catch {
        return false;
      }
    })();

    // Android: se espera a que el navegador avise de que se puede instalar. Si no
    // avisa, no se enseña el botón (un botón que no instala es peor que ninguno).
    let desenganchar = () => {};
    if (detectada === 'androide') {
      desenganchar = escucharInstalacion((funcion) => {
        setDisparar(() => funcion);
        if (!descartado) setVisible(true);
      });
      // En Android el aviso depende del navegador; si no llega, no se enseña nada.
    } else if (detectada === 'iphone' || detectada === 'iphone-otro-navegador') {
      // En iPhone no hay aviso del navegador: se explica y listo.
      if (!descartado) setVisible(true);
    }

    return () => desenganchar();
  }, []);

  const alPulsarInstalar = async () => {
    if (!disparar) return;
    setEstado('instalando');
    const resultado = await disparar();
    setEstado(resultado === 'instalada' ? 'hecha' : 'cancelada');
    if (resultado === 'instalada') {
      try {
        localStorage.setItem(CLAVE_INSTALADA, 'si');
      } catch {
        /* da igual */
      }
      setTimeout(() => setVisible(false), 2500);
    }
  };

  const cerrar = () => {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE_DESCARTADO, 'si');
    } catch {
      /* da igual */
    }
  };

  if (!visible) return null;

  const enIPhone = plataforma === 'iphone' || plataforma === 'iphone-otro-navegador';

  return (
    <div className="fixed inset-x-0 bottom-0 z-[95] px-3 pb-3">
      <div className="card rounded-2xl p-4 shadow-2xl border border-indigo-100 relative animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={cerrar}
          aria-label="Ahora no"
          className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="grad-brand w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0">
            {enIPhone ? <Share className="w-5 h-5" /> : <Download className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Tenla como una app</p>
            <p className="text-[11px] text-slate-500 leading-snug">
              {estado === 'hecha'
                ? '¡Instalada! Búscala en tu pantalla de inicio.'
                : 'Con su icono en el móvil, sin la barra del navegador.'}
            </p>
          </div>
        </div>

        {enIPhone ? (
          <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-[11px] text-indigo-800 space-y-1.5">
            <p className="flex items-center gap-1.5">
              <span className="font-bold">1.</span> Toca <Share className="w-3.5 h-3.5 inline" />{' '}
              <b>Compartir</b> abajo.
            </p>
            <p>
              <span className="font-bold">2.</span> Elige <b>Añadir a pantalla de inicio</b>.
            </p>
            {plataforma === 'iphone-otro-navegador' && (
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
                Aquí dentro no se puede. Abre este enlace en <b>Safari</b> y repite los dos
                toques.
              </p>
            )}
          </div>
        ) : (
          <div className="flex gap-2 mt-3">
            <button
              onClick={alPulsarInstalar}
              disabled={estado === 'instalando' || estado === 'hecha'}
              className="flex-1 btn-primary text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {estado === 'hecha' ? (
                <>
                  <Check className="w-4 h-4" /> Instalada
                </>
              ) : estado === 'instalando' ? (
                'Abriendo…'
              ) : (
                <>
                  <Download className="w-4 h-4" /> Instalar la app
                </>
              )}
            </button>
            <button
              onClick={cerrar}
              className="px-4 bg-slate-100 text-slate-600 text-sm font-bold rounded-xl active:scale-95 transition-all"
            >
              Ahora no
            </button>
          </div>
        )}

        {plataforma === 'androide' && estado === 'cancelada' && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
            No se ha instalado. Si el botón no abre nada, está en el menú del navegador
            (⋮) → «Instalar aplicación».
          </p>
        )}
      </div>
    </div>
  );
};

export default AvisoInstalar;
