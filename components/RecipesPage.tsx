'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Clock, Flame, X, Plus, Camera, Upload, Check, Utensils } from 'lucide-react';
import { Recipe } from '../types/recipe';
import { MealLog } from '../types/meal';
import { analyzeFridgePhoto, generateRecipeWithAI } from '../lib/gemini';
import { getLocalDateString } from '../lib/store';

interface RecipesPageProps {
  onAddMealToDiary?: (meal: MealLog) => void;
}

const INITIAL_RECIPES: Recipe[] = [
  {
    id: 'r1',
    title: 'Avocado salad with poached egg and seeds',
    description: 'A breakfast rich in healthy fats and fiber to keep you energized all day.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 5,
    servings: 1,
    calories: 340,
    protein: 14,
    carbs: 12,
    fat: 26,
    fiber: 8,
    tags: ['Keto', 'Quick', 'Breakfast', 'High fiber'],
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    ingredients: [
      { name: 'Ripe avocado', amount: '1/2 pc (70g)', calories: 110 },
      { name: 'Chicken egg', amount: '2 pcs', calories: 140 },
      { name: 'Salad mix', amount: '50 g', calories: 15 },
      { name: 'Olive oil', amount: '1 tsp', calories: 45 },
      { name: 'Pumpkin seeds', amount: '10 g', calories: 30 },
    ],
    instructions: [
      'Rinse and dry the salad mix.',
      'Slice the avocado thinly.',
      'Poach the eggs in boiling water with a drop of vinegar for 3 minutes.',
      'Plate the salad, avocado and eggs, drizzle with oil and sprinkle with seeds.',
    ],
  },
  {
    id: 'r2',
    title: 'Baked cod with lemon and broccoli',
    description: 'A light low-calorie dinner packed with lean protein.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    servings: 2,
    calories: 280,
    protein: 36,
    carbs: 8,
    fat: 10,
    fiber: 5,
    tags: ['High protein', 'Dinner', 'Low carb'],
    imageUrl: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
    ingredients: [
      { name: 'Cod fillet', amount: '300 g', calories: 210 },
      { name: 'Fresh broccoli', amount: '200 g', calories: 60 },
      { name: 'Lemon juice', amount: '2 tbsp', calories: 10 },
      { name: 'Butter', amount: '10 g', calories: 70 },
    ],
    instructions: [
      'Preheat the oven to 190°C.',
      'Place the cod fillets and broccoli florets in a baking dish.',
      'Drizzle with lemon juice, season with salt and pepper, and add a knob of butter.',
      'Bake for 15 minutes until golden.',
    ],
  },
  {
    id: 'r3',
    title: 'Quinoa bowl with roasted chickpeas and tofu',
    description: 'A nourishing vegan dish with a complete plant-based amino acid profile.',
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    servings: 1,
    calories: 420,
    protein: 22,
    carbs: 52,
    fat: 14,
    fiber: 11,
    tags: ['Vegan', 'Vegetarian', 'Lunch'],
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    ingredients: [
      { name: 'Cooked quinoa', amount: '120 g', calories: 150 },
      { name: 'Boiled chickpeas', amount: '80 g', calories: 130 },
      { name: 'Pan-fried tofu', amount: '80 g', calories: 100 },
      { name: 'Cucumber and cherry tomatoes', amount: '100 g', calories: 40 },
    ],
    instructions: [
      'Cook the quinoa until tender.',
      'Roast the chickpeas with paprika spices in the oven for 15 min.',
      'Dice the tofu and brown it in a dry pan.',
      'Assemble a beautiful bowl with quinoa, chickpeas, tofu and fresh veggies.',
    ],
  },
];

export const RecipesPage: React.FC<RecipesPageProps> = ({ onAddMealToDiary }) => {
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
  const [addedToDiarySuccess, setAddedToDiarySuccess] = useState(false);

  // AI Generator state
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [aiCategory, setAiCategory] = useState('Quick dinner');
  const [aiMaxCalories, setAiMaxCalories] = useState(500);
  const [aiIngredients, setAiIngredients] = useState('');
  const [fridgeImage, setFridgeImage] = useState<string | null>(null);
  const [isAnalyzingFridge, setIsAnalyzingFridge] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const fridgeInputRef = useRef<HTMLInputElement>(null);

  const tags = ['All', 'Keto', 'High protein', 'Vegan', 'Quick', 'Breakfast', 'Dinner'];

  const filteredRecipes = selectedTag === 'All'
    ? recipes
    : recipes.filter((r) => r.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));

  const handleFridgePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setFridgeImage(base64);
      setIsAnalyzingFridge(true);

      try {
        const detectedIngredients = await analyzeFridgePhoto(base64);
        setAiIngredients(detectedIngredients.join(', '));
      } catch (err) {
        console.warn('Fridge scan error:', err);
      } finally {
        setIsAnalyzingFridge(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAIRecipe = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateRecipeWithAI({
        category: aiCategory,
        maxCalories: aiMaxCalories,
        ingredients: aiIngredients,
        fridgeImageBase64: fridgeImage || undefined,
      });

      const newRecipe: Recipe = {
        id: 'ai_rec_' + Date.now(),
        title: generated.title || `Fridge recipe: ${aiCategory}`,
        description: generated.description || 'An AI-curated perfect dish.',
        prepTimeMinutes: generated.prepTimeMinutes || 10,
        cookTimeMinutes: generated.cookTimeMinutes || 15,
        servings: generated.servings || 1,
        calories: generated.calories || 420,
        protein: generated.protein || 30,
        fat: generated.fat || 12,
        carbs: generated.carbs || 32,
        fiber: generated.fiber || 5,
        tags: ['AI Original', 'From the fridge', aiCategory],
        imageUrl: generated.imageUrl || 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
        ingredients: generated.ingredients || [
          { name: 'Fridge ingredients', amount: '200g' },
        ],
        instructions: generated.instructions || [
          'Prep and chop the ingredients you have.',
          'Cook in a pan with your favorite spices.',
        ],
      };

      setRecipes([newRecipe, ...recipes]);
      setActiveRecipe(newRecipe);
      setIsGeneratorOpen(false);
    } catch (err) {
      console.warn('Error generating recipe:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogRecipeToDiary = (recipe: Recipe) => {
    if (!onAddMealToDiary) return;

    const todayStr = getLocalDateString();
    const newMeal: MealLog = {
      id: 'm_rec_' + Date.now(),
      userId: 'u1',
      date: todayStr,
      type: 'lunch',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      title: recipe.title,
      portionGrams: 250,
      calories: recipe.calories,
      protein: recipe.protein,
      fat: recipe.fat,
      carbs: recipe.carbs,
      fiber: recipe.fiber || 5,
      imageUrl: recipe.imageUrl,
    };

    onAddMealToDiary(newMeal);
    setAddedToDiarySuccess(true);
    setTimeout(() => {
      setAddedToDiarySuccess(false);
    }, 2500);
  };

  return (
    <div className="px-5 pt-3 pb-8 space-y-4 font-sans">
      {/* Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Recipe Catalog</h2>
          <p className="text-xs text-slate-400 font-medium">Balanced dishes with accurate macros</p>
        </div>

        <button
          onClick={() => setIsGeneratorOpen(true)}
          className="px-3.5 py-2 rounded-2xl bg-[#00C29A] text-white font-bold text-xs flex items-center space-x-1.5 shadow-[0_4px_14px_rgba(0,194,154,0.35)] hover:bg-[#00A885] transition-colors"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>AI Chef</span>
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex space-x-2 overflow-x-auto no-scrollbar py-1">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedTag === tag
                ? 'bg-[#00C29A] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-100 hover:bg-slate-50'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Recipe Cards Grid */}
      <div className="space-y-4">
        {filteredRecipes.map((recipe) => (
          <div
            key={recipe.id}
            onClick={() => setActiveRecipe(recipe)}
            className="bg-white rounded-[28px] overflow-hidden border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] cursor-pointer hover:shadow-lg transition-all group"
          >
            <div className="relative h-44 w-full overflow-hidden">
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                {recipe.tags.slice(0, 2).map((t, idx) => (
                  <span
                    key={idx}
                    className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black text-[#00C29A] shadow-xs">
                {recipe.calories} kcal
              </div>
            </div>

            <div className="p-4 space-y-2">
              <h3 className="font-extrabold text-sm text-slate-900 leading-snug group-hover:text-[#00C29A] transition-colors">
                {recipe.title}
              </h3>
              <p className="text-xs text-slate-500 line-clamp-2">{recipe.description}</p>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] font-bold text-slate-500">
                <div className="flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{recipe.prepTimeMinutes + recipe.cookTimeMinutes} min</span>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-rose-500">P: {recipe.protein}g</span>
                  <span className="text-amber-500">F: {recipe.fat}g</span>
                  <span className="text-teal-600">C: {recipe.carbs}g</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* RECIPE DETAIL MODAL */}
      <AnimatePresence>
        {activeRecipe && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-end justify-center p-0 md:p-4 font-sans">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-md bg-white rounded-t-[36px] p-6 text-slate-800 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-start">
                <h2 className="text-xl font-extrabold text-slate-900 leading-tight">
                  {activeRecipe.title}
                </h2>
                <button
                  onClick={() => setActiveRecipe(null)}
                  className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <img
                src={activeRecipe.imageUrl}
                alt={activeRecipe.title}
                className="w-full h-48 object-cover rounded-2xl shadow-xs"
              />

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-around text-center text-xs font-bold">
                <div>
                  <span className="text-[10px] text-slate-400 block">Calories</span>
                  <span className="text-base text-[#00C29A]">{activeRecipe.calories}</span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-500 block">Protein</span>
                  <span>{activeRecipe.protein}g</span>
                </div>
                <div>
                  <span className="text-[10px] text-amber-500 block">Fat</span>
                  <span>{activeRecipe.fat}g</span>
                </div>
                <div>
                  <span className="text-[10px] text-teal-600 block">Carbs</span>
                  <span>{activeRecipe.carbs}g</span>
                </div>
              </div>

              {/* Ingredients */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Ingredients ({activeRecipe.ingredients?.length})
                </h4>
                {activeRecipe.ingredients?.map((ing, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-50 rounded-xl flex justify-between text-xs font-medium text-slate-800"
                  >
                    <span>• {ing.name}</span>
                    <span className="font-bold text-slate-500">{ing.amount}</span>
                  </div>
                ))}
              </div>

              {/* Instructions */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Cooking instructions
                </h4>
                {activeRecipe.instructions?.map((step, idx) => (
                  <div key={idx} className="text-xs text-slate-700 leading-relaxed font-medium">
                    <span className="font-extrabold text-[#00C29A]">{idx + 1}.</span> {step}
                  </div>
                ))}
              </div>

              {/* Log to Diary Button */}
              <div className="pt-2">
                {onAddMealToDiary && (
                  <button
                    onClick={() => handleLogRecipeToDiary(activeRecipe)}
                    className={`w-full py-3.5 rounded-2xl font-extrabold text-xs flex items-center justify-center space-x-2 transition-all shadow-md ${
                      addedToDiarySuccess
                        ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                        : 'bg-[#00C29A] text-white hover:bg-[#00A885] shadow-[#00C29A]/30'
                    }`}
                  >
                    {addedToDiarySuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Added to Food Diary!</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Log this dish to Food Diary</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI RECIPE GENERATOR MODAL */}
      <AnimatePresence>
        {isGeneratorOpen && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-end justify-center p-0 md:p-4 font-sans">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-md bg-white rounded-t-[36px] p-6 text-slate-800 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-[#00C29A]" />
                  <h3 className="text-lg font-extrabold text-slate-900">AI Fridge Chef</h3>
                </div>
                <button
                  onClick={() => setIsGeneratorOpen(false)}
                  className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Fridge Photo Upload Section */}
                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/60 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900 flex items-center space-x-1.5">
                      <Camera className="w-4 h-4 text-[#00C29A]" />
                      <span>📸 Upload a fridge photo</span>
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      ref={fridgeInputRef}
                      onChange={handleFridgePhotoSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fridgeInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-[#00C29A] text-white text-[11px] font-extrabold flex items-center space-x-1 shadow-sm hover:bg-[#00a885] transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload photo</span>
                    </button>
                  </div>

                  {/* Image Preview & Scanning Status */}
                  {fridgeImage && (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-200 h-28 bg-black">
                      <img
                        src={fridgeImage}
                        alt="Fridge photo"
                        className="w-full h-full object-cover opacity-90"
                      />
                      {isAnalyzingFridge ? (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center space-y-1 text-white p-2">
                          <div className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-white animate-spin" />
                          <span className="text-[11px] font-extrabold">AI is recognizing groceries...</span>
                        </div>
                      ) : (
                        <div className="absolute bottom-2 left-2 right-2 bg-emerald-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-emerald-300 font-extrabold flex items-center justify-between">
                          <span>✨ Groceries recognized!</span>
                          <button
                            onClick={() => {
                              setFridgeImage(null);
                              setAiIngredients('');
                            }}
                            className="text-slate-300 hover:text-white"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    Dish category
                  </label>
                  <input
                    type="text"
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:ring-2 focus:ring-[#00C29A]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-600">
                      Max calories
                    </label>
                    <span className="text-xs font-extrabold text-[#00C29A]">{aiMaxCalories} kcal</span>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="1000"
                    step="50"
                    value={aiMaxCalories}
                    onChange={(e) => setAiMaxCalories(Number(e.target.value))}
                    className="w-full accent-[#00C29A]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">
                    Recognized ingredients
                  </label>
                  <textarea
                    rows={2}
                    placeholder="chicken breast, tomatoes, cheese, eggs..."
                    value={aiIngredients}
                    onChange={(e) => setAiIngredients(e.target.value)}
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium outline-none focus:ring-2 focus:ring-[#00C29A] resize-none"
                  />
                </div>

                <button
                  onClick={handleGenerateAIRecipe}
                  disabled={isGenerating || isAnalyzingFridge}
                  className="w-full py-3.5 bg-[#00C29A] text-white font-extrabold text-xs rounded-2xl shadow-[0_6px_20px_rgba(0,194,154,0.35)] hover:bg-[#00A885] transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      <span>Creating a masterpiece from your groceries...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Generate recipe with AI</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
