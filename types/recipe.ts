export interface Ingredient {
  name: string;
  amount: string;
  calories?: number;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  tags: string[];
  imageUrl: string;
  ingredients: Ingredient[];
  instructions: string[];
}
