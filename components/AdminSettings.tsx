
import React, { useState } from 'react';
import { Trash2, ShieldCheck, ShieldAlert, Plus } from 'lucide-react';
import { CompetitionConfig, RankedUser } from '../types';

interface AdminSettingsProps {
  config: CompetitionConfig;
  onUpdateConfig: (newConfig: CompetitionConfig) => void;
  users: RankedUser[];
  onRemoveUser: (userId: string) => void;
  onAddUser: (userData: { realName: string, pseudonym: string, initialWeight: number }) => void;
  onToggleAdmin: (userId: string) => void;
}

const AdminSettings: React.FC<AdminSettingsProps> = ({ config, onUpdateConfig, users, onRemoveUser, onAddUser, onToggleAdmin }) => {
  const [formData, setFormData] = useState<CompetitionConfig>(config);
  const [userToDelete, setUserToDelete] = useState<RankedUser | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [newUser, setNewUser] = useState({
    realName: '',
    pseudonym: '',
    initialWeight: ''
  });

  const handleSubmitConfig = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig(formData);
    alert('Configuración actualizada correctamente');
  };

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const weight = parseFloat(newUser.initialWeight.replace(',', '.'));
    if (newUser.realName && newUser.pseudonym && !isNaN(weight)) {
      onAddUser({
        realName: newUser.realName,
        pseudonym: newUser.pseudonym,
        initialWeight: weight
      });
      setNewUser({ realName: '', pseudonym: '', initialWeight: '' });
      setShowAddForm(false);
      alert('Participante añadido con éxito');
    }
  };

  const confirmDelete = () => {
    if (userToDelete) {
      onRemoveUser(userToDelete.id);
      setUserToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-20 px-2 relative">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
        <p className="text-sm text-slate-500">Gestión del periodo y participantes</p>
      </div>

      {/* Configuración del Reto */}
      <form onSubmit={handleSubmitConfig} className="space-y-4">
        <div className="card p-6 rounded-3xl space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b pb-2 mb-2">Configuración General</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Inicio</label>
              <input 
                type="date" 
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fin</label>
              <input 
                type="date" 
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Premio</label>
            <textarea 
              value={formData.prizeDescription}
              onChange={(e) => setFormData({ ...formData, prizeDescription: e.target.value })}
              rows={2}
              className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              placeholder="Ej: Cena pagada..."
            />
          </div>
          <button type="submit" className="w-full bg-slate-800 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-slate-900 transition-all">
            Actualizar Reto
          </button>
        </div>
      </form>

      {/* Gestión de Participantes */}
      <div className="card p-6 rounded-3xl space-y-4">
        <div className="flex justify-between items-center border-b pb-2 mb-2">
          <h3 className="text-sm font-bold text-slate-800">Participantes</h3>
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1"
          >
            {showAddForm ? 'Cancelar' : <><Plus className="w-3 h-3" /> Añadir</>}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddUserSubmit} className="bg-indigo-50/50 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
            <input 
              placeholder="Nombre Real (ej: Carlos)"
              value={newUser.realName}
              onChange={(e) => setNewUser({...newUser, realName: e.target.value})}
              className="w-full bg-white border-none rounded-xl py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <input 
              placeholder="Pseudónimo (ej: LinceVeloz)"
              value={newUser.pseudonym}
              onChange={(e) => setNewUser({...newUser, pseudonym: e.target.value})}
              className="w-full bg-white border-none rounded-xl py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <div className="relative">
              <input 
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder="Peso inicial"
                value={newUser.initialWeight}
                onChange={(e) => setNewUser({...newUser, initialWeight: e.target.value})}
                className="w-full bg-white border-none rounded-xl py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <span className="absolute right-3 top-2 text-slate-400 text-xs font-bold">kg</span>
            </div>
            <button type="submit" className="w-full btn-primary text-white text-sm font-bold py-2 rounded-xl">
              Registrar Participante
            </button>
          </form>
        )}

        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src={user.avatar} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                  {user.isAdmin && (
                    <span className="absolute -top-1 -right-1 bg-amber-400 text-white p-0.5 rounded-full border border-white">
                      <ShieldCheck className="w-2 h-2" />
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{user.pseudonym}</p>
                  <p className="text-[9px] text-slate-400 font-medium uppercase">{user.realName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => onToggleAdmin(user.id)}
                  title={user.isAdmin ? "Quitar Admin" : "Hacer Admin"}
                  className={`p-2 rounded-xl transition-colors ${user.isAdmin ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}
                >
                  {user.isAdmin ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setUserToDelete(user)} 
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de Confirmación de Borrado */}
      {userToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="card-modal w-full max-w-xs rounded-[2rem] p-6 scale-in-center">
            <h3 className="text-center text-lg font-bold text-slate-800 mb-2">¿Dar de baja?</h3>
            <p className="text-center text-xs text-slate-500 mb-6">
              Vas a eliminar a <span className="font-bold text-slate-700">{userToDelete.pseudonym}</span>. Se perderá todo su historial de puntos.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={confirmDelete} className="w-full bg-rose-600 text-white font-bold py-2.5 rounded-xl active:scale-95 transition-all">Eliminar definitivamente</button>
              <button onClick={() => setUserToDelete(null)} className="w-full bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
