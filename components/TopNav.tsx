
import React from 'react';
import { User } from '../types';

interface TopNavProps {
  currentUser: User | null;
  onLogout: () => void;
}

const TopNav: React.FC<TopNavProps> = ({ currentUser, onLogout }) => {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-200">
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
            onClick={onLogout}
            className="w-10 h-10 rounded-full border-2 border-indigo-100 p-0.5 hover:scale-105 transition-transform relative group"
          >
            <img 
              src={currentUser.avatar} 
              alt={currentUser.pseudonym} 
              className="w-full h-full rounded-full object-cover"
            />
            {currentUser.isAdmin && (
              <span className="absolute -top-1 -right-1 bg-amber-400 text-[8px] text-white px-1 rounded-full font-bold">ADM</span>
            )}
          </button>
        </div>
      )}
    </nav>
  );
};

export default TopNav;
