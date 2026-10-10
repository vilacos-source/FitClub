
import React from 'react';
import { User, RankedUser, CompetitionConfig } from '../types';

interface LeaderboardProps {
  users: RankedUser[];
  currentUser: User | null;
  config: CompetitionConfig;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ users, currentUser, config }) => {
  const sortedUsers = [...users].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    const lossPctA = (a.totalWeightLoss / a.initialWeight) * 100;
    const lossPctB = (b.totalWeightLoss / b.initialWeight) * 100;
    return lossPctB - lossPctA;
  });

  const isAdmin = currentUser?.isAdmin;
  const isFinished = new Date().getTime() > new Date(config.endDate).getTime();

  const getDaysRemaining = () => {
    const end = new Date(config.endDate).getTime();
    const now = new Date().getTime();
    const diff = end - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return "Finalizado";
    if (days === 0) return "Finaliza hoy";
    if (days === 1) return "Queda 1 día";
    return `Finaliza en ${days} días`;
  };

  const winner = sortedUsers[0];

  return (
    <div className="space-y-4 pb-24 px-2">
      <style>{`
        @keyframes shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .winner-card {
          background: linear-gradient(90deg, #fbbf24, #fef3c7, #fbbf24);
          background-size: 200% auto;
          animation: shine 3s linear infinite;
        }
      `}</style>

      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Ranking</h2>
          <p className="text-sm text-slate-500">{isFinished ? 'Resultados Finales' : '¿Quién lidera el cambio?'}</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-tighter shadow-sm ${
          isFinished ? 'bg-indigo-600 text-white animate-pulse' : 'bg-amber-100 text-amber-700'
        }`}>
          {getDaysRemaining()}
        </span>
      </div>

      {isFinished && (
        <div className="winner-card p-6 rounded-[2.5rem] shadow-xl text-center mb-8 border-4 border-white transform hover:scale-[1.02] transition-transform">
          <div className="text-4xl mb-2">🏆</div>
          <h3 className="text-amber-900 font-black text-2xl uppercase tracking-tighter">¡Ganador Oficial!</h3>
          <div className="my-4 relative inline-block">
            <img 
              src={winner.avatar} 
              className="w-24 h-24 rounded-full border-4 border-white shadow-lg mx-auto"
              alt="Ganador"
            />
            <span className="absolute -bottom-2 -right-2 text-3xl">🥇</span>
          </div>
          <h4 className="text-xl font-bold text-amber-950">{winner.pseudonym}</h4>
          <p className="text-sm text-amber-900/70 font-bold uppercase">{winner.totalPoints} Puntos Totales</p>
        </div>
      )}

      <div className="space-y-3">
        {sortedUsers.map((user, index) => {
          const isTop3 = index < 3;
          const medals = ['🥇', '🥈', '🥉'];
          const lossPercentage = ((user.totalWeightLoss / user.initialWeight) * 100).toFixed(1);

          return (
            <div 
              key={user.id}
              className={`flex items-center gap-4 p-4 rounded-3xl transition-all border ${
                index === 0 
                  ? isFinished ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-100 scale-105 shadow-md z-10' 
                  : 'card'
              } ${user.id === currentUser?.id ? 'border-indigo-300 ring-1 ring-indigo-100' : ''}`}
            >
              <div className="relative">
                <img 
                  src={user.avatar} 
                  alt={user.pseudonym} 
                  className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                />
                {isTop3 && (
                  <span className="absolute -top-2 -right-2 text-lg">
                    {medals[index]}
                  </span>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-800">{user.pseudonym}</h4>
                  {isAdmin && (
                    <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                      {user.realName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${user.totalWeightLoss >= 0 ? 'bg-emerald-500' : 'bg-rose-400'}`}></div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                    {user.totalWeightLoss.toFixed(1)}kg ({lossPercentage}%)
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-lg font-black ${index === 0 ? 'text-indigo-600' : 'text-slate-800'}`}>
                  {user.totalPoints}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Puntos</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-[11px] text-amber-800 italic text-center">
        * En caso de empate a puntos, lidera quien tenga mayor % de pérdida sobre su peso inicial.
      </div>

      {isAdmin && (
        <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 text-[10px] text-slate-600 font-medium flex gap-2 items-center">
          <span className="text-base">🛡️</span>
          Modo Administrador: Los nombres reales son visibles solo para ti.
        </div>
      )}

      <div className="mt-8 bg-slate-900 rounded-3xl p-6 text-white overflow-hidden relative shadow-lg">
        <div className="relative z-10">
          <h3 className="text-lg font-bold mb-3">{isFinished ? 'Premio Entregado' : 'Premio Final'}</h3>
          <div className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <div className="w-10 h-10 bg-amber-400/20 rounded-xl flex items-center justify-center text-xl shadow-inner">
              🎁
            </div>
            <p className="text-sm text-slate-200 font-medium leading-tight">
              {config.prizeDescription}
            </p>
          </div>
          <p className="text-[10px] text-slate-400 mt-4 uppercase tracking-[0.2em] font-bold">
            Periodo: {new Date(config.startDate).toLocaleDateString()} - {new Date(config.endDate).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
