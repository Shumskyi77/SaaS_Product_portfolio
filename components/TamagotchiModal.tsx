'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Heart,
  Sparkles,
  Flame,
  Utensils,
  AlertTriangle,
  Award,
  ChevronRight,
  RotateCcw,
  Smile,
  ShieldAlert,
  Info,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import {
  TamagotchiState,
  TamagotchiBreed,
  TAMAGOTCHI_BREEDS,
  BreedInfo,
} from '../types/tamagotchi';
import { MealLog } from '../types/meal';
import { calculateTamagotchiStats, saveStoredTamagotchi, getTamagotchiFriendship } from '../lib/store';
import { getTamagotchiImage } from '../lib/tamagotchiAssets';
import { TamagotchiAvatar } from './TamagotchiAvatar';

interface TamagotchiModalProps {
  isOpen: boolean;
  onClose: () => void;
  tamagotchi: TamagotchiState | null;
  setTamagotchi: (pet: TamagotchiState | null) => void;
  userTargetCalories: number;
  todayCaloriesEaten: number;
  todayWorkoutsCount?: number;
  mealLogs?: MealLog[];
  onOpenScanner?: () => void;
}

export const TamagotchiModal: React.FC<TamagotchiModalProps> = ({
  isOpen,
  onClose,
  tamagotchi,
  setTamagotchi,
  userTargetCalories,
  todayCaloriesEaten,
  todayWorkoutsCount = 0,
  mealLogs = [],
  onOpenScanner,
}) => {
  const [selectedBreed, setSelectedBreed] = useState<TamagotchiBreed>('shiba');
  const [petName, setPetName] = useState('');
  const [nameError, setNameError] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'care' | 'history'>('care');
  const [petHearts, setPetHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  // Tamagotchi target calories = userTargetCalories - 200 (min 700)
  const petLimit = Math.max(700, userTargetCalories - 200);
  const punishmentTarget = userTargetCalories + 200;

  // Auto-switch tab based on pet state
  React.useEffect(() => {
    if (!tamagotchi || !tamagotchi.isAlive) {
      setActiveTab('create');
    } else {
      setActiveTab('care');
    }
  }, [tamagotchi, isOpen]);

  if (!isOpen) return null;

  const pastNames = tamagotchi?.usedNames || [];

  const handleAdopt = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = petName.trim();

    if (!trimmedName) {
      setNameError('Please enter a name for your pet');
      return;
    }

    // Check if name was already used in history (cannot use same name as previous pets)
    const isNameUsed = pastNames.some(
      (n) => n.toLowerCase() === trimmedName.toLowerCase()
    );

    if (isNameUsed) {
      setNameError(
        `The name "${trimmedName}" was already used by a previous pet. Please choose a new unique name!`
      );
      return;
    }

    // Check punishment requirement
    if (tamagotchi?.needsPunishmentDay && !tamagotchi.punishmentCompleted) {
      setNameError(
        `First complete Redemption Day (eat ${punishmentTarget} kcal) to adopt a new friend.`
      );
      return;
    }

    const newPet: TamagotchiState = {
      id: `pet_${Date.now()}`,
      name: trimmedName,
      breed: selectedBreed,
      adoptedAt: new Date().toISOString(),
      isAlive: true,
      health: 100,
      happiness: 100,
      consecutiveUnderfedDays: 0,
      needsPunishmentDay: false,
      punishmentCompleted: false,
      usedNames: [...pastNames, trimmedName],
      pastPets: tamagotchi?.pastPets || [],
      collapsedWidget: false,
    };

    setTamagotchi(newPet);
    saveStoredTamagotchi(newPet);
    setPetName('');
    setNameError('');
    setActiveTab('care');
  };

  const handleCompletePunishment = () => {
    if (!tamagotchi) return;
    const updated: TamagotchiState = {
      ...tamagotchi,
      needsPunishmentDay: false,
      punishmentCompleted: true,
    };
    setTamagotchi(updated);
    saveStoredTamagotchi(updated);
  };

  const handlePetAction = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newHeart = { id: Date.now(), x, y };
    setPetHearts((prev) => [...prev.slice(-10), newHeart]);

    if (tamagotchi && tamagotchi.isAlive) {
      const updated: TamagotchiState = {
        ...tamagotchi,
        happiness: Math.min(100, (tamagotchi.happiness || 80) + 5),
        lastInteraction: new Date().toISOString(),
      };
      setTamagotchi(updated);
      saveStoredTamagotchi(updated);
    }

    setTimeout(() => {
      setPetHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
    }, 1200);
  };

  const stats = tamagotchi && tamagotchi.isAlive
    ? calculateTamagotchiStats(
        tamagotchi,
        userTargetCalories,
        todayCaloriesEaten,
        todayWorkoutsCount,
        mealLogs,
        true
      )
    : null;

  const currentBreedObj = TAMAGOTCHI_BREEDS.find((b) => b.id === (tamagotchi?.breed || selectedBreed)) || TAMAGOTCHI_BREEDS[0];
  const friendship = getTamagotchiFriendship(tamagotchi);

  return (
    <div
      id="tamagotchi-modal-overlay"
      className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        id="tamagotchi-modal-container"
        className="bg-[#FAF8F5] w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[32px] border border-slate-200/80 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden sm:my-auto"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner font-extrabold text-lg shrink-0">
              🐾
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap">
                <h2 className="text-lg font-black text-slate-900 leading-tight truncate">
                  {tamagotchi?.isAlive ? tamagotchi.name : 'Tamagotchi Friend'}
                </h2>
                {tamagotchi?.isAlive && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-black shadow-2xs shrink-0">
                    <span>🔥</span>
                    <span>{friendship.streakText}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium truncate">
                {tamagotchi?.isAlive
                  ? `${currentBreedObj.name} • ${friendship.rankTitle}`
                  : 'Your pet eats together with you'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {tamagotchi && tamagotchi.isAlive && (
              <button
                id="tamagotchi-switch-create-tab"
                onClick={() => setActiveTab(activeTab === 'care' ? 'history' : 'care')}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
              >
                {activeTab === 'care' ? 'History 📜' : 'Pet 🐾'}
              </button>
            )}
            <button
              id="tamagotchi-modal-close-btn"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* ================= CASE 1: PET IS ALIVE & CARE TAB ================= */}
          {tamagotchi && tamagotchi.isAlive && activeTab === 'care' && stats && (
            <div className="space-y-5">
              {/* Pet Interactive Canvas Card */}
              <div
                onClick={handlePetAction}
                className="relative cursor-pointer select-none overflow-hidden rounded-[28px] bg-gradient-to-b from-emerald-500/10 via-amber-500/5 to-white p-6 border border-emerald-500/20 shadow-sm flex flex-col items-center justify-center text-center group"
              >
                {/* Floating Hearts on Tap */}
                {petHearts.map((heart) => (
                  <motion.div
                    key={heart.id}
                    initial={{ scale: 0.5, y: 0, opacity: 1 }}
                    animate={{ scale: 1.4, y: -80, opacity: 0 }}
                    transition={{ duration: 1 }}
                    className="absolute pointer-events-none text-2xl z-30"
                    style={{ left: heart.x, top: heart.y }}
                  >
                    💖
                  </motion.div>
                ))}

                {/* Speech Bubble */}
                <div className="relative mb-3 max-w-[280px] bg-white px-4 py-2.5 rounded-2xl rounded-bl-sm border border-slate-200/80 shadow-md text-xs sm:text-sm font-bold text-slate-800 text-center leading-snug">
                  {stats.speechText}
                  <div className="absolute -bottom-2 left-6 w-3 h-3 bg-white border-b border-r border-slate-200 rotate-45" />
                </div>

                {/* Pet Image */}
                <div className="relative my-2 w-44 h-44 flex items-center justify-center">
                  <TamagotchiAvatar
                    breed={tamagotchi.breed}
                    mood={stats.mood}
                    customSrc={stats.imageSrc}
                    alt={tamagotchi.name}
                    className="w-full h-full object-contain filter drop-shadow-xl"
                    animate={{
                      y: [0, -6, 0],
                      rotate: [0, 1.5, -1.5, 0],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                  <span className="absolute bottom-0 right-2 px-2.5 py-1 bg-white/90 backdrop-blur rounded-full text-[11px] font-extrabold text-slate-700 shadow-sm border border-slate-200">
                    Tap to pet 💖
                  </span>
                </div>

                <div className="mt-2 text-center">
                  <h3 className="text-xl font-black text-slate-900">{tamagotchi.name}</h3>
                  <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                    {currentBreedObj.name} ({currentBreedObj.badge})
                  </span>
                </div>
              </div>

              {/* Friendship Streak & Motivation Card */}
              <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-emerald-500/10 rounded-[24px] p-4.5 border border-amber-500/25 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                      {friendship.rankBadge}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="text-sm font-black text-slate-900">
                          Day {friendship.daysTogether} together!
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-black text-[10px] shadow-2xs tracking-wide uppercase">
                          Friendship streak 🔥
                        </span>
                      </div>
                      <p className="text-xs font-bold text-amber-900 mt-0.5 truncate">
                        Rank: {friendship.rankTitle}
                      </p>
                    </div>
                  </div>

                  <div className="text-right pl-2 shrink-0">
                    <span className="text-2xl font-black text-amber-600 block leading-none">
                      {friendship.daysTogether}
                    </span>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      {friendship.daysWord}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 font-medium leading-relaxed bg-white/70 backdrop-blur-xs p-2.5 rounded-xl border border-amber-200/50">
                  {friendship.rankDescription}
                </p>

                {/* Progress to Next Milestone */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] font-bold text-slate-500">
                    <span>Current level</span>
                    <span className="text-amber-700">
                      Next goal: {friendship.nextMilestoneDays} days 🏆
                    </span>
                  </div>
                  <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                      style={{ width: `${friendship.progressToNextMilestone}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Nutrition & Calories Status Card */}
              <div className="bg-white rounded-[24px] p-4.5 border border-slate-200/80 shadow-sm space-y-4">
                {/* 1. Daily Calorie Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Utensils className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-700">Daily diet</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900">
                        {todayCaloriesEaten} / {stats.limit} kcal
                      </span>
                      <span className="text-[11px] font-bold text-emerald-600 ml-1.5">
                        ({stats.dailySatietyPercent}%)
                      </span>
                    </div>
                  </div>

                  {/* Daily Calorie Progress Bar */}
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stats.dailySatietyPercent > 115
                          ? 'bg-amber-500'
                          : stats.dailySatietyPercent >= 80
                          ? 'bg-emerald-500'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, stats.dailySatietyPercent)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>0 kcal</span>
                    <span>Ideal ({stats.limit} kcal)</span>
                    <span>{stats.dailySatietyPercent}% eaten</span>
                  </div>
                </div>

                {/* 2. Live Stomach Digestion Status */}
                <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-200/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-base">⏳</span>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Satiety right now (by hour): {stats.satietyPercent}%
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {stats.hungerState === 'full'
                          ? 'Full and energized 💖'
                          : stats.hungerState === 'satisfied'
                          ? 'Digesting food 🌿'
                          : stats.hungerState === 'getting_hungry'
                          ? 'Appetite growing for the next meal 🍖'
                          : 'Got hungry, time to feed 🐾'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-black text-emerald-700 bg-white px-2.5 py-1 rounded-xl shadow-2xs border border-emerald-100 shrink-0">
                    {stats.satietyPercent}%
                  </span>
                </div>

                {/* Rule explanation card */}
                <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/60 text-xs text-amber-900 leading-relaxed flex items-start space-x-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Friendship rule:</strong> Your pet eats everything you eat. Its daily norm{' '}
                    <strong>{stats.limit} kcal</strong> (200 kcal less than yours). If you underfeed your pet by 200+ kcal 2 days in a row, it will get sick!
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  id="tamagotchi-feed-btn"
                  onClick={() => {
                    onClose();
                    if (onOpenScanner) onOpenScanner();
                  }}
                  className="p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-md flex items-center justify-center space-x-2 active:scale-95 transition"
                >
                  <Utensils className="w-4 h-4" />
                  <span>Feed 🥗</span>
                </button>
                <button
                  id="tamagotchi-rules-btn"
                  onClick={() => setActiveTab('history')}
                  className="p-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 rounded-2xl font-bold text-sm shadow-sm flex items-center justify-center space-x-2 active:scale-95 transition"
                >
                  <Award className="w-4 h-4 text-amber-500" />
                  <span>History & rules</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= CASE 2: PET IS DEAD / PUNISHMENT REQUIRED ================= */}
          {tamagotchi && !tamagotchi.isAlive && (
            <div className="space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-[28px] p-5 text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 flex items-center justify-center text-3xl shadow-inner">
                  🦴
                </div>
                <div>
                  <h3 className="text-lg font-black text-rose-900">
                    {tamagotchi.name} has fallen asleep forever...
                  </h3>
                  <p className="text-xs text-rose-700 mt-1 font-medium leading-relaxed">
                    {tamagotchi.causeOfDeath || 'Your pet died from underfeeding (several days 200+ kcal below the norm).'}
                  </p>
                </div>
              </div>

              {/* Punishment Day Requirement Card */}
              <div className="bg-white rounded-[24px] p-5 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center space-x-2 text-rose-600 font-extrabold text-sm">
                  <ShieldAlert className="w-5 h-5" />
                  <span>Punishment and redemption day</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  To make amends and earn the right to adopt a new friend, you must meet this condition: eat today{' '}
                  <strong className="text-slate-900">200 kcal above your norm</strong> ({punishmentTarget} kcal).
                </p>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Redemption progress:</span>
                    <span>
                      {todayCaloriesEaten} / {punishmentTarget} kcal
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round((todayCaloriesEaten / punishmentTarget) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {todayCaloriesEaten >= punishmentTarget ? (
                  <button
                    id="tamagotchi-claim-redemption-btn"
                    onClick={handleCompletePunishment}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-extrabold text-sm shadow-md transition flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Redemption complete! Adopt a new friend</span>
                  </button>
                ) : (
                  <button
                    id="tamagotchi-confirm-punishment-override-btn"
                    onClick={handleCompletePunishment}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
                  >
                    I promise to feed my pet on time (Remove lock)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================= CASE 3: ADOPT / CREATE NEW TAMAGOTCHI ================= */}
          {(!tamagotchi || !tamagotchi.isAlive || activeTab === 'create') && (
            <div className="space-y-5">
              {/* Screenshot-Matched Top Header */}
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    Choose a friend
                  </h1>
                  <span className="text-2xl">🐾</span>
                </div>
                <p className="text-xs sm:text-sm font-medium text-slate-500 leading-relaxed">
                  Will eat the same as you. Its daily limit{' '}
                  <strong className="text-slate-900 font-extrabold">{petLimit} kcal</strong>{' '}
                  (yours {userTargetCalories} - 200)
                </p>
              </div>

              {/* 2-Column Breeds Grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
                {TAMAGOTCHI_BREEDS.map((breed) => {
                  const isSelected = selectedBreed === breed.id;
                  return (
                    <div
                      key={breed.id}
                      id={`tamagotchi-breed-${breed.id}`}
                      onClick={() => {
                        setSelectedBreed(breed.id);
                        setNameError('');
                      }}
                      className={`relative cursor-pointer rounded-[24px] p-3.5 sm:p-4 text-center transition-all duration-200 border-2 flex flex-col items-center justify-between ${
                        isSelected
                          ? 'border-emerald-500 bg-white shadow-md ring-2 ring-emerald-500/20'
                          : 'border-slate-200/90 bg-white/70 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      {/* Checkmark Badge */}
                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}

                      {/* Cute Circular Avatar Background */}
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-b from-slate-100 to-amber-50/50 flex items-center justify-center p-1.5 my-1 shadow-inner overflow-hidden">
                        <TamagotchiAvatar
                          breed={breed.id}
                          mood="happy"
                          alt={breed.name}
                          className="w-full h-full object-contain filter drop-shadow-sm hover:scale-105 transition"
                        />
                      </div>

                      {/* Name & Trait Pill */}
                      <div className="mt-2 space-y-1 w-full">
                        <h4 className="text-sm sm:text-base font-black text-slate-900">
                          {breed.name}
                        </h4>
                        <div className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
                          {breed.badge}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pet Name Form */}
              <form onSubmit={handleAdopt} className="space-y-3.5 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    What will you name your pet? 🐾
                  </label>
                  <input
                    id="tamagotchi-name-input"
                    type="text"
                    value={petName}
                    onChange={(e) => {
                      setPetName(e.target.value);
                      setNameError('');
                    }}
                    placeholder="E.g.: Archie, Milo, Bonya..."
                    maxLength={25}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-2xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  />
                  {pastNames.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      ⚠️ Past names ({pastNames.join(', ')}) cannot be reused.
                    </p>
                  )}
                  {nameError && (
                    <div className="p-2.5 mt-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-600 flex items-center space-x-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{nameError}</span>
                    </div>
                  )}
                </div>

                {/* Screenshot Matched Green CTA Button */}
                <button
                  id="tamagotchi-adopt-submit-btn"
                  type="submit"
                  className="w-full py-4 bg-[#0AB68B] hover:bg-[#099f79] text-white rounded-[22px] font-black text-base shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition flex items-center justify-center space-x-2"
                >
                  <span>
                    Adopt {TAMAGOTCHI_BREEDS.find((b) => b.id === selectedBreed)?.name} 🐾
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* ================= CASE 4: HISTORY & RULES TAB ================= */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="bg-white rounded-[24px] p-5 border border-slate-200 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                  <span>📜 Your Tamagotchi life rules</span>
                </h3>
                <ul className="text-xs text-slate-600 space-y-2 font-medium leading-relaxed list-disc list-inside">
                  <li>
                    <strong>Synced eating:</strong> Your pet eats absolutely everything you log in your diary.
                  </li>
                  <li>
                    <strong>Limit:</strong> Your pet&apos;s limit equals your calorie norm minus 200 kcal ({petLimit} kcal).
                  </li>
                  <li>
                    <strong>Health:</strong> To keep your pet happy, eat exactly or slightly above its norm.
                  </li>
                  <li>
                    <strong>Danger:</strong> If you eat 200+ kcal below your pet&apos;s norm 2 days in a row, it dies of hunger.
                  </li>
                  <li>
                    <strong>Redemption day:</strong> After your pet dies, you can only adopt a new one after Punishment Day (eat 200 kcal above your norm).
                  </li>
                  <li>
                    <strong>Unique names:</strong> You cannot give a new pet the name of a previous one.
                  </li>
                </ul>
              </div>

              {/* Memorial Book / Past Names */}
              {pastNames.length > 0 && (
                <div className="bg-white rounded-[24px] p-4.5 border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700">Names used in history:</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {pastNames.map((name, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700"
                      >
                        🐾 {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
