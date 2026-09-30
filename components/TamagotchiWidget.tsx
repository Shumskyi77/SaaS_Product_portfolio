'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  Utensils,
  Dumbbell,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  Plus,
  Play,
  Clock,
} from 'lucide-react';
import {
  TamagotchiState,
  TAMAGOTCHI_BREEDS,
  TamagotchiMood,
} from '../types/tamagotchi';
import { MealLog } from '../types/meal';
import { calculateTamagotchiStats, saveStoredTamagotchi, getTamagotchiFriendship } from '../lib/store';
import { TamagotchiAvatar } from './TamagotchiAvatar';

interface TamagotchiWidgetProps {
  tamagotchi: TamagotchiState | null;
  setTamagotchi: (pet: TamagotchiState | null) => void;
  userTargetCalories: number;
  todayCaloriesEaten: number;
  todayWorkoutsCount?: number;
  mealLogs?: MealLog[];
  onOpenModal: () => void;
  onOpenScanner?: () => void;
  onOpenWorkoutModal?: () => void;
  onOpenPlayModal?: () => void;
}

export const TamagotchiWidget: React.FC<TamagotchiWidgetProps> = ({
  tamagotchi,
  setTamagotchi,
  userTargetCalories,
  todayCaloriesEaten,
  todayWorkoutsCount = 0,
  mealLogs = [],
  onOpenModal,
  onOpenScanner,
  onOpenWorkoutModal,
  onOpenPlayModal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return tamagotchi?.collapsedWidget || false;
  });
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [isPetBouncing, setIsPetBouncing] = useState(false);

  const toggleCollapse = () => {
    const nextVal = !isCollapsed;
    setIsCollapsed(nextVal);
    if (tamagotchi) {
      const updated = { ...tamagotchi, collapsedWidget: nextVal };
      setTamagotchi(updated);
      saveStoredTamagotchi(updated);
    }
  };

  const handlePetAction = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newHeart = { id: Date.now(), x, y };
    setHearts((prev) => [...prev.slice(-8), newHeart]);
    setIsPetBouncing(true);

    if (tamagotchi && tamagotchi.isAlive) {
      const updated: TamagotchiState = {
        ...tamagotchi,
        happiness: Math.min(100, (tamagotchi.happiness || 80) + 4),
        lastInteraction: new Date().toISOString(),
      };
      setTamagotchi(updated);
      saveStoredTamagotchi(updated);
    }

    setTimeout(() => setIsPetBouncing(false), 500);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
    }, 1100);
  };

  // Case 1: No Pet yet
  if (!tamagotchi) {
    return (
      <div
        id="tamagotchi-empty-banner"
        className="bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-teal-500/10 rounded-[24px] p-4.5 border border-emerald-500/20 shadow-sm flex items-center justify-between gap-3"
      >
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-xs flex items-center justify-center shrink-0 text-2xl border border-emerald-100">
            🐶
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-black text-slate-900 leading-snug">
              Adopt a Tamagotchi Friend 🐾
            </h4>
            <p className="text-[11px] text-slate-600 line-clamp-1 font-medium mt-0.5">
              Eats together with you and gains/loses energy by the hour!
            </p>
          </div>
        </div>

        <button
          id="tamagotchi-create-banner-btn"
          onClick={onOpenModal}
          className="px-3.5 py-2 bg-[#0AB68B] hover:bg-[#099f79] text-white rounded-xl text-xs font-black shadow-md shrink-0 active:scale-95 transition flex items-center space-x-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Choose</span>
        </button>
      </div>
    );
  }

  // Case 2: Pet is dead
  if (!tamagotchi.isAlive) {
    return (
      <div
        id="tamagotchi-dead-banner"
        onClick={onOpenModal}
        className="cursor-pointer bg-rose-50/90 rounded-[24px] p-4 border border-rose-200 shadow-sm flex items-center justify-between gap-3 hover:bg-rose-100/80 transition"
      >
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-xl shrink-0">
            🦴
          </div>
          <div>
            <h4 className="text-xs font-bold text-rose-900">
              {tamagotchi.name} has fallen asleep forever...
            </h4>
            <p className="text-[11px] text-rose-700 font-medium">
              Tap to complete Redemption Day and adopt a new friend 🐾
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-rose-600 shrink-0">Redemption →</span>
      </div>
    );
  }

  // Case 3: Pet is Alive -> compute dynamic time-decay stats
  const stats = calculateTamagotchiStats(
    tamagotchi,
    userTargetCalories,
    todayCaloriesEaten,
    todayWorkoutsCount,
    mealLogs,
    true
  );
  const friendship = getTamagotchiFriendship(tamagotchi);

  const breedObj = TAMAGOTCHI_BREEDS.find((b) => b.id === tamagotchi.breed) || TAMAGOTCHI_BREEDS[0];

  const moodEmojis: Record<TamagotchiMood, string> = {
    happy: '💖 Full and happy',
    playful: '🎾 Full of energy',
    hungry: '🍖 Got hungry',
    sad: '🥺 Wants to eat',
    angry: '🛑 Tummy is full',
    sleepy: '🌙 Sweet dreams',
  };

  const hungerDescriptions: Record<string, string> = {
    full: 'Full (energy at max)',
    satisfied: 'Full (digesting)',
    getting_hungry: 'Appetite growing (time for a snack)',
    hungry: 'Hungry (tummy rumbling)',
    starving: 'Very hungry!',
  };

  return (
    <div
      id="tamagotchi-dashboard-card"
      className="bg-white rounded-[26px] border border-[#F0EEEA] shadow-[0_8px_24px_rgba(16,24,40,0.06)] overflow-hidden transition-all duration-300"
    >
      {/* If Collapsed: Clean single compact strip */}
      {isCollapsed ? (
        <div
          id="tamagotchi-collapsed-row"
          onClick={toggleCollapse}
          className="p-3.5 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition select-none"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center p-0.5 border border-emerald-200 shrink-0 overflow-hidden">
              <TamagotchiAvatar
                breed={tamagotchi.breed}
                mood={stats.mood}
                customSrc={stats.imageSrc}
                alt={tamagotchi.name}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-xs font-black text-slate-900 truncate">
                  {tamagotchi.name}
                </span>
                <span className="text-[10px] font-bold text-slate-500 px-1.5 py-0.2 bg-slate-100 rounded-full border border-slate-200 shrink-0">
                  {breedObj.name}
                </span>
                <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-full border border-amber-200 shrink-0 flex items-center space-x-0.5">
                  <span>🔥</span>
                  <span>{friendship.daysTogether} days</span>
                </span>
              </div>
              <p className="text-[11px] font-semibold text-emerald-700 truncate mt-0.5">
                Satiety {stats.satietyPercent}% • {todayCaloriesEaten}/{stats.limit} kcal
              </p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
            className="flex items-center space-x-1 text-xs text-slate-400 font-bold hover:text-slate-700 bg-slate-100/70 hover:bg-slate-200 px-2.5 py-1 rounded-full transition shrink-0"
          >
            <span>Expand</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* If Expanded: Full Rich Card */
        <div className="flex flex-col">
          {/* Top Bar with Breed, Name, Info & Collapse */}
          <div className="p-3.5 px-4 bg-gradient-to-r from-emerald-500/5 via-amber-500/5 to-transparent border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="text-base">🐾</span>
              <div className="flex items-center space-x-1.5 min-w-0 flex-wrap">
                <span className="text-sm font-black text-slate-900 truncate">
                  {tamagotchi.name}
                </span>
                <span className="text-[11px] font-bold text-slate-500 px-2 py-0.5 bg-white rounded-full border border-slate-200 shrink-0">
                  {breedObj.name}
                </span>
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900 border border-amber-200 text-[10px] font-black shadow-2xs shrink-0">
                  <span>🔥</span>
                  <span>{friendship.streakText}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                id="tamagotchi-details-btn"
                onClick={onOpenModal}
                className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-full transition cursor-pointer"
              >
                Info & Care
              </button>
              <button
                id="tamagotchi-toggle-collapse-btn"
                onClick={toggleCollapse}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Collapse"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-5 space-y-4">
            {/* Interactive Pet Visual + Dynamic Speech Bubble */}
            <div className="flex items-center gap-3">
              {/* Pet Cutout with Petting Hearts */}
              <div
                id="tamagotchi-pet-canvas"
                onClick={handlePetAction}
                className="relative cursor-pointer w-28 h-28 sm:w-32 sm:h-32 shrink-0 rounded-2xl bg-gradient-to-b from-amber-50/80 to-emerald-50/50 border border-emerald-100 flex items-center justify-center p-2 group shadow-inner select-none"
              >
                {/* Animated Hearts on Tap */}
                {hearts.map((h) => (
                  <motion.div
                    key={h.id}
                    initial={{ scale: 0.4, y: 0, opacity: 1 }}
                    animate={{ scale: 1.2, y: -50, opacity: 0 }}
                    transition={{ duration: 0.9 }}
                    className="absolute pointer-events-none text-xl z-20"
                    style={{ left: h.x, top: h.y }}
                  >
                    💖
                  </motion.div>
                ))}

                <TamagotchiAvatar
                  breed={tamagotchi.breed}
                  mood={stats.mood}
                  customSrc={stats.imageSrc}
                  alt={tamagotchi.name}
                  className="w-full h-full object-contain filter drop-shadow-md"
                  animate={
                    isPetBouncing
                      ? { scale: [1, 1.2, 0.9, 1], y: [0, -12, 0] }
                      : { y: [0, -4, 0] }
                  }
                  transition={
                    isPetBouncing
                      ? { duration: 0.4 }
                      : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                  }
                />

                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-white/90 backdrop-blur rounded text-[9px] font-extrabold text-slate-600 shadow-2xs border border-slate-200">
                  Pet 💖
                </span>
              </div>

              {/* Speech & Real-Time Hunger status */}
              <div className="flex-1 min-w-0 space-y-2">
                {/* Speech Bubble */}
                <div className="relative bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 text-xs font-semibold text-slate-800 leading-snug shadow-2xs">
                  {stats.speechText}
                  <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-slate-50 border-b border-l border-slate-200 rotate-45" />
                </div>

                {/* Mood and Digestion State */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                    {moodEmojis[stats.mood]}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {hungerDescriptions[stats.hungerState] || stats.hungerState}
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic Time-Decay Satiety Bar */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Satiety right now (by hour):</span>
                </span>
                <span className="text-emerald-700 font-extrabold">
                  {stats.satietyPercent}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    stats.satietyPercent >= 75
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                      : stats.satietyPercent >= 40
                      ? 'bg-amber-400'
                      : 'bg-rose-400'
                  }`}
                  style={{ width: `${Math.min(100, stats.satietyPercent)}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] font-semibold text-slate-400">
                <span>Daily diet: {todayCaloriesEaten} / {stats.limit} kcal</span>
                <span>Day goal: {stats.dailySatietyPercent}%</span>
              </div>
            </div>

            {/* Quick Interactive Actions */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                id="tamagotchi-pet-action-btn"
                onClick={handlePetAction}
                className="py-2 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 active:scale-95 cursor-pointer"
              >
                <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500 shrink-0" />
                <span>Pet</span>
              </button>

              <button
                id="tamagotchi-feed-action-btn"
                onClick={onOpenScanner}
                className="py-2 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 active:scale-95 cursor-pointer"
              >
                <Utensils className="w-3.5 h-3.5 shrink-0" />
                <span>Feed</span>
              </button>

              <button
                id="tamagotchi-play-action-btn"
                onClick={onOpenPlayModal || onOpenWorkoutModal}
                className="py-2 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 active:scale-95 cursor-pointer"
              >
                <span className="text-xs">🎾</span>
                <span>Play</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
