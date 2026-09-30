'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Flame,
  Egg,
  Wheat,
  Leaf,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  Utensils,
  Clock,
  Scale,
  Plus,
  Minus,
  AlertCircle,
  Tag,
  Coffee,
  Sun,
  Moon,
  Cookie,
  FileText,
} from 'lucide-react';
import { MealLog, MealType } from '../types/meal';
import { UserProfile } from '../types/user';

interface MealDetailModalProps {
  isOpen: boolean;
  meal: MealLog | null;
  onClose: () => void;
  onUpdateMeal?: (updatedMeal: MealLog) => void;
  onDeleteMeal?: (mealId: string) => void;
  userProfile?: UserProfile;
}

export const MealDetailModal: React.FC<MealDetailModalProps> = ({
  isOpen,
  meal,
  onClose,
  onUpdateMeal,
  onDeleteMeal,
  userProfile,
}) => {
  // Rules of Hooks: all hooks before any return. An early `return null` before
  // useState/useEffect crashed the modal when opening
  // (`Rendered more hooks than during previous render`).
  const [portionGrams, setPortionGrams] = useState<number>(meal?.portionGrams || 100);
  const [currentType, setCurrentType] = useState<MealType>(meal?.type || 'lunch');
  const [notes, setNotes] = useState<string>(meal?.notes || '');
  const [isEditingPortion, setIsEditingPortion] = useState<boolean>(false);
  const [isSavedNotice, setIsSavedNotice] = useState<boolean>(false);

  // Sync state when opened with a new meal
  useEffect(() => {
    if (meal) {
      setPortionGrams(meal.portionGrams || 100);
      setCurrentType(meal.type);
      setNotes(meal.notes || '');
      setIsEditingPortion(false);
      setIsSavedNotice(false);
    }
  }, [meal]);

  if (!isOpen || !meal) return null;

  // Base values per gram to recalculate scaled portion
  const baseRatio = (meal.portionGrams && meal.portionGrams > 0) ? portionGrams / meal.portionGrams : 1;
  const currentCalories = Math.round(meal.calories * baseRatio);
  const currentProtein = Math.round(meal.protein * baseRatio * 10) / 10;
  const currentFat = Math.round(meal.fat * baseRatio * 10) / 10;
  const currentCarbs = Math.round(meal.carbs * baseRatio * 10) / 10;
  const currentFiber = Math.round((meal.fiber || 0) * baseRatio * 10) / 10;

  // Percentage of daily targets
  const targetCal = userProfile?.targetCalories || 2000;
  const targetProt = userProfile?.targetProtein || 140;
  const targetFat = userProfile?.targetFat || 60;
  const targetCarbs = userProfile?.targetCarbs || 220;
  const targetFiber = userProfile?.targetFiber || 25;

  const calPercent = Math.min(100, Math.round((currentCalories / targetCal) * 100));
  const protPercent = Math.min(100, Math.round((currentProtein / targetProt) * 100));
  const fatPercent = Math.min(100, Math.round((currentFat / targetFat) * 100));
  const carbsPercent = Math.min(100, Math.round((currentCarbs / targetCarbs) * 100));
  const fiberPercent = Math.min(100, Math.round((currentFiber / targetFiber) * 100));

  const mealTypeConfig: Record<MealType, { label: string; icon: React.ReactNode; color: string }> = {
    breakfast: {
      label: 'Breakfast',
      icon: <Coffee className="w-3.5 h-3.5" />,
      color: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    lunch: {
      label: 'Lunch',
      icon: <Sun className="w-3.5 h-3.5" />,
      color: 'bg-orange-100 text-orange-800 border-orange-200',
    },
    dinner: {
      label: 'Dinner',
      icon: <Moon className="w-3.5 h-3.5" />,
      color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    },
    snack: {
      label: 'Snack',
      icon: <Cookie className="w-3.5 h-3.5" />,
      color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
  };

  const handleAdjustPortion = (delta: number) => {
    setPortionGrams((prev) => Math.max(10, prev + delta));
  };

  const handleSaveChanges = () => {
    if (!onUpdateMeal || !meal) return;

    const updated: MealLog = {
      ...meal,
      type: currentType,
      portionGrams,
      calories: currentCalories,
      protein: currentProtein,
      fat: currentFat,
      carbs: currentCarbs,
      fiber: currentFiber,
      notes: notes.trim() || undefined,
    };

    onUpdateMeal(updated);
    setIsSavedNotice(true);
    setTimeout(() => {
      setIsSavedNotice(false);
      onClose();
    }, 600);
  };

  const handleDelete = () => {
    if (onDeleteMeal && meal) {
      onDeleteMeal(meal.id);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col my-auto"
        >
          {/* Header Image or Gradient Banner */}
          <div className="relative w-full h-44 sm:h-52 bg-slate-900 shrink-0">
            {meal.imageUrl ? (
              <img
                src={meal.imageUrl}
                alt={meal.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-emerald-600 via-teal-600 to-[#0AB68B] flex items-center justify-center">
                <Utensils className="w-16 h-16 text-white/40" />
              </div>
            )}

            {/* Gradient Dark Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-3.5 right-3.5 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Meal Category Badge on Top Left */}
            <div className="absolute top-3.5 left-3.5 flex items-center space-x-2 z-10">
              <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black border backdrop-blur-md ${mealTypeConfig[currentType].color}`}>
                {mealTypeConfig[currentType].icon}
                <span>{mealTypeConfig[currentType].label}</span>
              </span>
            </div>

            {/* Bottom Title & Calories on Image */}
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <h2 className="text-xl sm:text-2xl font-black leading-tight drop-shadow-md">
                {meal.title}
              </h2>
              <div className="flex items-center space-x-2 mt-1 text-xs text-emerald-200 font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>Logged: {meal.date || 'Today'}</span>
                <span>•</span>
                <span>{portionGrams} g</span>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 space-y-5">
            {/* Big Calorie Metric Card */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                  <Flame className="w-7 h-7 fill-white" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider block">
                    Dish calories
                  </span>
                  <div className="flex items-baseline space-x-1.5">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900">
                      {currentCalories}
                    </span>
                    <span className="text-xs font-bold text-amber-800">kcal</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                  Of daily norm
                </span>
                <span className="text-sm font-black text-amber-700">{calPercent}%</span>
                <span className="text-[10px] text-slate-400 block">of {targetCal} kcal</span>
              </div>
            </div>

            {/* Macro Breakdown 4-Grid Cards */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Macros:
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Protein */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1 text-slate-600 font-bold">
                      <Egg className="w-3.5 h-3.5 text-blue-500" />
                      <span>Protein</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{protPercent}%</span>
                  </div>
                  <div className="text-lg font-black text-slate-900">{currentProtein}g</div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${protPercent}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block">goal: {targetProt}g</span>
                </div>

                {/* Fat */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1 text-slate-600 font-bold">
                      <Flame className="w-3.5 h-3.5 text-amber-500" />
                      <span>Fat</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{fatPercent}%</span>
                  </div>
                  <div className="text-lg font-black text-slate-900">{currentFat}g</div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${fatPercent}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block">goal: {targetFat}g</span>
                </div>

                {/* Carbs */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1 text-slate-600 font-bold">
                      <Wheat className="w-3.5 h-3.5 text-orange-500" />
                      <span>Carbs</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{carbsPercent}%</span>
                  </div>
                  <div className="text-lg font-black text-slate-900">{currentCarbs}g</div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full"
                      style={{ width: `${carbsPercent}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block">goal: {targetCarbs}g</span>
                </div>

                {/* Fiber */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1 text-slate-600 font-bold">
                      <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Fiber</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{fiberPercent}%</span>
                  </div>
                  <div className="text-lg font-black text-slate-900">{currentFiber}g</div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${fiberPercent}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block">goal: {targetFiber}g</span>
                </div>
              </div>
            </div>

            {/* Interactive Portion Editor */}
            <div className="bg-[#E6F9F5]/60 border border-[#0AB68B]/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Scale className="w-4 h-4 text-[#0AB68B]" />
                  <span className="text-xs font-extrabold text-slate-900">
                    Portion size (grams):
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-black text-[#0AB68B]">{portionGrams} g</span>
                </div>
              </div>

              {/* Stepper Buttons & Quick Presets */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAdjustPortion(-50)}
                  className="px-2.5 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  -50g
                </button>
                <button
                  onClick={() => handleAdjustPortion(-10)}
                  className="px-2.5 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  -10g
                </button>
                <button
                  onClick={() => handleAdjustPortion(10)}
                  className="px-2.5 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  +10g
                </button>
                <button
                  onClick={() => handleAdjustPortion(50)}
                  className="px-2.5 py-1.5 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  +50g
                </button>
                <input
                  type="number"
                  min="10"
                  max="2000"
                  value={portionGrams}
                  onChange={(e) => setPortionGrams(Math.max(10, parseInt(e.target.value, 10) || 10))}
                  className="w-20 px-2 py-1 bg-white border border-slate-300 rounded-xl text-center text-xs font-black text-slate-800 ml-auto focus:border-[#0AB68B] focus:ring-1 focus:ring-[#0AB68B] outline-none"
                />
              </div>

              {/* Slider */}
              <input
                type="range"
                min="20"
                max="800"
                step="10"
                value={portionGrams}
                onChange={(e) => setPortionGrams(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0AB68B]"
              />
            </div>

            {/* Meal Category Switcher */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Meal category:
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setCurrentType(type)}
                    className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 transition-all border ${
                      currentType === type
                        ? 'bg-[#0AB68B] text-white border-[#0AB68B] shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {mealTypeConfig[type].icon}
                    <span>{mealTypeConfig[type].label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ingredients Chips */}
            {meal.ingredients && meal.ingredients.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Ingredients:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {meal.ingredients.map((ing, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200/80"
                    >
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis Insight */}
            {meal.aiAnalysis && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200/90 rounded-2xl flex items-start space-x-2.5 text-xs text-emerald-900">
                <Sparkles className="w-4 h-4 text-[#0AB68B] shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold block text-emerald-950">
                    AI composition review:
                  </span>
                  <p className="font-medium mt-0.5 leading-relaxed">{meal.aiAnalysis}</p>
                </div>
              </div>
            )}

            {/* Notes / Remarks */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-[#0AB68B]" />
                <span>Notes / Remarks:</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note (e.g.: no sauce, 2 slices of bread, double cheese...)"
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#0AB68B] focus:ring-1 focus:ring-[#0AB68B] outline-none resize-none transition-all"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSaveChanges}
                className="flex-1 py-3.5 bg-[#0AB68B] hover:bg-[#089e78] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-[#0AB68B]/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isSavedNotice ? 'Saved!' : 'Save changes'}</span>
              </button>

              {onDeleteMeal && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold text-xs rounded-2xl border border-rose-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Delete this dish"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
