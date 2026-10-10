
import React, { useState, useEffect } from 'react';
import { User, PublicProfile, PrivateData, RankedUser, WeighIn, CompetitionConfig } from './types';
import { INITIAL_RULES, FRUITS } from './constants';
import TopNav from './components/TopNav';
import Dashboard from './components/Dashboard';
import Leaderboard from './components/Leaderboard';
import Rules from './components/Rules';
import AdminSettings from './components/AdminSettings';
import LandingPage from './components/LandingPage';

// Firebase imports
import { db, auth, handleFirestoreError, OperationType, publicProfileRef, privateDataRef, PUBLIC_COLLECTION } from './services/firebase';
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

/**
 * Emails con permisos de administrador.
 *
 * Debe coincidir con la lista `adminEmails()` de `firestore.rules`.
 * Las reglas de Firestore no permiten que un usuario se auto-nombre admin
 * (sería una escalada de privilegios), así que serlo se decide por esta lista.
 * Debe coincidir también con `ADMIN_EMAILS` en `services/firebase.ts`.
 */
const ADMIN_EMAILS = ['vilacos@gmail.com'];

type View = 'dashboard' | 'leaderboard' | 'rules' | 'admin' | 'welcome';

// En qué pestaña estaba la app. Vive en `sessionStorage` a propósito:
// - sobrevive a recargar la página, que es lo que pasa al abrirla de nuevo;
// - se borra al cerrar la pestaña, así que no se hereda entre usuarios distintos
//   en un mismo navegador compartido.
const SESSION_VIEW_KEY = 'fitclub:view';

/** Pestaña guardada, o `dashboard` (Inicio) si no hay ninguna válida. */
const vistaInicial = (): View => {
  try {
    const v = sessionStorage.getItem(SESSION_VIEW_KEY);
    const validas: View[] = ['dashboard', 'leaderboard', 'rules', 'admin'];
    return validas.includes(v as View) ? (v as View) : 'dashboard';
  } catch {
    return 'dashboard';
  }
};

const App: React.FC = () => {
  const [users, setUsers] = useState<PublicProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<View>(vistaInicial);
  const [isLoading, setIsLoading] = useState(true);
  const [competitionConfig, setCompetitionConfig] = useState<CompetitionConfig | null>(null);
  // Solo para administradores: mapa uid → nombre real, traído de la colección
  // privada `users`. Sin esto, el admin no podría ver los nombres reales.
  const [adminRealNames, setAdminRealNames] = useState<Record<string, string>>({});

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
        // El usuario está logueado. Sus datos viven en dos sitios:
        //  - `leaderboard/{uid}` → perfil público
        //  - `users/{uid}`       → datos privados (nombre real, historial)
        try {
          const [pubSnap, privSnap] = await Promise.all([
            getDoc(publicProfileRef(firebaseUser.uid)),
            getDoc(privateDataRef(firebaseUser.uid)),
          ]);
          if (pubSnap.exists()) {
            const priv: PrivateData = privSnap.exists()
              ? (privSnap.data() as PrivateData)
              : { realName: '', history: [] };
            setCurrentUser({
              id: firebaseUser.uid,
              ...(pubSnap.data() as Omit<PublicProfile, 'id'>),
              ...priv,
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setCurrentUser(null);
        setActiveView('welcome');
        try { sessionStorage.removeItem(SESSION_VIEW_KEY); } catch { /* da igual */ }
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Escuchar Ranking y Configuración en tiempo real
  useEffect(() => {
    // Escuchar Configuración del Reto (Público).
    // Si el documento no existe usamos un valor por defecto local: la app NUNCA
    // debe quedarse bloqueada esperando algo que puede no existir todavía.
    const defaultConfig: CompetitionConfig = {
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      prizeDescription: "Configura el premio en ajustes",
    };

    const unsubConfig = onSnapshot(doc(db, "settings", "competition"), (docSnap) => {
      if (docSnap.exists()) {
        setCompetitionConfig(docSnap.data() as CompetitionConfig);
      } else {
        setCompetitionConfig(defaultConfig);
      }
    }, (error) => {
      // Un fallo de lectura de la config NO debe tumbar la app: usamos el
      // valor por defecto y dejamos el diagnóstico en consola.
      console.error("No se pudo leer settings/competition, usando valores por defecto:", error);
      setCompetitionConfig(defaultConfig);
    });

    let unsubUsers = () => {};

    // Escuchar el ranking (colección PÚBLICA). Solo si hay sesión.
    if (auth.currentUser) {
      const q = query(collection(db, PUBLIC_COLLECTION), orderBy("totalPoints", "desc"));
      unsubUsers = onSnapshot(q, (snapshot) => {
        const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PublicProfile));
        setUsers(usersData);

        if (auth.currentUser) {
          const me = usersData.find(u => u.id === auth.currentUser?.uid);
          // Solo refrescamos la parte pública: los datos privados (historial,
          // nombre real) vienen del otro documento y no deben pisarse.
          if (me) setCurrentUser((prev: User | null) => (prev ? { ...prev, ...me } : prev));
        }
      }, (error) => {
        // No tumbamos la app por un fallo puntual de lectura del ranking.
        console.error("No se pudo leer el ranking:", error);
      });
    }

    return () => {
      unsubUsers();
      unsubConfig();
    };
  }, [isLoading, auth.currentUser?.uid]); // Re-run when auth loading finishes or auth user changes

  // 3. Recordar en qué pestaña está. Al recargar la app se vuelve a la misma,
  // en vez de arrancar en una vista que no pinta nada.
  useEffect(() => {
    if (!currentUser) return;
    try { sessionStorage.setItem(SESSION_VIEW_KEY, activeView); } catch { /* da igual */ }
  }, [activeView, currentUser]);

  // 3. Solo para administradores: traer los nombres reales desde la colección
  // privada. Se hace aparte justamente porque NO pueden estar en el documento
  // público (cualquier usuario con sesión podría leerlos).
  const userIdsKey = users.map(u => u.id).join(',');
  useEffect(() => {
    if (!currentUser?.isAdmin || !userIdsKey) {
      setAdminRealNames({});
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = userIdsKey.split(',');
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const snap = await getDoc(privateDataRef(id));
            return [id, snap.exists() ? String((snap.data() as PrivateData).realName ?? '') : ''] as const;
          } catch {
            return [id, ''] as const; // sin permiso o sin documento: no rompemos la vista
          }
        }),
      );
      if (!cancelled) setAdminRealNames(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.isAdmin, userIdsKey]);

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

    const newHistory = [...currentUser.history, newWeighIn];
    const newTotalPoints = Math.max(0, currentUser.totalPoints + earnedPoints);

    // PERSISTENCIA EN FIRESTORE — en dos documentos, cada uno con lo suyo:
    //  - `users/{uid}`       → el historial de pesajes (privado)
    //  - `leaderboard/{uid}` → los totales que ve el ranking (público)
    try {
      await updateDoc(privateDataRef(currentUser.id), { history: newHistory });
      await updateDoc(publicProfileRef(currentUser.id), {
        totalPoints: newTotalPoints,
        totalWeightLoss: newLoss,
      });
      setCurrentUser({
        ...currentUser,
        history: newHistory,
        totalPoints: newTotalPoints,
        totalWeightLoss: newLoss,
      });
      alert(`¡Peso registrado! +${earnedPoints} pts.\n${messages.join('\n')}`);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.id}`);
    }
  };

  const handleRegister = async (userData: { realName: string, pseudonym: string, initialWeight: number }) => {
    // El alta en Firebase Auth se hace en LandingPage. Esta función se llama
    // después y crea los DOS documentos del usuario:
    //  - `leaderboard/{uid}` → datos públicos (lo que ve el ranking)
    //  - `users/{uid}`       → datos privados (nombre real + historial)
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];

    const publicProfile: Omit<PublicProfile, 'id'> = {
      pseudonym: userData.pseudonym,
      avatar: `https://img.icons8.com/fluency/200/${fruit}.png`,
      initialWeight: userData.initialWeight,
      totalPoints: 0,
      totalWeightLoss: 0,
      // Ser admin se decide por el email de la cuenta (ver ADMIN_EMAILS).
      // Antes era `users.length === 0`, que no funcionaba: `users` solo se
      // rellenaba para usuarios ya logueados, así que nunca valía 0 en el
      // primer registro y el admin no se creaba nunca.
      isAdmin: ADMIN_EMAILS.includes(auth.currentUser.email ?? ''),
    };

    const privateData: PrivateData = {
      realName: userData.realName,
      history: [],
    };

    try {
      await setDoc(publicProfileRef(uid), publicProfile);
      await setDoc(privateDataRef(uid), privateData);
      setCurrentUser({ id: uid, ...publicProfile, ...privateData });
      setActiveView('dashboard');
      // La app quedó abierta en ESTA pestaña durante la sesión, así que al
      // volver entra directamente en el panel en vez de en una pantalla vacía.
      try { sessionStorage.setItem(SESSION_VIEW_KEY, 'dashboard'); } catch { /* da igual */ }
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${uid}`);
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
    // Al salir, la app vuelve a empezar: la próxima persona que entre en este
    // navegador no hereda la pestaña donde estaba la anterior.
    try { sessionStorage.removeItem(SESSION_VIEW_KEY); } catch { /* da igual */ }
    setActiveView('dashboard');
    signOut(auth);
  };

  // Lista que consume la interfaz: datos públicos siempre y, para un admin,
  // el nombre real traído aparte de la colección privada.
  const rankedUsers: RankedUser[] = users.map(u => ({
    ...u,
    realName: adminRealNames[u.id],
  }));

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
          <Leaderboard users={rankedUsers} currentUser={currentUser} config={competitionConfig} />
        )}
        {activeView === 'rules' && (
          <Rules rules={INITIAL_RULES} />
        )}
        {activeView === 'admin' && currentUser.isAdmin && (
          <AdminSettings 
            config={competitionConfig} onUpdateConfig={handleUpdateConfig} 
            users={rankedUsers} 
            onRemoveUser={async (id) => {
              if (confirm("¿Estás seguro de que quieres eliminar a este usuario?")) {
                try {
                  // Hay que borrar los dos documentos: el público y el privado.
                  await deleteDoc(privateDataRef(id));
                  await deleteDoc(publicProfileRef(id));
                } catch (e) {
                  handleFirestoreError(e, OperationType.DELETE, `users/${id}`);
                }
              }
            }} 
            onAddUser={async (data) => {
              // Crea un participante "de relleno", sin cuenta de acceso: podrá
              // verlo el admin pero esa persona no podrá entrar hasta que se
              // registre ella misma desde la pantalla de inicio.
              const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
              const id = Math.random().toString(36).substr(2, 9);
              const publicProfile: Omit<PublicProfile, 'id'> = {
                pseudonym: data.pseudonym,
                avatar: `https://img.icons8.com/fluency/200/${fruit}.png`,
                initialWeight: data.initialWeight,
                totalPoints: 0,
                totalWeightLoss: 0,
                isAdmin: false,
              };
              const privateData: PrivateData = {
                realName: data.realName,
                history: [],
              };
              try {
                await setDoc(publicProfileRef(id), publicProfile);
                await setDoc(privateDataRef(id), privateData);
              } catch (e) {
                handleFirestoreError(e, OperationType.CREATE, `users/${id}`);
              }
            }} 
            onToggleAdmin={async (id) => {
              const user = users.find(u => u.id === id);
              if (user) {
                try {
                  // El rol vive en el documento público (lo necesita el ranking).
                  await updateDoc(publicProfileRef(id), { isAdmin: !user.isAdmin });
                } catch (e) {
                  handleFirestoreError(e, OperationType.UPDATE, `leaderboard/${id}`);
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
