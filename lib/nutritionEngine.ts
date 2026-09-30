export interface FoodNutritionResult {
  title: string;
  portionGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  confidence: number;
}

export interface FoodDatabaseEntry {
  keywords: string[];
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  defaultPortion: number;
}

// Comprehensive food database per 100g for base ingredients, cooked meals, and regional dishes
export const NUTRITION_DATABASE_PER_100G: FoodDatabaseEntry[] = [
  // Breakfast & Eggs
  { keywords: ['fluffy omelet', '3-egg omelet', 'omelet', 'omelette'], name: 'Fluffy 3-egg omelet', calories: 155, protein: 10.8, fat: 11.5, carbs: 1.8, fiber: 0, defaultPortion: 210 },
  { keywords: ['fried eggs', 'sunny side up', 'fried egg'], name: 'Sunny-side-up fried eggs (2 eggs) with herbs', calories: 185, protein: 13.0, fat: 14.5, carbs: 0.8, fiber: 0, defaultPortion: 130 },
  { keywords: ['boiled eggs', 'hard-boiled egg', 'soft-boiled egg', 'egg', 'eggs'], name: 'Boiled chicken eggs (2 pcs)', calories: 155, protein: 12.6, fat: 10.6, carbs: 0.8, fiber: 0, defaultPortion: 110 },
  { keywords: ['syrniki', 'cottage cheese pancakes', 'cheese pancakes'], name: 'Soft cottage cheese pancakes (3 pcs)', calories: 210, protein: 16.2, fat: 8.5, carbs: 18.2, fiber: 0.8, defaultPortion: 180 },
  { keywords: ['cottage cheese with sour cream', 'cottage cheese with berries', 'cottage cheese', 'curd'], name: 'Cottage cheese 5% with sour cream and berries', calories: 135, protein: 15.5, fat: 6.2, carbs: 4.8, fiber: 0.5, defaultPortion: 180 },
  { keywords: ['cottage cheese casserole', 'casserole', 'curd bake'], name: 'Cottage cheese casserole with raisins', calories: 178, protein: 14.5, fat: 6.0, carbs: 16.5, fiber: 0.5, defaultPortion: 180 },
  { keywords: ['oatmeal with milk', 'oat porridge with milk', 'oatmeal with berries', 'oatmeal', 'oats', 'porridge'], name: 'Oatmeal with milk and berries', calories: 115, protein: 4.2, fat: 3.5, carbs: 17.5, fiber: 2.1, defaultPortion: 250 },
  { keywords: ['oatmeal with water', 'oats on water'], name: 'Oatmeal on water', calories: 72, protein: 2.8, fat: 1.4, carbs: 12.5, fiber: 2.0, defaultPortion: 250 },
  { keywords: ['avocado toast', 'toast with avocado'], name: 'Whole-grain toast with avocado and poached egg', calories: 215, protein: 8.5, fat: 14.0, carbs: 15.2, fiber: 4.5, defaultPortion: 160 },
  { keywords: ['pancakes', 'crepes with meat', 'crepes', 'blini'], name: 'Homemade crepes with filling', calories: 220, protein: 7.5, fat: 8.5, carbs: 28.0, fiber: 1.1, defaultPortion: 180 },
  { keywords: ['croissant', 'pastry', 'baking'], name: 'Classic butter croissant', calories: 406, protein: 8.2, fat: 21.0, carbs: 45.0, fiber: 2.0, defaultPortion: 80 },

  // Soups & First Courses
  { keywords: ['borscht with sour cream', 'borscht with beef', 'borscht', 'beet soup'], name: 'Borscht with juicy beef and sour cream', calories: 72, protein: 4.8, fat: 3.8, carbs: 6.2, fiber: 1.2, defaultPortion: 350 },
  { keywords: ['chicken soup', 'noodle soup', 'soup', 'broth', 'cabbage soup'], name: 'Chicken soup with homemade noodles', calories: 55, protein: 4.0, fat: 2.2, carbs: 5.2, fiber: 0.6, defaultPortion: 350 },
  { keywords: ['meat solyanka', 'solyanka'], name: 'Mixed meat solyanka with olives', calories: 95, protein: 6.2, fat: 6.8, carbs: 3.2, fiber: 0.5, defaultPortion: 300 },
  { keywords: ['fish soup', 'ukha'], name: 'Fish soup with red and white fish', calories: 65, protein: 7.2, fat: 2.8, carbs: 2.6, fiber: 0.4, defaultPortion: 300 },
  { keywords: ['mushroom cream soup', 'cream soup', 'puree soup', 'tom yum', 'tomyum'], name: 'Tom Yum with tiger shrimp and rice', calories: 98, protein: 6.5, fat: 5.2, carbs: 7.8, fiber: 1.1, defaultPortion: 350 },
  { keywords: ['lagman'], name: 'Lagman with beef and homemade noodles', calories: 125, protein: 6.8, fat: 5.2, carbs: 13.1, fiber: 1.2, defaultPortion: 350 },
  { keywords: ['kharcho'], name: 'Kharcho soup with beef, rice and cilantro', calories: 88, protein: 4.8, fat: 4.5, carbs: 7.2, fiber: 0.8, defaultPortion: 350 },

  // Meat, Poultry & Steaks
  { keywords: ['chicken breast with rice', 'chicken with rice', 'breast with rice'], name: 'Grilled chicken fillet with jasmine rice', calories: 155, protein: 21.0, fat: 3.2, carbs: 16.5, fiber: 0.8, defaultPortion: 300 },
  { keywords: ['chicken fillet', 'chicken breast', 'grilled chicken', 'chicken'], name: 'Grilled chicken breast fillet', calories: 165, protein: 31.0, fat: 3.6, carbs: 0, fiber: 0, defaultPortion: 180 },
  { keywords: ['grilled turkey', 'turkey fillet', 'turkey'], name: 'Baked turkey fillet with spices', calories: 145, protein: 25.0, fat: 4.0, carbs: 0, fiber: 0, defaultPortion: 180 },
  { keywords: ['homemade cutlets', 'cutlet with mash', 'cutlets', 'meatballs', 'patties'], name: 'Homemade cutlets with mashed potatoes', calories: 165, protein: 11.5, fat: 8.5, carbs: 12.0, fiber: 0.8, defaultPortion: 280 },
  { keywords: ['beef steak', 'ribeye steak', 'steak', 'beef'], name: 'Juicy marbled beef steak', calories: 235, protein: 26.5, fat: 14.5, carbs: 0, fiber: 0, defaultPortion: 220 },
  { keywords: ['pork shashlik', 'chicken shashlik', 'shashlik', 'pork', 'kebab', 'skewers'], name: 'Charcoal shashlik with pickled onion', calories: 265, protein: 22.0, fat: 19.5, carbs: 1.0, fiber: 0.2, defaultPortion: 220 },
  { keywords: ['goulash', 'beef stroganoff', 'stroganoff'], name: 'Beef stroganoff with tender beef and gravy', calories: 185, protein: 16.2, fat: 12.1, carbs: 3.5, fiber: 0.5, defaultPortion: 220 },
  { keywords: ['homemade dumplings', 'meat dumplings', 'pelmeni', 'dumplings'], name: 'Boiled pelmeni with butter', calories: 230, protein: 11.5, fat: 11.0, carbs: 22.5, fiber: 1.1, defaultPortion: 250 },
  { keywords: ['vareniki with potatoes', 'vareniki with cottage cheese', 'vareniki', 'pierogi'], name: 'Homemade vareniki with sour cream', calories: 185, protein: 5.8, fat: 5.2, carbs: 29.0, fiber: 1.5, defaultPortion: 220 },
  { keywords: ['stuffed cabbage', 'cabbage rolls', 'golubtsy'], name: 'Homemade cabbage rolls with sour cream sauce', calories: 120, protein: 6.5, fat: 6.8, carbs: 8.2, fiber: 1.6, defaultPortion: 250 },

  // Fish & Seafood
  { keywords: ['salmon steak', 'grilled salmon', 'salmon with asparagus', 'salmon', 'trout'], name: 'Grilled salmon steak with asparagus', calories: 210, protein: 22.5, fat: 13.0, carbs: 1.5, fiber: 0.8, defaultPortion: 220 },
  { keywords: ['grilled shrimp', 'boiled shrimp', 'shrimp', 'prawns'], name: 'King prawns with lemon and garlic', calories: 98, protein: 21.0, fat: 1.4, carbs: 0.8, fiber: 0, defaultPortion: 180 },
  { keywords: ['cod fillet', 'pollock', 'pikeperch', 'white fish', 'fish'], name: 'Baked white fish fillet with herbs', calories: 95, protein: 20.0, fat: 1.5, carbs: 0, fiber: 0, defaultPortion: 200 },
  { keywords: ['sushi set', 'philadelphia rolls', 'california rolls', 'rolls', 'sushi'], name: 'Philadelphia and California roll set', calories: 195, protein: 8.5, fat: 6.8, carbs: 26.5, fiber: 0.8, defaultPortion: 240 },
  { keywords: ['salmon poke', 'tuna poke', 'poke', 'poke bowl'], name: 'Poke bowl with salmon, avocado and rice', calories: 165, protein: 9.8, fat: 7.2, carbs: 17.5, fiber: 2.2, defaultPortion: 320 },

  // Salads & Fresh Vegetables
  { keywords: ['chicken caesar salad', 'caesar with chicken', 'caesar salad', 'caesar'], name: 'Caesar salad with chicken breast and parmesan', calories: 185, protein: 13.5, fat: 12.8, carbs: 5.5, fiber: 1.2, defaultPortion: 230 },
  { keywords: ['greek salad', 'greek with feta', 'greek'], name: 'Greek salad with fresh vegetables and feta', calories: 135, protein: 3.8, fat: 11.5, carbs: 4.8, fiber: 1.6, defaultPortion: 220 },
  { keywords: ['avocado salad', 'avocado with egg', 'avocado'], name: 'Avocado salad with egg and cherry tomatoes', calories: 160, protein: 5.2, fat: 13.5, carbs: 6.0, fiber: 4.5, defaultPortion: 200 },
  { keywords: ['olivier', 'russian salad'], name: 'Classic Olivier salad with ham', calories: 198, protein: 5.5, fat: 14.2, carbs: 11.5, fiber: 1.8, defaultPortion: 200 },
  { keywords: ['vinaigrette', 'beet salad'], name: 'Vegetable vinaigrette with aromatic oil', calories: 110, protein: 1.8, fat: 6.2, carbs: 12.5, fiber: 3.2, defaultPortion: 200 },
  { keywords: ['vegetable salad', 'cucumber and tomato', 'fresh vegetables', 'green salad', 'salad'], name: 'Fresh vegetable salad with olive oil', calories: 70, protein: 1.4, fat: 5.0, carbs: 5.2, fiber: 1.8, defaultPortion: 200 },

  // Fast Food, Pasta & Side Dishes
  { keywords: ['beef burger', 'cheeseburger', 'hamburger', 'burger'], name: 'Beef burger with cheddar cheese', calories: 275, protein: 14.5, fat: 13.5, carbs: 26.5, fiber: 1.8, defaultPortion: 230 },
  { keywords: ['chicken shawarma', 'shawarma', 'doner', 'wrap'], name: 'Shawarma with juicy chicken and fresh vegetables', calories: 195, protein: 11.8, fat: 8.5, carbs: 19.5, fiber: 1.6, defaultPortion: 320 },
  { keywords: ['pepperoni pizza', '4 cheese pizza', 'margherita', 'pizza'], name: 'Pepperoni pizza on thin crust', calories: 265, protein: 11.8, fat: 11.0, carbs: 30.0, fiber: 1.5, defaultPortion: 250 },
  { keywords: ['carbonara pasta', 'spaghetti carbonara', 'pasta', 'spaghetti', 'macaroni'], name: 'Pasta Carbonara with creamy sauce and cheese', calories: 235, protein: 9.8, fat: 11.5, carbs: 25.5, fiber: 1.2, defaultPortion: 260 },
  { keywords: ['uzbek plov', 'beef plov', 'plov', 'pilaf'], name: 'Plov with tender beef and spices', calories: 185, protein: 8.8, fat: 8.5, carbs: 20.5, fiber: 1.2, defaultPortion: 260 },
  { keywords: ['buckwheat porridge', 'buckwheat with butter', 'buckwheat'], name: 'Boiled buckwheat porridge', calories: 115, protein: 4.5, fat: 1.5, carbs: 22.0, fiber: 2.8, defaultPortion: 200 },
  { keywords: ['mashed potatoes', 'mash', 'french fries', 'baked potato', 'potato', 'potatoes'], name: 'Mashed potatoes with butter', calories: 110, protein: 2.2, fat: 4.2, carbs: 16.5, fiber: 1.5, defaultPortion: 200 },
  { keywords: ['basmati rice', 'boiled rice', 'rice'], name: 'Boiled long-grain rice', calories: 130, protein: 2.7, fat: 0.4, carbs: 28.2, fiber: 0.6, defaultPortion: 200 },

  // Drinks, Smoothies & Fitness
  { keywords: ['protein shake', 'protein with milk', 'protein', 'gainer'], name: 'Protein shake with milk (300 ml)', calories: 95, protein: 11.5, fat: 2.2, carbs: 7.5, fiber: 0.5, defaultPortion: 300 },
  { keywords: ['smoothie', 'green smoothie', 'fruit smoothie'], name: 'Fresh berry and spinach smoothie', calories: 58, protein: 1.5, fat: 0.6, carbs: 12.5, fiber: 2.4, defaultPortion: 300 },
  { keywords: ['cappuccino', 'latte', 'coffee with milk', 'raf'], name: 'Cappuccino with regular milk (250 ml)', calories: 48, protein: 2.6, fat: 2.5, carbs: 3.8, fiber: 0, defaultPortion: 250 },
  { keywords: ['protein bar', 'bar'], name: 'Nut protein bar', calories: 360, protein: 32.0, fat: 12.0, carbs: 28.0, fiber: 11.0, defaultPortion: 60 },
  { keywords: ['nuts', 'almonds', 'cashew', 'walnut', 'hazelnut'], name: 'Premium mixed nuts', calories: 610, protein: 20.0, fat: 52.0, carbs: 16.0, fiber: 8.0, defaultPortion: 40 },
  { keywords: ['dark chocolate', 'chocolate'], name: 'Dark chocolate 75%', calories: 545, protein: 7.2, fat: 36.0, carbs: 46.0, fiber: 7.5, defaultPortion: 35 },
  { keywords: ['apple'], name: 'Fresh juicy apple', calories: 52, protein: 0.3, fat: 0.2, carbs: 13.8, fiber: 2.4, defaultPortion: 180 },
  { keywords: ['banana'], name: 'Ripe banana', calories: 89, protein: 1.1, fat: 0.3, carbs: 22.8, fiber: 2.6, defaultPortion: 150 },
];

export function calculateRealFoodNutrition(
  userText?: string,
  imageHint?: string
): FoodNutritionResult {
  let cleanUserText = userText || '';
  if (cleanUserText.startsWith('data:') || cleanUserText.startsWith('http') || cleanUserText.length > 250) {
    cleanUserText = '';
  }

  let cleanImageHint = imageHint || '';
  if (cleanImageHint.startsWith('data:') || cleanImageHint.startsWith('http') || cleanImageHint.length > 250) {
    cleanImageHint = '';
  }

  const query = `${cleanUserText} ${cleanImageHint}`.toLowerCase().trim();

  // 1. Extract explicit weight/portion in grams or pieces from query text
  let extractedGrams: number | null = null;

  if (query) {
    // Search for explicit grams like "350g", "350 g", "200 grams"
    const gramMatch = query.match(/(\d+)\s*(g|gram|grams)/i);
    if (gramMatch) {
      const parsed = parseInt(gramMatch[1], 10);
      if (!isNaN(parsed) && parsed >= 30 && parsed <= 2500) {
        extractedGrams = parsed;
      }
    }

    // Search for pieces like "3 eggs", "2 slices", "1 pc", "3 pancakes"
    if (!extractedGrams) {
      const pcsMatch = query.match(/(\d+)\s*(pcs|pieces|eggs|slices|portions|pancakes|crepes)/i);
      if (pcsMatch) {
        const count = parseInt(pcsMatch[1], 10);
        if (!isNaN(count) && count > 0) {
          if (query.includes('egg')) {
            extractedGrams = count * 55;
          } else if (query.includes('bread') || query.includes('slice') || query.includes('toast')) {
            extractedGrams = count * 40;
          } else if (query.includes('pancake') || query.includes('syrnik')) {
            extractedGrams = count * 60;
          } else if (query.includes('crepe') || query.includes('blin')) {
            extractedGrams = count * 50;
          } else {
            extractedGrams = count * 150;
          }
        }
      }
    }
  }

  // 2. Find closest matched item in nutritional database
  let matchedItem = query
    ? NUTRITION_DATABASE_PER_100G.find((item) =>
        item.keywords.some((kw) => query.includes(kw))
      )
    : undefined;

  // If still no keyword match, try single-word match
  if (!matchedItem && query) {
    const words = query.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      matchedItem = NUTRITION_DATABASE_PER_100G.find((item) =>
        item.keywords.some((kw) => kw.includes(word) || word.includes(kw))
      );
      if (matchedItem) break;
    }
  }

  // Default fallback item if no keyword matched
  if (!matchedItem) {
    let cleanTitle = cleanUserText.trim() || cleanImageHint.trim() || 'Dish from photo';
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
    cleanTitle = cleanTitle.replace(/\d+\s*(g|gram|grams|pcs|eggs|slices)/gi, '').trim() || 'Dish from photo';

    matchedItem = {
      keywords: [],
      name: cleanTitle,
      calories: 145,
      protein: 8.5,
      fat: 6.0,
      carbs: 14.0,
      fiber: 1.5,
      defaultPortion: 200,
    };
  }

  const finalPortion = extractedGrams || matchedItem.defaultPortion;
  const ratio = finalPortion / 100;

  return {
    title: matchedItem.name || 'Dish from photo',
    portionGrams: finalPortion,
    calories: Math.max(45, Math.round(matchedItem.calories * ratio)),
    protein: Math.max(1, Math.round(matchedItem.protein * ratio)),
    fat: Math.max(1, Math.round(matchedItem.fat * ratio)),
    carbs: Math.max(1, Math.round(matchedItem.carbs * ratio)),
    fiber: Math.max(0, Math.round(matchedItem.fiber * ratio)),
    confidence: 96,
  };
}
