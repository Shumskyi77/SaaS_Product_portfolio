export type TamagotchiBreed = 'shiba' | 'labrador' | 'poodle' | 'husky' | 'cocker';

export type TamagotchiMood = 'happy' | 'playful' | 'hungry' | 'sad' | 'angry' | 'sleepy';

export interface TamagotchiHistoryItem {
  id: string;
  name: string;
  breed: TamagotchiBreed;
  adoptedAt: string;
  deceasedAt?: string;
  causeOfDeath?: string;
  daysLived: number;
}

export interface TamagotchiState {
  id: string;
  name: string;
  breed: TamagotchiBreed;
  adoptedAt: string; // ISO string
  isAlive: boolean;
  health: number; // 0 - 100
  happiness: number; // 0 - 100
  deceasedAt?: string;
  causeOfDeath?: string;
  consecutiveUnderfedDays: number;
  needsPunishmentDay: boolean;
  punishmentCompleted: boolean;
  usedNames: string[];
  pastPets: TamagotchiHistoryItem[];
  collapsedWidget?: boolean;
  lastInteraction?: string;
  gamesPlayed?: number;
  ballsFetched?: number;
  lastPlayedAt?: string;
}

export interface BreedInfo {
  id: TamagotchiBreed;
  name: string;
  trait: string;
  badge: string;
  description: string;
  bgGradient: string;
}

export const TAMAGOTCHI_BREEDS: BreedInfo[] = [
  {
    id: 'shiba',
    name: 'Shiba Inu',
    trait: 'Proud • Loyal',
    badge: 'Proud',
    description: 'Loves tasty food and is proud of your shared victories.',
    bgGradient: 'from-amber-100/90 to-orange-50/70',
  },
  {
    id: 'labrador',
    name: 'Labrador',
    trait: 'Good-natured • Devoted',
    badge: 'Good-natured',
    description: 'The most loyal companion, happy about every healthy meal.',
    bgGradient: 'from-emerald-100/90 to-teal-50/70',
  },
  {
    id: 'poodle',
    name: 'Poodle',
    trait: 'Smart • Stylish',
    badge: 'Smart',
    description: 'Keeps an eye on the perfect balance of protein and vitamins.',
    bgGradient: 'from-purple-100/90 to-pink-50/70',
  },
  {
    id: 'husky',
    name: 'Husky',
    trait: 'Energetic • Free-spirited',
    badge: 'Energetic',
    description: 'A restless bundle of energy who loves active workouts.',
    bgGradient: 'from-sky-100/90 to-blue-50/70',
  },
  {
    id: 'cocker',
    name: 'Cocker Spaniel',
    trait: 'Sweetie • Affectionate',
    badge: 'Sweetie',
    description: 'A cute and affectionate puppy who loves care and a meal routine.',
    bgGradient: 'from-rose-100/90 to-amber-50/70',
  },
];
