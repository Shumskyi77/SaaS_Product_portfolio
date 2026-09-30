'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowRight, ArrowLeft, Check, Flame, Target, Scale, Heart, BicepsFlexed } from 'lucide-react';
import { UserProfile } from '../types/user';
import { calculateUserGoals } from '../lib/store';
import { saveUserProfileToFirestore } from '../lib/supabaseDb';
import { DesktopShell } from './DesktopShell';

interface OnboardingFlowProps {
  initialUserData?: { uid: string; email: string; name: string };
  onComplete: (profile: UserProfile) => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ initialUserData, onComplete }) => {
  const [step, setStep] = useState<number>(1);

  // Form State
  const [name, setName] = useState<string>(initialUserData?.name || '');
  const [goalType, setGoalType] = useState<'lose_fat' | 'gain_muscle' | 'maintain' | 'healthy_habits'>('lose_fat');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState<number>(26);
  const [height, setHeight] = useState<number>(176);
  const [currentWeight, setCurrentWeight] = useState<number>(75);
  const [targetWeight, setTargetWeight] = useState<number>(70);
  const [activityLevel, setActivityLevel] = useState<'sedentary' | 'light' | 'moderate' | 'active' | 'athlete'>('moderate');
  const [dietType, setDietType] = useState<'Standard' | 'Keto' | 'Low_Carb' | 'Vegetarian' | 'Vegan'>('Standard');

  const handleGoalSelect = (goal: 'lose_fat' | 'gain_muscle' | 'maintain' | 'healthy_habits') => {
    setGoalType(goal);
    if (goal === 'lose_fat') {
      setTargetWeight(Math.max(40, currentWeight - 5));
    } else if (goal === 'gain_muscle') {
      setTargetWeight(currentWeight + 5);
    } else {
      setTargetWeight(currentWeight);
    }
  };

  const handleNext = async () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      // Calculate final goals
      const goals = calculateUserGoals({
        gender,
        age,
        height,
        currentWeight,
        targetWeight,
        weeklyGoal: goalType === 'lose_fat' ? -0.5 : goalType === 'gain_muscle' ? 0.3 : 0,
        activityLevel,
        dietType,
      });

      const uid = initialUserData?.uid || 'user_' + Date.now();
      const cleanUid = uid.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const friendCode = `NM-${cleanUid.length >= 6 ? cleanUid.slice(0, 6) : (cleanUid + 'ABCDEF').slice(0, 6)}`;
      const defaultAvatar = gender === 'female'
        ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80';

      const profile: UserProfile = {
        uid,
        friendCode,
        name: name.trim() || (gender === 'female' ? 'Anna' : 'User'),
        email: initialUserData?.email || 'user@foodvisor.ai',
        avatar: defaultAvatar,
        avatarUrl: defaultAvatar,
        gender,
        age,
        height,
        currentWeight,
        targetWeight,
        weeklyGoal: goalType === 'lose_fat' ? -0.5 : goalType === 'gain_muscle' ? 0.3 : 0,
        activityLevel,
        dietType,
        targetCalories: goals.targetCalories,
        targetProtein: goals.targetProtein,
        targetFat: goals.targetFat,
        targetCarbs: goals.targetCarbs,
        targetFiber: goals.targetFiber,
        targetWater: goals.targetWater,
        streakDays: 1,
        createdAt: new Date().toISOString(),
      };

      // Save to Firestore and Backend
      try {
        await saveUserProfileToFirestore(profile);
      } catch (err) {
        console.warn('Profile write warning:', err);
      }

      onComplete(profile);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <DesktopShell>
    <div
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
      }}
      className="h-full w-full bg-[#FAF8F5] text-slate-800 flex flex-col items-center justify-center p-4 font-sans select-none overflow-y-auto"
    >
      <div className="w-full bg-white border border-slate-200/80 rounded-[36px] p-6 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[580px]">
        {/* Soft Background Accent */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-[#00C29A]/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top Header & Progress Bar */}
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            {step > 1 ? (
              <button
                onClick={handleBack}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8" />
            )}

            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-5 h-5 text-[#00C29A]" />
              <span className="font-extrabold text-sm tracking-wide text-slate-900 uppercase">
                Foodvisor AI
              </span>
            </div>

            <span className="text-xs font-bold text-slate-400">
              Step {step} of 5
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#00C29A]"
              initial={{ width: '0%' }}
              animate={{ width: `${(step / 5) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Dynamic Questionnaire Steps */}
        <div className="relative z-10 my-auto py-4">
          <AnimatePresence mode="wait">
            {/* Step 1: Main Goal (Lose fat, Gain muscle, Maintain weight) */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">What do you want to achieve?</h2>
                  <p className="text-xs text-slate-500 font-medium">Choose your main nutrition goal</p>
                </div>

                <div className="space-y-2.5 pt-2">
                  {[
                    { id: 'lose_fat', label: 'Lose fat / Lose weight', icon: '🔥', desc: 'Calorie deficit and macro control' },
                    { id: 'gain_muscle', label: 'Gain mass / Muscle', icon: '💪', desc: 'Calorie surplus and extra protein' },
                    { id: 'maintain', label: 'Stay in shape', icon: '⚖️', desc: 'Stable energy balance and tone' },
                    { id: 'healthy_habits', label: 'Healthy habits', icon: '🥗', desc: 'Clean diet, vitamins and hydration' },
                  ].map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => handleGoalSelect(g.id as any)}
                      className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        goalType === g.id
                          ? 'bg-[#E6F9F5] border-[#00C29A] text-slate-900 shadow-xs'
                          : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{g.icon}</span>
                        <div>
                          <div className="text-xs font-black text-slate-900">{g.label}</div>
                          <div className="text-[10px] text-slate-500 font-medium">{g.desc}</div>
                        </div>
                      </div>
                      {goalType === g.id && <Check className="w-5 h-5 text-[#00C29A]" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Gender & Age */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">Your gender and age</h2>
                  <p className="text-xs text-slate-500 font-medium">Needed to calculate your metabolism accurately</p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-xs font-extrabold text-slate-700 block mb-2">Gender</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setGender('male')}
                        className={`p-3.5 rounded-2xl font-black text-xs border transition-all ${
                          gender === 'male'
                            ? 'bg-[#00C29A] text-white border-[#00C29A] shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Male ♂
                      </button>
                      <button
                        type="button"
                        onClick={() => setGender('female')}
                        className={`p-3.5 rounded-2xl font-black text-xs border transition-all ${
                          gender === 'female'
                            ? 'bg-[#00C29A] text-white border-[#00C29A] shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        Female ♀
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-extrabold text-slate-700 mb-2">
                      <span>How old are you?</span>
                      <span className="text-[#00C29A] font-black">{age} years</span>
                    </div>
                    <input
                      type="range"
                      min="14"
                      max="80"
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="w-full accent-[#00C29A] cursor-pointer"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Height & Current Weight */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">Height and current weight</h2>
                  <p className="text-xs text-slate-500 font-medium">To determine BMI and daily energy needs</p>
                </div>

                <div className="space-y-5 pt-2">
                  <div>
                    <div className="flex justify-between text-xs font-extrabold text-slate-700 mb-2">
                      <span>Your height</span>
                      <span className="text-[#00C29A] font-black">{height} cm</span>
                    </div>
                    <input
                      type="range"
                      min="140"
                      max="210"
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full accent-[#00C29A] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-extrabold text-slate-700 mb-2">
                      <span>How much do you weigh now?</span>
                      <span className="text-[#00C29A] font-black">{currentWeight} kg</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="160"
                      step="0.5"
                      value={currentWeight}
                      onChange={(e) => setCurrentWeight(Number(e.target.value))}
                      className="w-full accent-[#00C29A] cursor-pointer"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 4: Target Weight */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">Your desired target weight</h2>
                  <p className="text-xs text-slate-500 font-medium">Set a realistic goal</p>
                </div>

                <div className="space-y-5 pt-2">
                  <div>
                    <div className="flex justify-between text-xs font-extrabold text-slate-700 mb-2">
                      <span>Target weight</span>
                      <span className="text-[#00C29A] font-black">{targetWeight} kg</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="150"
                      step="0.5"
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(Number(e.target.value))}
                      className="w-full accent-[#00C29A] cursor-pointer"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-[#E6F9F5] border border-[#00C29A]/30 text-xs text-slate-700 flex items-center space-x-3">
                    <Target className="w-8 h-8 text-[#00C29A] shrink-0" />
                    <div>
                      <span className="font-extrabold text-slate-900 block">
                        {targetWeight < currentWeight
                          ? `Plan: lose ${+(currentWeight - targetWeight).toFixed(1)} kg`
                          : targetWeight > currentWeight
                          ? `Plan: gain ${+(targetWeight - currentWeight).toFixed(1)} kg`
                          : 'Plan: maintain great shape'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Safe recommended pace by Foodvisor AI
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 5: Activity & Diet */}
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">Activity level and diet</h2>
                  <p className="text-xs text-slate-500 font-medium">We&apos;ll tune the ideal protein, fat and carb balance</p>
                </div>

                <div className="space-y-2 pt-1">
                  {[
                    { id: 'sedentary', title: 'Sedentary', sub: 'Little movement during the day' },
                    { id: 'light', title: 'Light activity', sub: '1-2 light walks/workouts' },
                    { id: 'moderate', title: 'Active', sub: '3-4 workouts per week' },
                  ].map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setActivityLevel(act.id as any)}
                      className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        activityLevel === act.id
                          ? 'bg-[#E6F9F5] border-[#00C29A] text-slate-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-black text-slate-900">{act.title}</div>
                        <div className="text-[10px] text-slate-500">{act.sub}</div>
                      </div>
                      {activityLevel === act.id && <Check className="w-4 h-4 text-[#00C29A]" />}
                    </button>
                  ))}
                </div>

                {/* Live Metabolic Preview Card */}
                {(() => {
                  const preview = calculateUserGoals({
                    gender,
                    age,
                    height,
                    currentWeight,
                    targetWeight,
                    weeklyGoal: goalType === 'lose_fat' ? -0.5 : goalType === 'gain_muscle' ? 0.3 : 0,
                    activityLevel,
                    dietType,
                  });
                  return (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-black text-slate-900">
                        <span className="text-emerald-800">Calculated daily norm:</span>
                        <span className="text-base text-[#00C29A]">{preview.targetCalories} kcal/day</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-600 font-bold pt-0.5">
                        <span>P: {preview.targetProtein}g ({preview.targetProtein * 4} kcal)</span>
                        <span>F: {preview.targetFat}g ({preview.targetFat * 9} kcal)</span>
                        <span>C: {preview.targetCarbs}g ({preview.targetCarbs * 4} kcal)</span>
                        <span>Water: {preview.targetWater} ml</span>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Button */}
        <div className="relative z-10 pt-4">
          <button
            onClick={handleNext}
            className="w-full py-4 rounded-2xl bg-[#00C29A] hover:bg-[#00A885] text-white font-extrabold text-sm flex items-center justify-center space-x-2 shadow-[0_8px_25px_rgba(0,194,154,0.35)] transition-all active:scale-[0.98]"
          >
            <span>{step === 5 ? 'Launch Foodvisor' : 'Continue'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
    </DesktopShell>
  );
};
