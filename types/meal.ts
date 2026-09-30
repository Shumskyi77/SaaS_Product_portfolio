export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodItem {
  id: string;
  name: string;
  calories: number; // per 100g
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  servingSizeGrams: number;
  barcode?: string;
  category?: string;
}

export interface MealLog {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  type: MealType;
  title: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  portionGrams: number;
  time: string;
  imageUrl?: string;
  items?: FoodItem[];
  ingredients?: string[];
  aiAnalysis?: string;
  confidence?: number;
  barcode?: string;
  notes?: string;
  timestamp?: number;
  createdAt?: string;
  updatedAt?: string;
}
