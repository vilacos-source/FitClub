
import React, { useState, useEffect } from 'react';
import { User, WeighIn, CompetitionConfig } from './types';
import { INITIAL_RULES, FRUITS } from './constants';
import TopNav from './components/TopNav';
import Dashboard from './components/Dashboard';
import Leaderboard from './components/Leaderboard';
import Rules from './components/Rules';
import AdminSettings from './components/AdminSettings';
import LandingPage from './components/LandingPage';

// Firebase imports
import { db, auth, handleFirestoreError, OperationType } from './services/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDoc,
  getDocFromServer,
  query,
  orderBy 
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Home, Trophy, BookOpen, Settings } from 'lucide-react';

type View = 'dashboard' | 'leaderboard' | 'rules' | 'admin' | 'welcome';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [competitionConfig, setCompetitionConfig] = useState<CompetitionConfig | null>(null);

  // 1. Escuchar Cambios de Autenticación y Probar Conexión
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // El usuario está logueado, buscamos sus datos en Firestore
        try {
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setCurrentUser({ id: firebaseUser.uid, ...userSnap.data() } as User);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setCurrentUser(null);
        setActiveView('welcome');
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Escuchar Ranking y Configuración en tiempo real
  useEffect(() => {
    // Escuchar Configuración del Reto (Público)
    const unsubConfig = onSnapshot(doc(db, "settings", "competition"), (docSnap) => {
      if (docSnap.exists()) {
        setCompetitionConfig(docSnap.data() as CompetitionConfig);
      } else {
        setCompetitionConfig({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          prizeDescription: "Configura el premio en ajustes"
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/competition");
    });

    let unsubUsers = () => {};

    // Escuchar Usuarios (Solo si está logueado)
    if (auth.currentUser) {
      const q = query(collection(db, "users"), orderBy("totalPoints", "desc"));
      unsubUsers = onSnapshot(q, (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        setUsers(usersData);
        
        if (auth.currentUser) {
          const me = usersData.find(u => u.id === auth.currentUser?.uid);
          if (me) setCurrentUser(me);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "users");
      });
    }

    return () => {
      unsubUsers();
      unsubConfig();
    };
  }, [isLoading, auth.currentUser?.uid]); // Re-run when auth loading finishes or auth user changes

  const getLocalDate = (date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const handleAddWeight = async (weight: number, ateOut: boolean) => {
    if (!currentUser || !competitionConfig) return;

    const now = new Date();
    const todayStr = getLocalDate(now);
    const alreadyRegistered = currentUser.history.some(h => h.date === todayStr);

    if (alreadyRegistered) {
      alert("Ya has registrado tu peso hoy.");
      return;
    }

    const lastWeighIn = currentUser.history.length > 0 
      ? currentUser.history[currentUser.history.length - 1] 
      : { weight: currentUser.initialWeight, delta: 0, date: competitionConfig.startDate };
      
    const delta = weight - lastWeighIn.weight;
    let earnedPoints = 10; 
    const messages: string[] = [];

    if (delta <= -0.11) {
      earnedPoints += Math.floor(Math.abs(delta) * 100); 
    } else if (delta > 0.1) {
      earnedPoints -= Math.floor(delta * 150); 
    } else {
      earnedPoints += 5;
      messages.push("⚖️ ¡Bono Mantenimiento! (+5 pts)");
    }
    
    if (ateOut) {
      earnedPoints += 50;
      messages.push("🍽️ ¡Bono Social! (+50 pts)");
    }

    if (now.getHours() < 10) {
      earnedPoints += 5;
      messages.push("🌅 ¡Bono Madrugador! (+5 pts)");
    }

    const newLoss = currentUser.initialWeight - weight;
    const oldLoss = currentUser.totalWeightLoss;
    if (Math.floor(newLoss) > Math.floor(oldLoss) && newLoss > 0) {
      earnedPoints += 100;
      messages.push(`🎉 ¡HITO! Perder ${Math.floor(newLoss)}kg. (+100 pts)`);
    }

    const newWeighIn: WeighIn = {
      id: Math.random().toString(36).substr(2, 9),
      date: todayStr,
      weight: weight,
      delta: delta,
      points: earnedPoints,
      ateOut: ateOut
    };

    const updatedData = {
      history: [...currentUser.history, newWeighIn],
      totalPoints: Math.max(0, currentUser.totalPoints + earnedPoints),
      totalWeightLoss: newLoss
    };

    // PERSISTENCIA EN FIRESTORE
    try {
      await updateDoc(doc(db, "users", currentUser.id), updatedData);
      alert(`¡Peso registrado! +${earnedPoints} pts.\n${messages.join('\n')}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.id}`);
    }
  };

  const handleRegister = async (userData: { realName: string, pseudonym: string, initialWeight: number }) => {
    // La creación de usuario ahora se gestiona en LandingPage mediante Firebase Auth
    // Esta función se llama tras el éxito del Auth para crear el documento en Firestore
    const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const newUser: Omit<User, 'id'> = {
      realName: userData.realName,
      pseudonym: userData.pseudonym,
      initialWeight: userData.initialWeight,
      avatar: `https://img.icons8.com/fluency/200/${fruit}.png`,
      history: [],
      totalPoints: 0,
      totalWeightLoss: 0,
      isAdmin: users.length === 0 // El primero en entrar es Admin
    };

    if (auth.currentUser) {
      try {
        const userWithId = { id: auth.currentUser.uid, ...newUser } as User;
        await setDoc(doc(db, "users", auth.currentUser.uid), newUser);
        setCurrentUser(userWithId);
        setActiveView('dashboard');
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `users/${auth.currentUser.uid}`);
      }
    }
  };

  const handleUpdateConfig = async (newConfig: CompetitionConfig) => {
    try {
      await setDoc(doc(db, "settings", "competition"), newConfig);
      alert("Configuración global actualizada");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, "settings/competition");
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!currentUser || !competitionConfig) {
    return (
      <div className="min-h-screen bg-slate-50 max-w-md mx-auto shadow-2xl flex flex-col">
        <TopNav currentUser={null} onLogout={() => {}} />
        <main className="flex-1 p-4 overflow-y-auto">
          <LandingPage onRegister={handleRegister} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 max-w-md mx-auto shadow-2xl relative flex flex-col">
      <TopNav currentUser={currentUser} onLogout={handleLogout} />
      <main className="flex-1 p-4 overflow-y-auto">
        {activeView === 'dashboard' && (
          <Dashboard user={currentUser} leaderboard={users} onAddWeight={handleAddWeight} config={competitionConfig} />
        )}
        {activeView === 'leaderboard' && (
          <Leaderboard users={users} currentUser={currentUser} config={competitionConfig} />
        )}
        {activeView === 'rules' && (
          <Rules rules={INITIAL_RULES} />
        )}
        {activeView === 'admin' && currentUser.isAdmin && (
          <AdminSettings 
            config={competitionConfig} onUpdateConfig={handleUpdateConfig} 
            users={users} 
            onRemoveUser={async (id) => {
              if (confirm("¿Estás seguro de que quieres eliminar a este usuario?")) {
                try {
                  await deleteDoc(doc(db, "users", id));
                } catch (e) {
                  handleFirestoreError(e, OperationType.DELETE, `users/${id}`);
                }
              }
            }} 
            onAddUser={async (data) => {
              // Creating a placeholder doc without auth - for real usage they should use LandingPage
              // But if admin adds them, we create a doc with a random ID
              const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
              const id = Math.random().toString(36).substr(2, 9);
              const newUser: Omit<User, 'id'> = {
                realName: data.realName,
                pseudonym: data.pseudonym,
                initialWeight: data.initialWeight,
                avatar: `https://img.icons8.com/fluency/200/${fruit}.png`,
                history: [],
                totalPoints: 0,
                totalWeightLoss: 0,
                isAdmin: false
              };
              try {
                await setDoc(doc(db, "users", id), newUser);
              } catch (e) {
                handleFirestoreError(e, OperationType.CREATE, `users/${id}`);
              }
            }} 
            onToggleAdmin={async (id) => {
              const user = users.find(u => u.id === id);
              if (user) {
                try {
                  await updateDoc(doc(db, "users", id), { isAdmin: !user.isAdmin });
                } catch (e) {
                  handleFirestoreError(e, OperationType.UPDATE, `users/${id}`);
                }
              }
            }}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-slate-100 h-16 flex items-center justify-around px-2 pb-2 z-50">
        <button onClick={() => setActiveView('dashboard')} className={`flex flex-col items-center gap-1 flex-1 transition-all ${activeView === 'dashboard' ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}>
          <Home className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">Inicio</span>
        </button>
        <button onClick={() => setActiveView('leaderboard')} className={`flex flex-col items-center gap-1 flex-1 transition-all ${activeView === 'leaderboard' ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}>
          <Trophy className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">Ranking</span>
        </button>
        <button onClick={() => setActiveView('rules')} className={`flex flex-col items-center gap-1 flex-1 transition-all ${activeView === 'rules' ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}>
          <BookOpen className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">Reglas</span>
        </button>
        {currentUser.isAdmin && (
          <button onClick={() => setActiveView('admin')} className={`flex flex-col items-center gap-1 flex-1 transition-all ${activeView === 'admin' ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}>
            <Settings className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
};

export default App;
