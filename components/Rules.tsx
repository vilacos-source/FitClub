import React from 'react';
import { Rule } from '../types';

interface RulesProps {
  rules: Rule[];
}

const Rules: React.FC<RulesProps> = ({ rules }) => {
  return (
    <div className="space-y-6 pb-20 px-2">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Reglas del Reto</h2>
        <p className="text-sm text-slate-500">Cómo ganar y perder puntos</p>
      </div>

      <div className="grid gap-4">
        {rules.map((rule) => (
          <div 
            key={rule.id}
            className={`p-5 rounded-3xl border transition-all ${
              rule.type === 'reward' 
              ? 'bg-emerald-50 border-emerald-100 shadow-sm' 
              : 'bg-rose-50 border-rose-100 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-slate-800">{rule.title}</h4>
              <span className={`text-sm font-black px-3 py-1 rounded-full ${
                rule.type === 'reward' ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'
              }`}>
                {rule.points > 0 ? `+${rule.points}` : rule.points}
              </span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {rule.description}
            </p>
          </div>
        ))}
      </div>

      <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100">
        <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
          <span>⚖️</span> Criterio de Desempate
        </h3>
        <p className="text-sm text-amber-800/80 leading-relaxed">
          Si dos personas tienen los mismos puntos, el sistema posicionará primero a quien tenga un <strong>mayor porcentaje de pérdida total</strong> respecto a su peso inicial. 
          Es la forma más justa de valorar el esfuerzo independientemente del punto de partida de cada uno.
        </p>
      </div>

      <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
        <h3 className="font-bold text-indigo-900 mb-2 italic">Filosofía FitClub</h3>
        <p className="text-sm text-indigo-800/80 leading-relaxed">
          Este reto no se trata de quién es el más delgado, sino de quién se esfuerza más por mejorar su salud. Los puntos recompensan la constancia y el progreso relativo. 
          <strong> ¡Tu único rival real es quien fuiste ayer!</strong>
        </p>
      </div>
    </div>
  );
};

export default Rules;