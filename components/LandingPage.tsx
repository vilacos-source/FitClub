
import React, { useState } from 'react';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { auth } from '../services/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

interface LandingPageProps {
  onRegister: (userData: { realName: string, pseudonym: string, initialWeight: number }) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onRegister }) => {
  const [mode, setMode] = useState<'landing' | 'signup' | 'login'>('landing');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    realName: '',
    pseudonym: '',
    initialWeight: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (mode === 'signup') {
        // 1. Crear usuario en Firebase Auth
        await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        // 2. Llamar al callback para crear el perfil en Firestore
        await onRegister({
          realName: formData.realName,
          pseudonym: formData.pseudonym,
          initialWeight: parseFloat(formData.initialWeight.replace(',', '.'))
        });
      } else {
        // Login simple
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      alert("Error: " + message);
    } finally {
      setIsLoading(false);
    }
  };

  if (mode === 'landing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white text-4xl font-black shadow-xl mb-8">F</div>
        <h1 className="text-4xl font-black text-slate-900 mb-4">FitClub <br/><span className="text-indigo-600 text-2xl">Cloud Edition</span></h1>
        <p className="text-slate-500 mb-10 text-lg">Ahora tus progresos se sincronizan con todo el grupo en tiempo real.</p>
        
        <div className="w-full space-y-4">
          <button onClick={() => setMode('signup')} className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all">Empezar el Reto</button>
          <button onClick={() => setMode('login')} className="w-full bg-white text-indigo-600 font-bold py-4 rounded-2xl border-2 border-indigo-50 active:scale-95 transition-all">Ya tengo cuenta</button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 animate-in slide-in-from-bottom-8 duration-500">
      <button onClick={() => setMode('landing')} className="mb-8 text-slate-400 flex items-center gap-2 font-bold text-sm">
        <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        Volver
      </button>

      <h2 className="text-3xl font-black text-slate-800 mb-2">{mode === 'signup' ? 'Crea tu perfil' : 'Bienvenido de nuevo'}</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4 mt-6">
        <input 
          type="email" required placeholder="Email"
          value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})}
          className="w-full bg-white border-none rounded-2xl py-4 px-5 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="relative">
          <input 
            type={showPassword ? "text" : "password"} required placeholder="Contraseña"
            value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})}
            className="w-full bg-white border-none rounded-2xl py-4 px-5 pr-14 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {/* type="button": si no, este botón enviaría el formulario al pulsarlo */}
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-indigo-600 active:scale-90 transition-all"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {mode === 'signup' && (
          <>
            <input 
              required placeholder="Tu nombre real (solo admin)"
              value={formData.realName} onChange={(e) => setFormData({...formData, realName: e.target.value})}
              className="w-full bg-white border-none rounded-2xl py-4 px-5 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input 
              required placeholder="Pseudónimo (para el ranking)"
              value={formData.pseudonym} onChange={(e) => setFormData({...formData, pseudonym: e.target.value})}
              className="w-full bg-white border-none rounded-2xl py-4 px-5 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="relative">
              <input 
                required type="number" step="0.1" placeholder="Peso inicial (kg)"
                value={formData.initialWeight} onChange={(e) => setFormData({...formData, initialWeight: e.target.value})}
                className="w-full bg-white border-none rounded-2xl py-4 px-5 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-5 top-4 text-slate-300 font-bold">kg</span>
            </div>
          </>
        )}

        <button 
          type="submit" disabled={isLoading}
          className="w-full bg-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl mt-4 active:scale-95 disabled:opacity-50 transition-all"
        >
          {isLoading ? 'Conectando...' : mode === 'signup' ? '¡Unirme al grupo!' : 'Entrar'}
        </button>
      </form>
    </div>
  );
};

export default LandingPage;
