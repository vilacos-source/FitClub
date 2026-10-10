
import React, { useState } from 'react';
import { User } from '../types';

interface TopNavProps {
  currentUser: User | null;
  onLogout: () => void;
}

const TopNav: React.FC<TopNavProps> = ({ currentUser, onLogout }) => {
  // Cerrar sesión es destructivo (hay que volver a entrar con email y
  // contraseña), así que no puede pasar por un toque accidental en el avatar.
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 bar-blur backdrop-blur-md border-b px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 grad-brand rounded-lg flex items-center justify-center text-white font-bold shadow-lg">
            F
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            FitClub
          </h1>
        </div>

        {currentUser && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-500 font-medium">Hola,</p>
              <p className="text-sm font-semibold text-slate-800">{currentUser.pseudonym}</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmarSalida(true)}
              aria-label="Tu perfil"
              title="Tu perfil"
              className="w-10 h-10 rounded-full border-2 border-indigo-100 p-0.5 hover:scale-105 transition-transform relative group"
            >
              <img
                src={currentUser.avatar}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
              {currentUser.isAdmin && (
                <span className="absolute -top-1 -right-1 bg-amber-400 text-[8px] text-white px-1 rounded-full font-bold">ADM</span>
              )}
            </button>
          </div>
        )}
      </header>

      {confirmarSalida && currentUser && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setConfirmarSalida(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmar-salida"
            className="card-modal rounded-3xl p-6 w-full max-w-sm animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="titulo-confirmar-salida" className="text-xl font-black text-slate-800 mb-2">
              ¿Cerrar sesión?
            </h2>
            <p className="text-slate-500 text-sm mb-6">
              Tendrás que volver a entrar con tu email y contraseña. Tus datos y tus puntos se quedan guardados.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmarSalida(false)}
                className="flex-1 bg-white text-slate-600 font-bold py-3 rounded-2xl border-2 border-slate-100 active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmarSalida(false);
                  onLogout();
                }}
                className="flex-1 btn-primary font-bold py-3 rounded-2xl active:scale-95 transition-all"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TopNav;
