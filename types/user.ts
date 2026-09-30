export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  avatar?: string;
  avatarUrl?: string;
  friendCode?: string;
  gender: 'male' | 'female';
  age: number;
  height: number; // in cm
  currentWeight: number; // in kg
  targetWeight: number; // in kg
  weeklyGoal: number; // e.g., -0.5 kg/week
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
  dietType: 'Standard' | 'Keto' | 'Low_Carb' | 'Vegetarian' | 'Vegan';
  targetCalories: number;
  targetProtein: number;
  targetFat: number;
  targetCarbs: number;
  targetFiber: number;
  targetWater: number; // in ml
  streakDays: number;
  bmr?: number;
  tdee?: number;
  createdAt: string;
}

export interface WeightLogEntry {
  userId: string;
  date: string; // YYYY-MM-DD
  weight: number;
}
