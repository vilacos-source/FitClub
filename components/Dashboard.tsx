
import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, TrendingUp, PenLine, History } from 'lucide-react';
import { User, PublicProfile, CompetitionConfig } from '../types';
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, Cell } from 'recharts';
import { getMotivationalMessage, getWelcomeMessage } from '../services/geminiService';

interface DashboardProps {
  user: User;
  leaderboard: PublicProfile[];
  onAddWeight: (weight: number, ateOut: boolean) => void;
  config: CompetitionConfig;
}

const STORAGE_KEY_MSG = 'pesocompeti_daily_msg';

const Dashboard: React.FC<DashboardProps> = ({ user, leaderboard, onAddWeight, config }) => {
  const [newWeight, setNewWeight] = useState('');
  const [ateOut, setAteOut] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const getLocalDate = (date: Date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const todayStr = getLocalDate();
  const isFinished = new Date().getTime() > new Date(config.endDate).getTime();

  const fetchMessage = useCallback(async (force = false) => {
    if (!force) {
      const saved = localStorage.getItem(STORAGE_KEY_MSG);
      if (saved) {
        const { userId, date, message } = JSON.parse(saved);
        if (userId === user.id && date === todayStr) {
          setAiMessage(message);
          return;
        }
      }
    }

    setLoadingAi(true);
    try {
      const isNewUser = user.history.length === 0;
      const msg = isNewUser 
        ? await getWelcomeMessage(user) 
        : await getMotivationalMessage(user, leaderboard);
      
      if (msg) {
        setAiMessage(msg);
        localStorage.setItem(STORAGE_KEY_MSG, JSON.stringify({
          userId: user.id,
          date: todayStr,
          message: msg
        }));
      }
    } catch (error) {
       console.error("AI Fetch Error", error);
    } finally {
      setLoadingAi(false);
    }
  }, [user, leaderboard, todayStr]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMessage();
  }, [user.id, fetchMessage]);

  const hasRegisteredToday = user.history.some(h => h.date === todayStr);

  const getWeeklyConsistency = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return getLocalDate(d);
    });
    const count = user.history.filter(h => last7Days.includes(h.date)).length;
    return { count, percentage: (count / 7) * 100 };
  };

  const consistency = getWeeklyConsistency();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasRegisteredToday || isFinished) return;
    const weight = parseFloat(newWeight.replace(',', '.'));
    if (!isNaN(weight) && weight > 0) {
      onAddWeight(weight, ateOut);
      setNewWeight('');
      setAteOut(false);
    }
  };

  const chartData = user.history.map((h, index) => {
    let accumulated = 0;
    for(let i=0; i<=index; i++) accumulated += user.history[i].delta;
    return {
      name: `S${index}`,
      pérdida: Math.abs(accumulated).toFixed(1),
      puntos: h.points
    };
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Banner Motivacional IA */}
      <div className={`bg-gradient-to-br ${isFinished ? 'from-amber-500 to-orange-600' : 'from-indigo-500 to-purple-600'} rounded-3xl p-6 text-white shadow-xl relative overflow-hidden transition-all duration-700`}>
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-1">
            <p className="text-white/80 text-sm font-medium">{isFinished ? 'Logros Finales' : 'Coach IA'}</p>
            {!isFinished && (
              <div className="flex items-center gap-2">
                <button onClick={() => fetchMessage(true)} disabled={loadingAi} className={`p-1.5 bg-white/10 rounded-full hover:bg-white/20 ${loadingAi ? 'animate-spin opacity-50' : ''}`}>
                  <RefreshCw className="w-3 h-3" strokeWidth={3} />
                </button>
                <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest">{consistency.count}/7 Días</p>
              </div>
            )}
          </div>
          {!isFinished && (
            <div className="w-full h-1 bg-white/10 rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-amber-400 transition-all duration-1000" style={{ width: `${consistency.percentage}%` }}></div>
            </div>
          )}

          <div className="min-h-[4rem] flex items-center">
            {loadingAi ? (
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
            ) : (
              <h2 className="text-xl font-bold italic leading-tight">
                {isFinished ? `¡Reto completado, ${user.pseudonym}! Has logrado una transformación increíble de ${user.totalWeightLoss.toFixed(1)}kg.` : aiMessage}
              </h2>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/5">
              <p className="text-[10px] text-white/70 uppercase font-bold">Puntos Finales</p>
              <p className="text-xl font-bold">{user.totalPoints} pts</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/5">
              <p className="text-[10px] text-white/70 uppercase font-bold">Variación Total</p>
              <p className="text-xl font-bold">{user.totalWeightLoss.toFixed(1)} kg</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de Evolución */}
      <div className="card rounded-3xl p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-500" />
          Tu Historial Visual
        </h3>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="28%">
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#9aa3b2' }}
              />
              <Tooltip
                contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: '12px' }}
                itemStyle={{ fontWeight: 'bold', color: '#7c3aed' }}
                cursor={{ fill: 'rgba(124,58,237,0.07)' }}
              />
              {/* Una barra por pesaje: la altura es la pérdida acumulada. La más
                  reciente va destacada en violeta, el resto en lavanda claro. */}
              <Bar dataKey="pérdida" radius={[7, 7, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={i === chartData.length - 1 ? '#7c3aed' : '#ddd6fe'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Formulario de Registro o Mensaje de Cierre */}
      <div className="card rounded-3xl p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
           <PenLine className="w-5 h-5 text-indigo-500" />
          {isFinished ? 'Reto Finalizado' : 'Registro Diario'}
        </h3>
        
        {isFinished ? (
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 text-center">
            <div className="text-4xl mb-3">🏁</div>
            <p className="text-slate-800 font-bold text-lg mb-1">¡Periodo cerrado!</p>
            <p className="text-slate-500 text-sm">El tiempo de este reto ha terminado. Consulta el ranking para ver quién ha ganado el premio.</p>
          </div>
        ) : hasRegisteredToday ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-lg shadow-emerald-100">✓</div>
            <p className="text-emerald-800 font-bold text-lg mb-1">¡Peso guardado!</p>
            <p className="text-emerald-600 text-sm">Ya has cumplido con tu registro hoy. ¡Vuelve mañana!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type="number" step="0.1" inputMode="decimal" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} placeholder="Tu peso hoy..." className="w-full bg-slate-50 border-none rounded-2xl py-3.5 px-5 text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500 transition-all outline-none" />
                <span className="absolute right-4 top-3.5 text-slate-400 font-bold">kg</span>
              </div>
              <button type="submit" className="btn-primary text-white font-bold py-3.5 px-6 rounded-2xl hover:brightness-110 active:scale-95 transition-all">Enviar</button>
            </div>
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl cursor-pointer select-none active:bg-slate-100 transition-colors border border-transparent active:border-slate-200">
              <input type="checkbox" checked={ateOut} onChange={(e) => setAteOut(e.target.checked)} className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-700">¿Comiste fuera ayer?</p>
                <p className="text-[10px] text-indigo-500 uppercase font-bold tracking-tight">¡Bono Social de +50 pts!</p>
              </div>
              <span className="text-2xl">🍽️</span>
            </label>
          </form>
        )}
      </div>

      {/* Histórico de Datos */}
      <div className="card rounded-3xl p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-500" />
          Registros Pasados
        </h3>
        <div className="space-y-3">
          {[...user.history].reverse().map((entry) => (
            <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-slate-100/50">
              <div className="flex items-center gap-3">
                <div className="bg-white w-10 h-10 rounded-xl flex flex-col items-center justify-center shadow-sm border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-indigo-600 leading-none">{formatDate(entry.date).split(' ')[1]}</span>
                  <span className="text-sm font-bold text-slate-800 leading-tight">{formatDate(entry.date).split(' ')[0]}</span>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">{entry.weight.toFixed(1)} kg</p>
                  <p className={`text-[10px] font-bold uppercase ${entry.delta <= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {entry.delta > 0 ? '+' : ''}{entry.delta.toFixed(1)} kg {entry.ateOut ? ' • 🍽️' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-indigo-600">+{entry.points}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Puntos</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200/50 relative overflow-hidden">
            <div className="flex items-center gap-3 relative z-10">
              <div className="grad-brand w-10 h-10 rounded-xl flex flex-col items-center justify-center shadow-sm text-white">
                <span className="text-[10px] font-black uppercase leading-none opacity-80">{formatDate(config.startDate).split(' ')[1]}</span>
                <span className="text-sm font-bold leading-tight">{formatDate(config.startDate).split(' ')[0]}</span>
              </div>
              <div><p className="text-sm font-black text-slate-800">{user.initialWeight.toFixed(1)} kg</p><p className="text-[10px] font-bold uppercase text-indigo-600 flex items-center gap-1">🚩 Punto de Partida</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
