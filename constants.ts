
import { Rule, User } from './types';

export const COMPETITION_CONFIG = {
  startDate: '2024-05-01',
  endDate: '2024-06-30',
  prizeDescription: 'Cena gourmet pagada por los perdedores'
};

export const FRUITS = [
  'apple', 'banana', 'orange', 'strawberry', 'watermelon', 
  'pineapple', 'pear', 'grape', 'kiwi', 'mango', 'cherry', 
  'peach', 'avocado', 'lemon', 'blueberry', 'pomegranate'
];

export const INITIAL_RULES: Rule[] = [
  {
    id: 'loss_point',
    title: 'Pérdida de Peso',
    description: 'Por cada 100g perdidos respecto al peso anterior.',
    points: 10,
    type: 'reward'
  },
  {
    id: 'gain_penalty',
    title: 'Ganancia de Peso',
    description: 'Por cada 100g ganados respecto al peso anterior.',
    points: -15,
    type: 'penalty'
  },
  {
    id: 'maintenance',
    title: 'Mantenimiento',
    description: 'Si no has perdido peso pero te has mantenido exactamente igual (±100g). Es mucho mejor que ganar peso.',
    points: 5,
    type: 'reward'
  },
  {
    id: 'early_bird',
    title: 'Madrugador',
    description: 'Bono por registrar el peso antes de las 10:00 AM.',
    points: 5,
    type: 'reward'
  },
  {
    id: 'super_consistency',
    title: 'Súper Constancia',
    description: 'Bono importante por registrar el peso durante 7 días seguidos.',
    points: 50,
    type: 'reward'
  },
  {
    id: 'streak_loss',
    title: 'Racha de Éxito',
    description: 'Bono extra por cada 3 registros consecutivos de pérdida de peso.',
    points: 20,
    type: 'reward'
  },
  {
    id: 'ate_out_bonus',
    title: 'Bono Social',
    description: 'Bono extra si el día anterior realizaste comida o cena fuera de casa.',
    points: 50,
    type: 'reward'
  },
  {
    id: 'milestone_1kg',
    title: 'Hito 1kg',
    description: 'Al alcanzar cada kilo de pérdida total acumulada.',
    points: 100,
    type: 'reward'
  }
];

export const MOCK_USERS: User[] = [
  {
    id: '1',
    pseudonym: 'LinceVeloz',
    realName: 'Carlos',
    avatar: 'https://img.icons8.com/fluency/200/apple.png',
    initialWeight: 85,
    totalPoints: 450,
    totalWeightLoss: 2.5,
    isAdmin: true,
    history: [
      { id: 'h1', date: '2024-05-01', weight: 85, delta: 0, points: 0 },
      { id: 'h2', date: '2024-05-08', weight: 84.2, delta: -0.8, points: 130 },
      { id: 'h3', date: '2024-05-15', weight: 82.5, delta: -1.7, points: 320 }
    ]
  },
  {
    id: '2',
    pseudonym: 'MariposaAzul',
    realName: 'Elena',
    avatar: 'https://img.icons8.com/fluency/200/strawberry.png',
    initialWeight: 70,
    totalPoints: 450,
    totalWeightLoss: 2.1,
    history: [
      { id: 'h4', date: '2024-05-01', weight: 70, delta: 0, points: 0 },
      { id: 'h5', date: '2024-05-08', weight: 69.5, delta: -0.5, points: 100 },
      { id: 'h6', date: '2024-05-15', weight: 67.9, delta: -1.6, points: 350 }
    ]
  },
  {
    id: '3',
    pseudonym: 'RocaFuerte',
    realName: 'David',
    avatar: 'https://img.icons8.com/fluency/200/banana.png',
    initialWeight: 95,
    totalPoints: 120,
    totalWeightLoss: 0.5,
    history: [
      { id: 'h7', date: '2024-05-01', weight: 95, delta: 0, points: 0 },
      { id: 'h8', date: '2024-05-08', weight: 95.5, delta: 0.5, points: -75 },
      { id: 'h9', date: '2024-05-15', weight: 94.5, delta: -1.0, points: 195 }
    ]
  }
];
