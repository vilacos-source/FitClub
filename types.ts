
export interface WeighIn {
  id: string;
  date: string;
  weight: number;
  delta: number; // weight change from previous
  points: number; // points earned/lost in this entry
  ateOut?: boolean; // whether the user ate out the previous day
}

export interface CompetitionConfig {
  startDate: string;
  endDate: string;
  prizeDescription: string;
}

/**
 * Datos PÚBLICOS de un participante. Van en la colección `leaderboard`, que
 * cualquier usuario con sesión puede leer (es lo que alimenta el ranking).
 *
 * REGLA DE ORO: aquí NUNCA puede ir nada personal. Firestore no permite ocultar
 * campos en una consulta — si el documento es legible, lo son todos sus campos.
 */
export interface PublicProfile {
  id: string;
  pseudonym: string;
  avatar: string;
  initialWeight: number;
  totalPoints: number;
  totalWeightLoss: number;
  isAdmin: boolean;
}

/**
 * Datos PRIVADOS de un participante. Van en la colección `users`, legible solo
 * por su dueño y por los administradores.
 */
export interface PrivateData {
  realName: string;
  history: WeighIn[];
}

/** Perfil completo (público + privado). Solo para el propio usuario o un admin. */
export interface User extends PublicProfile, PrivateData {}

/**
 * Entrada de ranking: siempre los datos públicos y, solo cuando quien mira es
 * admin, el nombre real. `realName` es opcional justo por eso.
 */
export type RankedUser = PublicProfile & Partial<PrivateData>;

export interface AppState {
  users: User[];
  currentUser: string | null;
  periodEndDate: string;
  rules: Rule[];
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  points: number;
  type: 'reward' | 'penalty';
}
