'use client';

import React from 'react';
import { motion } from 'motion/react';
import { UserProfile } from '../types/user';
import { MealLog, MealType } from '../types/meal';
import { WorkoutLog, saveStoredWater } from '../lib/store';
import {
  Plus,
  Camera,
  Search,
  Droplets,
  Flame,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Utensils,
  Coffee,
  Sun,
  Moon,
  Cookie,
  Egg,
  Wheat,
  Leaf,
  Dumbbell,
  X,
  Users,
  Info,
  Activity,
  Target,
  ShieldCheck,
  Scale,
} from 'lucide-react';
import { TamagotchiState } from '../types/tamagotchi';
import { TamagotchiWidget } from './TamagotchiWidget';
import { getStoredMealLogs, calculateUserGoals } from '../lib/store';
import { MealDetailModal } from './MealDetailModal';

interface DashboardProps {
  userProfile: UserProfile;
  mealLogs: MealLog[];
  workoutLogs?: WorkoutLog[];
  waterAmount: number;
  setWaterAmount: React.Dispatch<React.SetStateAction<number>>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onOpenScanner: () => void;
  onOpenSearch: (mealType: MealType) => void;
  onDeleteMeal: (id: string) => void;
  onUpdateMeal?: (updatedMeal: MealLog) => void;
  onOpenWorkoutModal: () => void;
  onDeleteWorkout: (id: string) => void;
  onOpenFriends?: () => void;
  tamagotchi?: TamagotchiState | null;
  setTamagotchi?: (pet: TamagotchiState | null) => void;
  onOpenTamagotchiModal?: () => void;
  onOpenPlayModal?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  userProfile,
  mealLogs,
  workoutLogs = [],
  waterAmount,
  setWaterAmount,
  selectedDate,
  onOpenScanner,
  onOpenSearch,
  onDeleteMeal,
  onUpdateMeal,
  onOpenWorkoutModal,
  onDeleteWorkout,
  onOpenFriends,
  tamagotchi = null,
  setTamagotchi,
  onOpenTamagotchiModal,
  onOpenPlayModal,
}) => {
  const [selectedMealForDetail, setSelectedMealForDetail] = React.useState<MealLog | null>(null);
  const [isCalorieInfoOpen, setIsCalorieInfoOpen] = React.useState(false);

  // Metabolic calculations for full transparency
  const calculatedGoals = React.useMemo(() => {
    return calculateUserGoals({
      gender: userProfile.gender,
      age: userProfile.age,
      height: userProfile.height,
      currentWeight: userProfile.currentWeight,
      targetWeight: userProfile.targetWeight,
      weeklyGoal: userProfile.weeklyGoal || (userProfile.targetWeight < userProfile.currentWeight ? 0.5 : 0),
      activityLevel: userProfile.activityLevel,
      dietType: userProfile.dietType || 'balanced',
    });
  }, [userProfile]);

  // Totals calculated dynamically from user's ACTUAL logged meals & workouts
  const totalCalories = mealLogs.reduce((acc, m) => acc + m.calories, 0);
  const totalBurned = workoutLogs.reduce((acc, w) => acc + w.caloriesBurned, 0);
  const effectiveTarget = userProfile.targetCalories + totalBurned;

  const isOverLimit = totalCalories > effectiveTarget;
  const excessCalories = totalCalories - effectiveTarget;
  const remainingCalories = isOverLimit ? 0 : effectiveTarget - totalCalories;
  
  const rawCalPercent = effectiveTarget > 0 ? (totalCalories / effectiveTarget) * 100 : 0;
  const calPercent = Math.min(100, Math.round(rawCalPercent));

  const totalProtein = mealLogs.reduce((acc, m) => acc + m.protein, 0);
  const totalFat = mealLogs.reduce((acc, m) => acc + m.fat, 0);
  const totalCarbs = mealLogs.reduce((acc, m) => acc + m.carbs, 0);
  const totalFiber = mealLogs.reduce((acc, m) => acc + (m.fiber || 0), 0);

  const fatPercent = Math.min(100, Math.round((totalFat / (userProfile.targetFat || 1)) * 100));
  const proteinPercent = Math.min(100, Math.round((totalProtein / (userProfile.targetProtein || 1)) * 100));
  const carbsPercent = Math.min(100, Math.round((totalCarbs / (userProfile.targetCarbs || 1)) * 100));
  const fiberPercent = Math.min(100, Math.round((totalFiber / (userProfile.targetFiber || 1)) * 100));

  const handleAddWater = (delta: number) => {
    const nextVal = Math.max(0, waterAmount + delta);
    setWaterAmount(nextVal);
    saveStoredWater(selectedDate, nextVal);
  };

  const mealSlots: { type: MealType; title: string; icon: React.ReactNode; color: string }[] = [
    {
      type: 'breakfast',
      title: 'Breakfast',
      icon: <Coffee className="w-5 h-5 text-amber-600" />,
      color: 'bg-amber-50/80 border-amber-200/60'
    },
    {
      type: 'lunch',
      title: 'Lunch',
      icon: <Sun className="w-5 h-5 text-orange-500" />,
      color: 'bg-orange-50/80 border-orange-200/60'
    },
    {
      type: 'dinner',
      title: 'Dinner',
      icon: <Moon className="w-5 h-5 text-indigo-500" />,
      color: 'bg-indigo-50/80 border-indigo-200/60'
    },
    {
      type: 'snack',
      title: 'Snack',
      icon: <Cookie className="w-5 h-5 text-emerald-600" />,
      color: 'bg-emerald-50/80 border-emerald-200/60'
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      <div className="grid grid-cols-1 gap-6 items-start">
        
        {/* Left Column (Stats, Gauge, Water, Scanner Banner) */}
        <div className="space-y-5">

          {/* 1. Main Calorie Summary Card (Foodvisor Style) */}
          <div className="bg-white rounded-[24px] p-5 border border-[#F0EEEA] shadow-[0_8px_24px_rgba(16,24,40,0.06)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-[13px] font-medium block ${isOverLimit ? 'text-rose-600 font-bold' : 'text-[#6B7280]'}`}>
                  {isOverLimit ? 'Over calorie limit' : 'Remaining today'}
                </span>
                <div className="flex items-baseline mt-1">
                  <span className={`text-[44px] font-extrabold leading-none ${isOverLimit ? 'text-rose-600' : 'text-slate-900'}`}>
                    {isOverLimit ? `+${excessCalories}` : remainingCalories}
                  </span>
                  <span className={`text-base font-normal ml-1.5 ${isOverLimit ? 'text-rose-500 font-semibold' : 'text-slate-500'}`}>
                    kcal
                  </span>
                </div>
              </div>

              {/* Integrated Foodvisor Ring Gauge */}
              <div className="relative w-18 h-18 flex items-center justify-center shrink-0">
                <svg className="w-18 h-18 transform -rotate-90">
                  <circle
                    cx="36"
                    cy="36"
                    r="28"
                    stroke="#EEF2F6"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="36"
                    cy="36"
                    r="28"
                    stroke={isOverLimit ? '#F43F5E' : '#0AB68B'}
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={176}
                    strokeDashoffset={176 - (176 * calPercent) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                <span className={`absolute text-xs font-extrabold ${isOverLimit ? 'text-rose-600' : 'text-slate-800'}`}>
                  {calPercent}%
                </span>
              </div>
            </div>

            {/* Over-limit Warning Pill */}
            {isOverLimit && (
              <div className="p-2.5 bg-rose-50 border border-rose-200/80 rounded-xl text-[11px] text-rose-700 font-medium leading-tight flex items-start space-x-2">
                <span className="shrink-0 text-sm">⚠️</span>
                <span>
                  Deleting workouts lowers the final limit. You exceeded the updated limit by <strong>{excessCalories} kcal</strong>.
                </span>
              </div>
            )}

            {/* Progress Bar & 3 Column Stats */}
            <div className="space-y-2">
              <div className="w-full h-[8px] bg-[#EEF2F6] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverLimit ? 'bg-gradient-to-r from-rose-500 to-red-600' : 'bg-gradient-to-r from-[#0AB68B] to-[#0EBB8A]'
                  }`}
                  style={{ width: `${calPercent}%` }}
                />
              </div>

              <div className="flex justify-between pt-1 text-xs">
                <div>
                  <span className="text-[11px] font-medium text-slate-400 block">Eaten</span>
                  <span className="text-sm font-extrabold text-slate-800">{totalCalories} kcal</span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] font-medium text-amber-600 block">Burned</span>
                  <span className="text-sm font-extrabold text-amber-600">+{totalBurned} kcal</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-medium text-[#0AB68B] block">Final limit</span>
                  <span className="text-sm font-extrabold text-[#0AB68B]">{effectiveTarget} kcal</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium pt-1">
                <span>
                  Target ({userProfile.targetCalories}) + Sport ({totalBurned}) = {effectiveTarget} kcal
                </span>
                <button
                  onClick={() => setIsCalorieInfoOpen(true)}
                  aria-label="How the calorie target is calculated"
                  className="inline-flex items-center space-x-1 text-[10px] font-extrabold text-[#0AB68B] hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100/90 px-2 py-0.5 rounded-lg transition-all border border-emerald-200/70 cursor-pointer"
                  title="See the detailed calorie and macro calculation"
                >
                  <Info className="w-3 h-3 text-[#0AB68B]" />
                  <span>How it's calculated</span>
                </button>
              </div>
            </div>

            {/* Macros Breakdown (Spacious 2x2 Grid with Progress Bars) */}
            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#F0EEEA]">
              {/* Fat */}
              <div className="p-2.5 rounded-2xl bg-amber-50/80 border border-amber-200/60 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <div className="flex items-center space-x-1.5 min-w-0 truncate">
                    <Flame className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                    <span className="text-[11px] font-black text-amber-900 truncate">Fat</span>
                  </div>
                  <div className="text-[11px] font-extrabold text-slate-800 shrink-0 whitespace-nowrap">
                    <span>{totalFat}</span>
                    <span className="text-slate-400 font-medium">/{userProfile.targetFat}g</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-amber-200/60 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${fatPercent}%` }} />
                </div>
              </div>

              {/* Protein */}
              <div className="p-2.5 rounded-2xl bg-[#E6F9F5] border border-[#0AB68B]/30 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <div className="flex items-center space-x-1.5 min-w-0 truncate">
                    <Egg className="w-4 h-4 text-[#087f61] shrink-0" />
                    <span className="text-[11px] font-black text-[#087f61] truncate">Protein</span>
                  </div>
                  <div className="text-[11px] font-extrabold text-slate-800 shrink-0 whitespace-nowrap">
                    <span>{totalProtein}</span>
                    <span className="text-slate-400 font-medium">/{userProfile.targetProtein}g</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-[#0AB68B]/20 rounded-full overflow-hidden">
                  <div className="h-full bg-[#0AB68B] rounded-full transition-all duration-300" style={{ width: `${proteinPercent}%` }} />
                </div>
              </div>

              {/* Carbs */}
              <div className="p-2.5 rounded-2xl bg-sky-50/80 border border-sky-200/60 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <div className="flex items-center space-x-1.5 min-w-0 truncate">
                    <Wheat className="w-4 h-4 text-sky-600 shrink-0" />
                    <span className="text-[11px] font-black text-sky-900 truncate">Carbs</span>
                  </div>
                  <div className="text-[11px] font-extrabold text-slate-800 shrink-0 whitespace-nowrap">
                    <span>{totalCarbs}</span>
                    <span className="text-slate-400 font-medium">/{userProfile.targetCarbs}g</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-sky-200/60 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full transition-all duration-300" style={{ width: `${carbsPercent}%` }} />
                </div>
              </div>

              {/* Fiber */}
              <div className="p-2.5 rounded-2xl bg-orange-50/80 border border-orange-200/60 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <div className="flex items-center space-x-1.5 min-w-0 truncate">
                    <Leaf className="w-4 h-4 text-orange-600 shrink-0" />
                    <span className="text-[11px] font-black text-orange-900 truncate">Fiber</span>
                  </div>
                  <div className="text-[11px] font-extrabold text-slate-800 shrink-0 whitespace-nowrap">
                    <span>{totalFiber}</span>
                    <span className="text-slate-400 font-medium">/{userProfile.targetFiber}g</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-orange-200/60 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-300" style={{ width: `${fiberPercent}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* 1.5. Tamagotchi Pet Widget (Directly under Calorie/Macros card, collapsible) */}
          <TamagotchiWidget
            tamagotchi={tamagotchi}
            setTamagotchi={setTamagotchi || (() => {})}
            userTargetCalories={userProfile.targetCalories}
            todayCaloriesEaten={totalCalories}
            todayWorkoutsCount={workoutLogs.length}
            mealLogs={mealLogs}
            onOpenModal={onOpenTamagotchiModal || (() => {})}
            onOpenScanner={onOpenScanner}
            onOpenWorkoutModal={onOpenWorkoutModal}
            onOpenPlayModal={onOpenPlayModal}
          />

          {/* 2. Photo Camera Scanner Banner CTA */}
          <div
            onClick={onOpenScanner}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenScanner();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Open the camera scanner"
            className="bg-gradient-to-r from-[#0AB68B] to-emerald-600 p-4 rounded-[24px] text-white flex items-center justify-between cursor-pointer shadow-[0_8px_24px_rgba(10,182,139,0.25)] hover:scale-[1.01] transition-all group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-white text-[#0AB68B] flex items-center justify-center shadow-md shrink-0">
                <Camera className="w-6 h-6 text-[#0AB68B]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <h3 className="font-extrabold text-sm text-white truncate">Photograph a dish</h3>
                  <Sparkles className="w-4 h-4 text-amber-200 animate-pulse shrink-0" />
                </div>
                <p className="text-xs text-emerald-50 mt-0.5 truncate">Weight and macro detection from a photo in 2 sec</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform shrink-0 ml-2" />
          </div>

          {/* 3. Water Tracker */}
          <div className="bg-white rounded-[24px] p-4 border border-[#F0EEEA] shadow-[0_8px_24px_rgba(16,24,40,0.06)] flex items-center justify-between">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-100 shrink-0">
                <Droplets className="w-5 h-5 text-cyan-500 fill-cyan-500/20" />
              </div>
              <div>
                <span className="text-xs font-extrabold text-slate-900 block">
                  Water balance
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {waterAmount} ml / {userProfile.targetWater || 2400} ml
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleAddWater(-250)}
                aria-label="Remove 250 milliliters of water"
                className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black hover:bg-slate-200 transition-colors"
              >
                -
              </button>
              <button
                onClick={() => handleAddWater(250)}
                aria-label="Add 250 milliliters of water"
                className="px-3 py-1.5 rounded-xl bg-cyan-500 text-white font-extrabold text-xs flex items-center space-x-1 shadow-md shadow-cyan-500/20 hover:bg-cyan-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+250 ml</span>
              </button>
            </div>
          </div>

          {/* 4. Workout & Exercise Activity Card */}
          <div className="bg-white rounded-[24px] p-4 border border-[#F0EEEA] shadow-[0_8px_24px_rgba(16,24,40,0.06)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60 p-2">
                  <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 block">
                    Activity & Workouts
                  </h4>
                  <span className="text-[11px] font-bold text-amber-600">
                    +{totalBurned} kcal burned
                  </span>
                </div>
              </div>

              <button
                onClick={onOpenWorkoutModal}
                aria-label="Log a workout"
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-xs flex items-center space-x-1 shadow-md shadow-amber-500/20 hover:opacity-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Workout</span>
              </button>
            </div>

            {/* List of logged workouts */}
            {workoutLogs.length > 0 ? (
              <div className="space-y-2 pt-1 border-t border-slate-100">
                {workoutLogs.map((w, wIdx) => (
                  <div key={`workout-item-${w.id || wIdx}-${wIdx}`} className="flex items-center justify-between p-2.5 bg-amber-50/50 border border-amber-200/50 rounded-2xl text-xs">
                    <div className="flex items-center space-x-2">
                      <Dumbbell className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span className="font-extrabold text-slate-900 block">{w.title}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{w.durationMinutes} min • {w.time}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-amber-600">+{w.caloriesBurned} kcal</span>
                      <button
                        onClick={() => onDeleteWorkout(w.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Delete workout"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 text-center font-medium pt-1">
                  💡 Deleting a workout automatically subtracts the burned calories from your final limit.
                </p>
              </div>
            ) : (
              <div className="pt-1 text-center">
                <p className="text-[11px] text-slate-400 italic">
                  Tell the AI about your workout to raise your daily calorie allowance!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Meal Slots for Breakfast, Lunch, Dinner, Snack) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
              Meals
            </h3>
            <span className="text-xs font-extrabold text-slate-500">
              Entries: {mealLogs.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {mealSlots.map((slot) => {
              const slotMeals = mealLogs.filter((m) => m.type === slot.type);
              const slotCalories = slotMeals.reduce((acc, m) => acc + m.calories, 0);

              return (
                <div
                  key={slot.type}
                  className="bg-white rounded-[24px] p-4 border border-[#F0EEEA] shadow-[0_8px_24px_rgba(16,24,40,0.06)] space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2.5 rounded-2xl border ${slot.color}`}>
                          {slot.icon}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-900">{slot.title}</h4>
                          <span className="text-xs text-slate-400 font-bold">
                            {slotCalories} kcal
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => onOpenSearch(slot.type)}
                          className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-[#E6F9F5] hover:text-[#0AB68B] transition-colors flex items-center justify-center shrink-0"
                          title="Search foods"
                          aria-label={`Search foods for ${slot.title}`}
                        >
                          <Search className="w-4 h-4" />
                        </button>
                        <button
                          onClick={onOpenScanner}
                          aria-label={`Scan a photo for ${slot.title}`}
                          className="h-9 px-3 rounded-xl bg-[#0AB68B] text-white font-extrabold text-xs flex items-center gap-1 shadow-md shadow-[#0AB68B]/20 hover:bg-[#089e78] transition-colors shrink-0 whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Photo</span>
                        </button>
                      </div>
                    </div>

                    {/* Logged Meals List */}
                    {slotMeals.length > 0 ? (
                      <div className="space-y-2.5 pt-3">
                        {slotMeals.map((meal, mIdx) => (
                          <div
                            key={`slot-meal-${slot.type}-${meal.id || mIdx}-${mIdx}`}
                            onClick={() => setSelectedMealForDetail(meal)}
                            className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs font-medium text-slate-800 hover:border-[#0AB68B]/50 hover:bg-[#E6F9F5]/30 transition-all cursor-pointer group shadow-2xs"
                            title="Tap to open full macros and adjust the portion"
                          >
                            <div className="flex items-center space-x-3 overflow-hidden">
                              {meal.imageUrl ? (
                                <img
                                  src={meal.imageUrl}
                                  alt={meal.title}
                                  className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200 group-hover:scale-105 transition-transform"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                                  <Utensils className="w-5 h-5 text-slate-500" />
                                </div>
                              )}
                              <div className="truncate">
                                <span className="font-extrabold text-slate-900 block truncate group-hover:text-[#0AB68B] transition-colors">
                                  {meal.title}
                                </span>
                                <div className="flex items-center space-x-1.5 flex-wrap">
                                  <span className="text-[10px] text-slate-400 font-semibold">
                                    {meal.portionGrams}g • P:{meal.protein} F:{meal.fat} C:{meal.carbs}
                                  </span>
                                  {meal.notes && (
                                    <span className="text-[9px] text-[#0AB68B] bg-[#E6F9F5] px-1.5 py-0.5 rounded-md font-bold truncate max-w-[130px]" title={meal.notes}>
                                      💬 {meal.notes}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="font-black text-[#0AB68B] text-xs">
                                {meal.calories} kcal
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteMeal(meal.id);
                                }}
                                className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                title="Delete dish"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic text-center py-6">
                        No entries yet. Snap a photo of your dish!
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Friends & Community Interactive Banner */}
        {onOpenFriends && (
          <div
            onClick={onOpenFriends}
            className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200/90 rounded-3xl p-4 flex items-center justify-between shadow-sm cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0AB68B] to-teal-400 flex items-center justify-center text-white shadow-sm shrink-0">
                <Users className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <h4 className="font-extrabold text-slate-900 text-xs truncate">Friends & food feed</h4>
                  <span className="bg-emerald-100 text-[#0AB68B] text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    Activity
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  Share dishes, compete on calories and send reactions 🔥
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-emerald-600 group-hover:translate-x-0.5 transition-transform shrink-0 ml-2" />
          </div>
        )}

      </div>

      {/* Interactive Meal Detail & Macro Inspector Modal */}
      <MealDetailModal
        isOpen={!!selectedMealForDetail}
        meal={selectedMealForDetail}
        onClose={() => setSelectedMealForDetail(null)}
        userProfile={userProfile}
        onUpdateMeal={(updatedMeal) => {
          if (onUpdateMeal) {
            onUpdateMeal(updatedMeal);
          }
          setSelectedMealForDetail(null);
        }}
        onDeleteMeal={(mealId) => {
          onDeleteMeal(mealId);
          setSelectedMealForDetail(null);
        }}
      />

      {/* Comprehensive Calorie & Metabolism Transparency Modal */}
      {isCalorieInfoOpen && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 font-sans">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg bg-white rounded-[32px] p-6 text-slate-800 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#0AB68B] flex items-center justify-center shrink-0 border border-emerald-100">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    How your target is calculated
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Clinical Mifflin-St Jeor formula
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCalorieInfoOpen(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formula Step-by-Step Breakdown */}
            <div className="space-y-3 text-xs">
              {/* Step 1: BMR */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span className="flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-md bg-emerald-100 text-[#0AB68B] flex items-center justify-center text-[11px] font-black">1</span>
                    <span>Base metabolic rate (BMR)</span>
                  </span>
                  <span className="text-sm font-black text-slate-900">{calculatedGoals.bmr} kcal</span>
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  The energy your body needs at full rest for breathing, circulation and organ function.
                  Calculated for: {userProfile.gender === 'male' ? 'Male' : 'Female'}, {userProfile.age} y.o., {userProfile.height} cm, {userProfile.currentWeight} kg.
                </p>
              </div>

              {/* Step 2: TDEE */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-1">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span className="flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-md bg-teal-100 text-teal-700 flex items-center justify-center text-[11px] font-black">2</span>
                    <span>Daily burn (TDEE)</span>
                  </span>
                  <span className="text-sm font-black text-slate-900">{calculatedGoals.tdee} kcal</span>
                </div>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  Total energy expenditure given your activity level ({userProfile.activityLevel === 'sedentary' ? 'Sedentary' : userProfile.activityLevel === 'light' ? 'Light activity' : userProfile.activityLevel === 'moderate' ? 'Moderate' : userProfile.activityLevel === 'active' ? 'High' : 'Athlete'}). This is the intake for holding weight.
                </p>
              </div>

              {/* Step 3: Goal & Adjustment */}
              <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-1">
                <div className="flex items-center justify-between font-bold text-emerald-950">
                  <span className="flex items-center space-x-1.5">
                    <span className="w-5 h-5 rounded-md bg-emerald-200 text-emerald-800 flex items-center justify-center text-[11px] font-black">3</span>
                    <span>Goal adjustment</span>
                  </span>
                  <span className="text-sm font-black text-emerald-700">
                    {userProfile.targetWeight < userProfile.currentWeight
                      ? `${calculatedGoals.calorieAdjustment || -400} kcal (deficit)`
                      : userProfile.targetWeight > userProfile.currentWeight
                      ? `+${calculatedGoals.calorieAdjustment || 300} kcal (surplus)`
                      : '0 kcal (balance)'}
                  </span>
                </div>
                <p className="text-emerald-800/80 text-[11px] leading-relaxed">
                  {userProfile.targetWeight < userProfile.currentWeight
                    ? `Goal: lose weight from ${userProfile.currentWeight} kg to ${userProfile.targetWeight} kg. A safe deficit to burn fat without losing muscle.`
                    : userProfile.targetWeight > userProfile.currentWeight
                    ? `Goal: gain muscle from ${userProfile.currentWeight} kg to ${userProfile.targetWeight} kg.`
                    : 'Goal: maintain a stable weight and feel great.'}
                </p>
              </div>

              {/* Step 4: Final Daily Target & Today's Workouts */}
              <div className="p-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-sm space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-emerald-100 font-extrabold block">
                      Your daily target
                    </span>
                    <span className="text-2xl font-black">{userProfile.targetCalories} kcal/day</span>
                  </div>
                  {totalBurned > 0 && (
                    <div className="text-right bg-white/20 px-3 py-1.5 rounded-xl backdrop-blur-xs">
                      <span className="text-[10px] text-emerald-100 font-bold block">+ Sport today</span>
                      <span className="text-sm font-black">+{totalBurned} kcal</span>
                    </div>
                  )}
                </div>
                {totalBurned > 0 && (
                  <div className="pt-1 text-[11px] text-emerald-100 border-t border-white/20">
                    Final limit today: <strong>{effectiveTarget} kcal</strong> (workout calories are auto-added to the limit).
                  </div>
                )}
              </div>

              {/* Macros Breakdown Cards */}
              <div className="space-y-1.5 pt-1">
                <h4 className="font-extrabold text-slate-800 text-xs">Your personal macro balance:</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 bg-rose-50 border border-rose-200/70 rounded-xl text-center">
                    <span className="text-[10px] font-bold text-rose-500 block">Protein</span>
                    <span className="text-xs font-black text-rose-900">{userProfile.targetProtein} g</span>
                    <span className="text-[9px] text-rose-600 font-semibold block">{userProfile.targetProtein * 4} kcal</span>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200/70 rounded-xl text-center">
                    <span className="text-[10px] font-bold text-amber-600 block">Fat</span>
                    <span className="text-xs font-black text-amber-900">{userProfile.targetFat} g</span>
                    <span className="text-[9px] text-amber-600 font-semibold block">{userProfile.targetFat * 9} kcal</span>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200/70 rounded-xl text-center">
                    <span className="text-[10px] font-bold text-emerald-600 block">Carbs</span>
                    <span className="text-xs font-black text-emerald-900">{userProfile.targetCarbs} g</span>
                    <span className="text-[9px] text-emerald-600 font-semibold block">{userProfile.targetCarbs * 4} kcal</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Close / Action Button */}
            <div className="pt-2">
              <button
                onClick={() => setIsCalorieInfoOpen(false)}
                className="w-full py-3 rounded-2xl bg-[#0AB68B] text-white font-extrabold text-xs shadow-md hover:bg-emerald-600 transition-colors cursor-pointer"
              >
                Got it, close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
