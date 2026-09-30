'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, X, Barcode, Check, Utensils, Sparkles, PenLine, Flame, Egg, Wheat, Leaf, Calculator } from 'lucide-react';
import { FoodItem, MealLog, MealType } from '../types/meal';
import { analyzeFoodWithAI } from '../lib/gemini';
import { hasDishQuota } from '../lib/dishQuota';
import { AiLimitPopup } from './AiLimitPopup';
import { calculateRealFoodNutrition } from '../lib/nutritionEngine';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { getLocalDateString } from '../lib/store';

interface FoodSearchModalProps {
  isOpen: boolean;
  mealType: MealType;
  onClose: () => void;
  onAddMeal: (meal: MealLog) => void;
  targetDate?: string;
}

const FOOD_DATABASE: FoodItem[] = [
  { id: 'f1', name: 'Oatmeal with milk', calories: 120, protein: 4, fat: 3, carbs: 20, fiber: 2, servingSizeGrams: 100 },
  { id: 'f2', name: 'Boiled chicken breast', calories: 165, protein: 31, fat: 3.6, carbs: 0, fiber: 0, servingSizeGrams: 100 },
  { id: 'f3', name: 'Boiled buckwheat', calories: 110, protein: 4.2, fat: 1.1, carbs: 21, fiber: 2.7, servingSizeGrams: 100 },
  { id: 'f4', name: 'Ripe avocado', calories: 160, protein: 2, fat: 15, carbs: 9, fiber: 7, servingSizeGrams: 100 },
  { id: 'f5', name: 'Boiled chicken egg (1 pc)', calories: 78, protein: 6.3, fat: 5.3, carbs: 0.6, fiber: 0, servingSizeGrams: 50 },
  { id: 'f6', name: 'Cottage cheese 5%', calories: 120, protein: 17, fat: 5, carbs: 3, fiber: 0, servingSizeGrams: 100 },
  { id: 'f7', name: 'Grilled salmon', calories: 206, protein: 22, fat: 12, carbs: 0, fiber: 0, servingSizeGrams: 100 },
  { id: 'f8', name: 'Banana', calories: 89, protein: 1.1, fat: 0.3, carbs: 23, fiber: 2.6, servingSizeGrams: 100 },
  { id: 'f9', name: 'Fresh apple', calories: 52, protein: 0.3, fat: 0.2, carbs: 14, fiber: 2.4, servingSizeGrams: 100 },
  { id: 'f10', name: 'Raw almonds', calories: 579, protein: 21, fat: 49, carbs: 22, fiber: 12, servingSizeGrams: 100 },
  { id: 'f11', name: 'Steamed broccoli', calories: 35, protein: 2.4, fat: 0.4, carbs: 7, fiber: 3.3, servingSizeGrams: 100 },
  { id: 'f12', name: 'Protein bar', calories: 210, protein: 20, fat: 7, carbs: 18, fiber: 8, servingSizeGrams: 60 },
];

export const FoodSearchModal: React.FC<FoodSearchModalProps> = ({
  isOpen,
  mealType,
  onClose,
  onAddMeal,
  targetDate,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'text'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState<number>(100);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  // Custom Natural Text Entry State
  const [customTextInput, setCustomTextInput] = useState('');
  const [isCalculatingAI, setIsCalculatingAI] = useState(false);
  const [customCalculated, setCustomCalculated] = useState<{
    title: string;
    portionGrams: number;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
  } | null>(null);

  // Demo limit: only one AI dish
  const [isAiLimitOpen, setIsAiLimitOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsAiLimitOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredFoods = FOOD_DATABASE.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectFood = (food: FoodItem) => {
    setSelectedFood(food);
    setGrams(food.servingSizeGrams || 100);
  };

  const handleAddSelectedFood = () => {
    if (!selectedFood) return;
    // Base is relative to servingSizeGrams, not always /100:
    // the OFF scanner sends ALREADY portion-based macros (portion 330g/139kcal),
    // the old `grams/100` treated them as per-100g and tripled calories
    // (139 → ~459). It also fixes database items with portion packaging
    // (egg 78kcal/50g, bar 210kcal/60g).
    const baseGrams = selectedFood.servingSizeGrams || 100;
    const ratio = grams / baseGrams;
    const saveDate = targetDate || getLocalDateString();

    const mealLog: MealLog = {
      id: 'meal_srch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      userId: 'u1',
      date: saveDate,
      type: mealType,
      title: selectedFood.name,
      calories: Math.round(selectedFood.calories * ratio),
      protein: Math.round(selectedFood.protein * ratio),
      fat: Math.round(selectedFood.fat * ratio),
      carbs: Math.round(selectedFood.carbs * ratio),
      fiber: Math.round((selectedFood.fiber || 0) * ratio),
      portionGrams: grams,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    onAddMeal(mealLog);
    setSelectedFood(null);
    onClose();
  };

  const handleBarcodeScan = () => {
    setIsBarcodeScannerOpen(true);
  };

  // Estimate macros and calories from natural language text input
  const handleCalculateCustomText = async (textOverride?: string) => {
    const textToProcess = (textOverride || customTextInput).trim();
    if (!textToProcess) return;

    // Demo limit: description-based calculation only with free quota.
    // Database search and barcode go through the shared gate in App on save.
    if (!hasDishQuota()) {
      setIsAiLimitOpen(true);
      return;
    }

    setIsCalculatingAI(true);

    try {
      const data = await analyzeFoodWithAI(undefined, textToProcess);
      if (data && data.title) {
        setCustomCalculated({
          title: data.title,
          portionGrams: Number(data.portionGrams) || 200,
          calories: Number(data.calories) || 0,
          protein: Number(data.protein) || 0,
          fat: Number(data.fat) || 0,
          carbs: Number(data.carbs) || 0,
          fiber: Number(data.fiber) || 0,
        });
        setIsCalculatingAI(false);
        return;
      }
    } catch (err) {
      console.warn('Error during text analysis', err);
    }

    // Instant real calculation engine calculation
    const computed = calculateRealFoodNutrition(textToProcess);
    setCustomCalculated({
      title: computed.title,
      portionGrams: computed.portionGrams,
      calories: computed.calories,
      protein: computed.protein,
      fat: computed.fat,
      carbs: computed.carbs,
      fiber: computed.fiber,
    });
    setIsCalculatingAI(false);
  };

  const handleAddCustomMeal = () => {
    if (!customCalculated) return;
    const saveDate = targetDate || getLocalDateString();

    const mealLog: MealLog = {
      id: 'meal_custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      userId: 'u1',
      date: saveDate,
      type: mealType,
      title: customCalculated.title,
      calories: customCalculated.calories,
      protein: customCalculated.protein,
      fat: customCalculated.fat,
      carbs: customCalculated.carbs,
      fiber: customCalculated.fiber,
      portionGrams: customCalculated.portionGrams,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      aiAnalysis: 'Calculated from description',
    };

    onAddMeal(mealLog);
    setCustomCalculated(null);
    setCustomTextInput('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-md bg-white rounded-[32px] p-5 sm:p-6 text-slate-800 space-y-4 max-h-[88vh] overflow-y-auto shadow-2xl relative border border-slate-100"
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-[#0AB68B] text-white flex items-center justify-center shadow-xs font-bold text-xs">
              <Utensils className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">
              Add — <span className="text-[#0AB68B] capitalize">{mealType === 'breakfast' ? 'Breakfast' : mealType === 'lunch' ? 'Lunch' : mealType === 'dinner' ? 'Dinner' : 'Snack'}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher: Database search vs Enter custom text */}
        <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'search'
                ? 'bg-white text-[#0AB68B] shadow-2xs font-black'
                : 'hover:text-slate-900'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Food database</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'text'
                ? 'bg-white text-[#0AB68B] shadow-2xs font-black'
                : 'hover:text-slate-900'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Enter as text (AI)</span>
          </button>
        </div>

        {/* TAB 1: SEARCH IN DATABASE */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            {/* Search Input & Barcode button */}
            <div className="flex space-x-2">
              <div className="flex-1 bg-slate-100/90 px-3.5 py-2.5 rounded-2xl flex items-center space-x-2 border border-slate-200/60">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search the food database..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs font-medium bg-transparent outline-none text-slate-800"
                />
              </div>

              <button
                type="button"
                onClick={handleBarcodeScan}
                className="p-2.5 rounded-2xl bg-slate-100 text-slate-700 hover:bg-[#E6F9F5] hover:text-[#0AB68B] transition-colors border border-slate-200/60 flex items-center justify-center shrink-0 cursor-pointer"
                title="Scan Open Food Facts barcode"
              >
                <Barcode className="w-5 h-5" />
              </button>
            </div>

            {/* Food Detail Modal Overlay or List */}
            {selectedFood ? (
              <div className="space-y-4 pt-1">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">{selectedFood.name}</h4>
                    <span className="text-[11px] text-slate-500 font-medium">Per 100g: {selectedFood.calories} kcal</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFood(null)}
                    className="text-xs text-slate-500 font-extrabold hover:text-[#0AB68B] underline"
                  >
                    Change
                  </button>
                </div>

                {/* Grams slider */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex justify-between text-xs font-extrabold text-slate-700">
                    <span>Portion:</span>
                    <span className="text-[#0AB68B] text-sm">{grams} grams</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="5"
                    value={grams}
                    onChange={(e) => setGrams(Number(e.target.value))}
                    className="w-full accent-[#0AB68B] cursor-pointer"
                  />
                  <div className="flex justify-between gap-1 pt-1">
                    {[50, 100, 150, 200, 250].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGrams(g)}
                        className={`flex-1 py-1 text-[10px] font-extrabold rounded-lg transition-all ${
                          grams === g
                            ? 'bg-[#0AB68B] text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {g}g
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calculated Macros */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-[#0AB68B] block font-black">Calories</span>
                    <span className="text-slate-900 font-extrabold">{Math.round(selectedFood.calories * (grams / 100))}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-500 block font-black">Protein</span>
                    <span className="text-slate-900 font-extrabold">{+(selectedFood.protein * (grams / 100)).toFixed(1)}g</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-500 block font-black">Fat</span>
                    <span className="text-slate-900 font-extrabold">{+(selectedFood.fat * (grams / 100)).toFixed(1)}g</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-teal-600 block font-black">Carbs</span>
                    <span className="text-slate-900 font-extrabold">{+(selectedFood.carbs * (grams / 100)).toFixed(1)}g</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddSelectedFood}
                  className="w-full py-4 bg-[#0AB68B] text-white font-extrabold rounded-2xl shadow-[0_6px_20px_rgba(10,182,139,0.35)] hover:bg-[#089e78] transition-colors flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Check className="w-5 h-5" />
                  <span>Add to diary</span>
                </button>
              </div>
            ) : (
              /* Search Results List */
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 no-scrollbar">
                {filteredFoods.map((f, idx) => (
                  <div
                    key={`${f.id}-${idx}`}
                    onClick={() => handleSelectFood(f)}
                    className="p-3 bg-slate-50 hover:bg-[#E6F9F5] rounded-2xl border border-slate-100 flex items-center justify-between cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs group-hover:border-[#0AB68B] group-hover:text-[#0AB68B]">
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-slate-900">{f.name}</h5>
                        <span className="text-[10px] text-slate-400 font-medium">
                          P: {f.protein}g | F: {f.fat}g | C: {f.carbs}g
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-black text-[#0AB68B]">
                        {f.calories} kcal / 100g
                      </span>
                      <Plus className="w-4 h-4 text-slate-400 group-hover:text-[#0AB68B]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: NATURAL TEXT INPUT / AI CALCULATION */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-100 space-y-2">
              <div className="flex items-center space-x-2 text-xs font-black text-[#0AB68B]">
                <Sparkles className="w-4 h-4" />
                <span>Write down what you ate</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Enter any dish or foods. Calories and macros will be calculated automatically!
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-extrabold text-slate-700 block">Meal description</label>
              <textarea
                rows={3}
                value={customTextInput}
                onChange={(e) => setCustomTextInput(e.target.value)}
                placeholder="E.g.: 2 fried eggs with 100g avocado and a cup of coffee"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#0AB68B] resize-none"
              />

              {/* Sample Quick Preset Chips */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">Quick options:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '2 boiled eggs and toast',
                    '150g chicken breast with rice',
                    '300g borscht with sour cream',
                    '150g cottage cheese and an apple',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCustomTextInput(preset);
                        handleCalculateCustomText(preset);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-[#E6F9F5] hover:text-[#0AB68B] text-slate-700 rounded-xl text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCalculateCustomText()}
                disabled={isCalculatingAI || !customTextInput.trim()}
                className="w-full py-3 bg-[#0AB68B] disabled:opacity-50 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center space-x-2 shadow-md hover:bg-[#089e78] transition-colors cursor-pointer"
              >
                {isCalculatingAI ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Calculating macros...</span>
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    <span>Calculate calories and macros</span>
                  </>
                )}
              </button>
            </div>

            {/* Calculated Result Preview Card */}
            {customCalculated && (
              <div className="p-4 bg-white rounded-2xl border-2 border-[#0AB68B]/30 space-y-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">{customCalculated.title}</h4>
                    <span className="text-[11px] font-bold text-[#0AB68B]">
                      Portion: {customCalculated.portionGrams} grams
                    </span>
                  </div>
                  <span className="px-3 py-1 bg-emerald-50 text-[#0AB68B] border border-emerald-200 rounded-full font-black text-sm">
                    {customCalculated.calories} kcal
                  </span>
                </div>

                {/* Edit Grams or Macros manually if desired */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold pt-2 border-t border-slate-100">
                  <div className="bg-amber-50 p-2 rounded-xl border border-amber-200/60">
                    <span className="text-[10px] text-amber-700 block font-extrabold">Fat</span>
                    <input
                      type="number"
                      value={customCalculated.fat}
                      onChange={(e) =>
                        setCustomCalculated({ ...customCalculated, fat: Number(e.target.value) || 0 })
                      }
                      className="w-full text-center bg-transparent font-black text-slate-900 focus:outline-none"
                    />
                    <span className="text-[9px] text-slate-400">g</span>
                  </div>

                  <div className="bg-[#E6F9F5] p-2 rounded-xl border border-[#0AB68B]/30">
                    <span className="text-[10px] text-[#087f61] block font-extrabold">Protein</span>
                    <input
                      type="number"
                      value={customCalculated.protein}
                      onChange={(e) =>
                        setCustomCalculated({ ...customCalculated, protein: Number(e.target.value) || 0 })
                      }
                      className="w-full text-center bg-transparent font-black text-slate-900 focus:outline-none"
                    />
                    <span className="text-[9px] text-slate-400">g</span>
                  </div>

                  <div className="bg-sky-50 p-2 rounded-xl border border-sky-200/60">
                    <span className="text-[10px] text-sky-700 block font-extrabold">Carbs</span>
                    <input
                      type="number"
                      value={customCalculated.carbs}
                      onChange={(e) =>
                        setCustomCalculated({ ...customCalculated, carbs: Number(e.target.value) || 0 })
                      }
                      className="w-full text-center bg-transparent font-black text-slate-900 focus:outline-none"
                    />
                    <span className="text-[9px] text-slate-400">g</span>
                  </div>

                  <div className="bg-orange-50 p-2 rounded-xl border border-orange-200/60">
                    <span className="text-[10px] text-orange-700 block font-extrabold">Kcal</span>
                    <input
                      type="number"
                      value={customCalculated.calories}
                      onChange={(e) =>
                        setCustomCalculated({ ...customCalculated, calories: Number(e.target.value) || 0 })
                      }
                      className="w-full text-center bg-transparent font-black text-slate-900 focus:outline-none"
                    />
                    <span className="text-[9px] text-slate-400">kcal</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddCustomMeal}
                  className="w-full py-3.5 bg-[#0AB68B] text-white font-extrabold rounded-2xl text-xs flex items-center justify-center space-x-2 shadow-md hover:bg-[#089e78] transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Save to diary</span>
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Real-time Open Food Facts Barcode Scanner */}
      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onProductDetected={(food) => {
          setIsBarcodeScannerOpen(false);
          handleSelectFood(food);
        }}
      />

      {/* Demo dish limit: button leads back to the search tab */}
      <AiLimitPopup
        isOpen={isAiLimitOpen}
        onClose={() => setIsAiLimitOpen(false)}
      />
    </div>
  );
};

