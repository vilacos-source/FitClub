#!/usr/bin/env node
/**
 * Sonda de REGLAS, sin crear cuentas.
 *
 * Responde a dos preguntas que hay que contestar cada vez que se publican
 * reglas nuevas, sin tener que tocar la consola ni ensuciar el proyecto:
 *
 *   1. ¿Han entrado realmente las reglas nuevas? (publicar no es publicar:
 *      que el editor diga «Publicado» no prueba nada; hay que hacer la peticion)
 *   2. ¿Sigue cerrada la fuga de datos personales?
 *
 * Usa una ANONIMIZACION de la clave publica de Firebase, no una cuenta real:
 * `signInWithPassword` con un email aleatorio devuelve INVALID_LOGIN_CREDENTIALS
 * o EMAIL_NOT_FOUND — eso Y A BORDO del intento, incluso con las reglas puestas
 * a `allow read, write: if false` — pero deja `request.auth == null`, que es lo
 * que necesitamos para comprobar que las reglas cortan al que no tiene sesion.
 *
 * Como usar (desde la raiz del proyecto, con node_modules instalados):
 *
 *   node scripts/probe-rules.mjs
 *
 * Sale con codigo != 0 si alguna comprobacion FALLA, asi que sirve en CI.
 *
 * Para verificar con una IDENTIDAD REAL (que el dueno lee lo suyo, que la
 * cuenta privada esta cerrada, etc.) usa la sonda con cuenta — el spec de
 * privacidad de la bateria de Playwright, que si se limpia solo.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PUBLIC_COLLECTION = process.env.PUBLIC_COLLECTION || 'leaderboard';
const PRIVATE_COLLECTION = process.env.PRIVATE_COLLECTION || 'users';

// Config del proyecto: el fichero que genera el asistente de Firebase, o
// las variables de entorno si se pasa a otro proyecto.
function loadConfig() {
  const fromEnv = {
    apiKey: process.env.FIREBASE_API_KEY,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID,
  };
  if (fromEnv.apiKey && fromEnv.projectId) return fromEnv;

  for (const f of ['firebase-applet-config.json', 'firebaseConfig.json']) {
    const p = path.join(process.cwd(), f);
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      /* siguiente */
    }
  }
  console.error('No encuentro la config de Firebase (firebase-applet-config.json) ni las variables de entorno.');
  process.exit(2);
}

const cfg = loadConfig();

async function attempt(promise) {
  try {
    const r = await promise;
    return { allowed: true, size: r?.size ?? null };
  } catch (e) {
    return { allowed: false, code: String(e?.code ?? e?.message ?? e) };
  }
}

const resultados = [];
const check = (nombre, ok, detalle) => {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? 'OK  ' : 'FALLO'}  ${nombre}${detalle ? `\n        ${detalle}` : ''}`);
};

const app = initializeApp({ ...cfg, appId: cfg.appId }, `probe-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app, cfg.firestoreDatabaseId);

// Intento de sesion SIN crear cuenta: solo deja request.auth == null.
const email = `sonda${Date.now()}@example.com`;
try {
  await signInWithEmailAndPassword(auth, email, 'sonda-no-existe-123');
  console.log('AVISO: la sonda ha conseguido iniciar sesion con una cuenta que no deberia existir.');
} catch (e) {
  const code = String(e?.code ?? '');
  const esperado = ['auth/invalid-credential', 'auth/user-not-found', 'auth/invalid-login-credentials'];
  console.log(`Sin sesion (correcto: no hay cuenta). Codigo de Firebase: ${code || e?.message}`);
  if (code && !esperado.some(x => code.includes(x.split('/')[1]))) {
    console.log('  (codigo inesperado; puede que el proveedor Email/Contrasena este caido — revisa si los errores son de configuracion antes de atribuirlos a las reglas)');
  }
}
console.log('');

const privateList = await attempt(getDocs(collection(db, PRIVATE_COLLECTION)));
check(
  `la coleccion privada (${PRIVATE_COLLECTION}) NO se puede listar sin sesion`,
  !privateList.allowed,
  privateList.allowed
    ? 'SE PERMITE: los datos personales estan expuestos. Publica las reglas nuevas.'
    : `denegado (${privateList.code})`,
);

const privateDoc = await attempt(getDoc(doc(db, PRIVATE_COLLECTION, 'otro-usuario')));
check(
  `no se puede leer el documento privado de otro sin sesion`,
  !privateDoc.allowed,
  privateDoc.allowed ? 'SE PERMITE: fuga de datos personales.' : `denegado (${privateDoc.code})`,
);

const publicList = await attempt(getDocs(collection(db, PUBLIC_COLLECTION)));
// Esto puede dar denegado si la regla pide sesion (isSignedIn): tambien es correcto.
check(
  `la coleccion publica (${PUBLIC_COLLECTION}) responde a la peticion`,
  true,
  publicList.allowed
    ? `legible sin sesion, ${publicList.size} documentos`
    : `denegado sin sesion (${publicList.code}) — correcto si la regla es isSignedIn()`,
);

const settingsDoc = await attempt(getDoc(doc(db, 'settings', 'competition')));
check(
  'la configuracion del reto se puede leer (la landing muestra las fechas)',
  settingsDoc.allowed,
  settingsDoc.allowed ? 'legible' : `denegado (${settingsDoc.code}) — si la landing debe mostrar fechas, la regla de read esta de mas cerrada`,
);

console.log('\n--- Comprobacion manual pendiente ---');
console.log('Estas comprobaciones son sin sesion. Para probar con identidad real');
console.log('(el dueno lee lo suyo, no puede auto-ascenderse, no puede tocar settings)');
console.log('usa el spec de privacidad de la bateria de Playwright, que se limpia solo.');

await deleteApp(app);

const fallos = resultados.filter(r => !r.ok);
console.log(`\n${resultados.length - fallos.length}/${resultados.length} correctas`);
process.exit(fallos.length ? 1 : 0);
