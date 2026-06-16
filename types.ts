
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

export interface User {
  id: string;
  pseudonym: string;
  realName: string;
  avatar: string;
  initialWeight: number;
  history: WeighIn[];
  totalPoints: number;
  totalWeightLoss: number;
  isAdmin?: boolean;
}

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
