
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// CRITICAL: Use the firestoreDatabaseId from the config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

/**
 * Reparto de datos entre dos colecciones.
 *
 * - `leaderboard` → datos PÚBLICOS (pseudónimo, avatar, puntos, kg perdidos).
 *   Lo lee cualquiera con sesión: es lo que alimenta el ranking.
 * - `users` → datos PRIVADOS (nombre real, historial de pesajes). Solo su
 *   dueño y los administradores.
 *
 * No mezclarlos NUNCA: Firestore no oculta campos en una consulta, así que todo
 * lo que esté en un documento público lo puede descargar cualquier usuario.
 */
export const PUBLIC_COLLECTION = 'leaderboard';
export const PRIVATE_COLLECTION = 'users';

export const publicProfileRef = (uid: string) => doc(db, PUBLIC_COLLECTION, uid);
export const privateDataRef = (uid: string) => doc(db, PRIVATE_COLLECTION, uid);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const errString = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errString);
  throw new Error(errString);
}
