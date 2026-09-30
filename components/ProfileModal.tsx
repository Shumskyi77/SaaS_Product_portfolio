'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, RefreshCw, Camera, Sparkles, Loader2, Pencil, Sliders, Flame, Upload, Activity, Moon, Footprints, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { UserProfile } from '../types/user';
import { saveStoredProfile, calculateUserGoals, getAllStoredMealLogs } from '../lib/store';
import { calculateUserProfileGoalsWithAI } from '../lib/gemini';
import { fetchUserProfileFromFirestore, saveUserProfileToFirestore, saveMealToFirestore } from '../lib/supabaseDb';
import { AVATAR_PRESETS, DEFAULT_AVATAR, compressImageFile } from '../lib/avatars';
import {
  getStoredGoogleFitState,
  connectGoogleFitAccount,
  disconnectGoogleFitAccount,
  syncGoogleFitData,
} from '../lib/googleFit';
import { GoogleFitState } from '../types/googleFit';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onProfileUpdate: (profile: UserProfile) => void;
  onResetOnboarding: () => void;
  onLogout?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onProfileUpdate,
  onResetOnboarding,
  onLogout,
}) => {
  const [name, setName] = useState(userProfile.name);
  const [avatar, setAvatar] = useState(userProfile.avatar || DEFAULT_AVATAR);
  const [currentWeight, setCurrentWeight] = useState(userProfile.currentWeight);
  const [targetWeight, setTargetWeight] = useState(userProfile.targetWeight);
  const [weeklyGoal, setWeeklyGoal] = useState(userProfile.weeklyGoal);
  const [dietType, setDietType] = useState(userProfile.dietType);

  // Calorie calculation mode: 'auto' | 'manual'
  const [isManualCalorie, setIsManualCalorie] = useState(false);
  const [targetCalories, setTargetCalories] = useState<number>(userProfile.targetCalories || 2000);
  const [targetProtein, setTargetProtein] = useState<number>(userProfile.targetProtein || 130);
  const [targetFat, setTargetFat] = useState<number>(userProfile.targetFat || 60);
  const [targetCarbs, setTargetCarbs] = useState<number>(userProfile.targetCarbs || 200);
  const [targetWater, setTargetWater] = useState<number>(userProfile.targetWater || 2000);
  const [streakDays, setStreakDays] = useState<number>(userProfile.streakDays ?? 0);

  // Avatar selector open
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');

  // AI Calorie Assistant modal open
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [aiNotes, setAiNotes] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    recommendedCalories: number;
    recommendedProtein: number;
    recommendedFat: number;
    recommendedCarbs: number;
    recommendedWater: number;
    bmr: number;
    tdee: number;
    explanation: string;
  } | null>(null);

  // Google Fit state
  const [googleFitState, setGoogleFitState] = useState<GoogleFitState>(() => getStoredGoogleFitState());
  const [isFitSyncing, setIsFitSyncing] = useState(false);
  const [fitToast, setFitToast] = useState<string | null>(null);
  const [isDBSyncing, setIsDBSyncing] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setName(userProfile.name);
      setAvatar(userProfile.avatar || DEFAULT_AVATAR);
      setCurrentWeight(userProfile.currentWeight);
      setTargetWeight(userProfile.targetWeight);
      setWeeklyGoal(userProfile.weeklyGoal);
      setDietType(userProfile.dietType);
      setTargetCalories(userProfile.targetCalories || 2000);
      setTargetProtein(userProfile.targetProtein || 130);
      setTargetFat(userProfile.targetFat || 60);
      setTargetCarbs(userProfile.targetCarbs || 200);
      setTargetWater(userProfile.targetWater || 2000);
      setStreakDays(userProfile.streakDays ?? 0);
    }
  }, [userProfile, isOpen]);

  useEffect(() => {
    setGoogleFitState(getStoredGoogleFitState());
  }, [isOpen]);

  const handleSyncFromFirestore = async () => {
    const targetUid = userProfile?.uid;
    if (!targetUid) {
      setFitToast('⚠️ No active session');
      setTimeout(() => setFitToast(null), 3000);
      return;
    }
    setIsDBSyncing(true);
    try {
      const dbProfile = await fetchUserProfileFromFirestore(targetUid);
      if (dbProfile) {
        onProfileUpdate(dbProfile);
        saveStoredProfile(dbProfile);
        setName(dbProfile.name);
        setAvatar(dbProfile.avatar || DEFAULT_AVATAR);
        setCurrentWeight(dbProfile.currentWeight);
        setTargetWeight(dbProfile.targetWeight);
        setWeeklyGoal(dbProfile.weeklyGoal);
        setDietType(dbProfile.dietType);
        setTargetCalories(dbProfile.targetCalories || 2000);
        setTargetProtein(dbProfile.targetProtein || 130);
        setTargetFat(dbProfile.targetFat || 60);
        setTargetCarbs(dbProfile.targetCarbs || 200);
        setTargetWater(dbProfile.targetWater || 2000);
        setStreakDays(dbProfile.streakDays ?? 0);
        setFitToast('✅ Data refreshed from the database!');
      } else {
        await saveUserProfileToFirestore(userProfile);
        setFitToast('✅ Profile synced with the cloud database!');
      }
    } catch (err) {
      console.warn('Sync from DB error:', err);
      setFitToast('❌ Database sync failed');
    } finally {
      setIsDBSyncing(false);
      setTimeout(() => setFitToast(null), 3000);
    }
  };

  const handleToggleGoogleFit = async () => {
    setIsFitSyncing(true);
    if (googleFitState.isConnected) {
      const updated = await disconnectGoogleFitAccount();
      setGoogleFitState(updated);
      setFitToast('Google Fit disconnected');
    } else {
      const updated = await connectGoogleFitAccount(userProfile.email, userProfile.name);
      setGoogleFitState(updated);
      setFitToast('🎉 Google Fit connected! Sleep, steps and activity synced.');
    }
    setIsFitSyncing(false);
    setTimeout(() => setFitToast(null), 3500);
  };

  const handleSyncGoogleFitNow = async () => {
    setIsFitSyncing(true);
    const updated = await syncGoogleFitData();
    setGoogleFitState(updated);
    setIsFitSyncing(false);
    setFitToast('🔄 Google Fit data refreshed!');
    setTimeout(() => setFitToast(null), 3000);
  };

  if (!isOpen) return null;

  const handleRecalculateAuto = () => {
    const goals = calculateUserGoals({
      gender: userProfile.gender,
      age: userProfile.age,
      height: userProfile.height,
      currentWeight,
      targetWeight,
      weeklyGoal,
      activityLevel: userProfile.activityLevel,
      dietType,
    });
    setTargetCalories(goals.targetCalories);
    setTargetProtein(goals.targetProtein);
    setTargetFat(goals.targetFat);
    setTargetCarbs(goals.targetCarbs);
    setTargetWater(goals.targetWater);
  };

  const [avatarCategory, setAvatarCategory] = useState<'all' | 'fitness' | 'characters' | 'lifestyle'>('all');
  const [isCompressingImage, setIsCompressingImage] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Compress to avatar size (~300px): a 3-10MB original broke saveStoredProfile
    // (5MB quota) and saveUserProfileToFirestore (1MB doc limit).
    if (!file.type.startsWith('image/')) {
      e.target.value = '';
      return;
    }
    try {
      setIsCompressingImage(true);
      const compressedDataUrl = await compressImageFile(file, 300, 0.85);
      setAvatar(compressedDataUrl);
      setFitToast('✨ Profile photo uploaded!');
      setTimeout(() => setFitToast(null), 2500);
      setIsAvatarPickerOpen(false);
    } catch (err) {
      console.warn('Image compression error:', err);
      setFitToast('❌ Could not process the photo');
      setTimeout(() => setFitToast(null), 2500);
    } finally {
      setIsCompressingImage(false);
      e.target.value = '';
    }
  };

  const handleCalculateWithAI = async () => {
    setIsAiLoading(true);
    setAiResult(null);

    try {
      const data = await calculateUserProfileGoalsWithAI({
        gender: userProfile.gender,
        age: userProfile.age,
        height: userProfile.height,
        currentWeight,
        targetWeight,
        weeklyGoal,
        activityLevel: userProfile.activityLevel,
        dietType,
        additionalNotes: aiNotes,
      });
      setAiResult(data);
    } catch {
      const goals = calculateUserGoals({
        gender: userProfile.gender,
        age: userProfile.age,
        height: userProfile.height,
        currentWeight,
        targetWeight,
        weeklyGoal,
        activityLevel: userProfile.activityLevel,
        dietType,
      });
      setAiResult({
        recommendedCalories: goals.targetCalories,
        recommendedProtein: goals.targetProtein,
        recommendedFat: goals.targetFat,
        recommendedCarbs: goals.targetCarbs,
        recommendedWater: goals.targetWater,
        bmr: Math.round(10 * currentWeight + 6.25 * userProfile.height - 5 * userProfile.age),
        tdee: Math.round(goals.targetCalories * 1.15),
        explanation: 'AI suggested the optimal calories for your metabolism, weight and diet.',
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyAiResult = () => {
    if (aiResult) {
      setTargetCalories(aiResult.recommendedCalories);
      setTargetProtein(aiResult.recommendedProtein);
      setTargetFat(aiResult.recommendedFat);
      setTargetCarbs(aiResult.recommendedCarbs);
      setTargetWater(aiResult.recommendedWater);
      setIsManualCalorie(true);
      setIsAIAssistantOpen(false);
    }
  };

  const handleSaveProfile = async () => {
    let finalCals = targetCalories;
    let finalP = targetProtein;
    let finalF = targetFat;
    let finalC = targetCarbs;
    let finalW = targetWater;

    if (!isManualCalorie) {
      const goals = calculateUserGoals({
        gender: userProfile.gender,
        age: userProfile.age,
        height: userProfile.height,
        currentWeight,
        targetWeight,
        weeklyGoal,
        activityLevel: userProfile.activityLevel,
        dietType,
      });
      finalCals = goals.targetCalories;
      finalP = goals.targetProtein;
      finalF = goals.targetFat;
      finalC = goals.targetCarbs;
      finalW = goals.targetWater;
    }

    const cleanUid = (userProfile.uid || 'USER').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const derivedFriendCode = `NM-${cleanUid.length >= 6 ? cleanUid.slice(0, 6) : (cleanUid + 'ABCDEF').slice(0, 6)}`;
    const friendCode = userProfile.friendCode || derivedFriendCode;

    const updated: UserProfile = {
      ...userProfile,
      name,
      avatar,
      avatarUrl: avatar,
      currentWeight,
      targetWeight,
      weeklyGoal,
      dietType,
      friendCode,
      streakDays: Math.max(0, Number(streakDays) || 0),
      targetCalories: finalCals,
      targetProtein: finalP,
      targetCarbs: finalC,
      targetFat: finalF,
      targetWater: finalW,
    };

    saveStoredProfile(updated);
    saveUserProfileToFirestore(updated);

    // Sync to backend API immediately
    try {
      fetch('/api/users/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});
    } catch {}

    // Sync any local meal logs to Firestore under this user
    try {
      const allLocalMeals = getAllStoredMealLogs();
      if (allLocalMeals && allLocalMeals.length > 0) {
        allLocalMeals.forEach((m) => {
          if (!m.userId || m.userId === 'u1') {
            m.userId = updated.uid;
          }
          saveMealToFirestore(m);
        });
      }
    } catch (e) {
      console.warn('Sync local meals error:', e);
    }

    onProfileUpdate(updated);
    onClose();
  };

  const userFriendCode =
    userProfile.friendCode ||
    `NM-${(userProfile.uid || 'USER').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-md bg-white rounded-[32px] p-6 text-slate-800 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl relative"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-3">
            <div className="relative group">
              <img
                src={avatar}
                alt={name}
                className="w-12 h-12 rounded-full object-cover border-2 border-[#00C29A] shadow-xs"
                referrerPolicy="no-referrer"
              />
              <button
                onClick={() => setIsAvatarPickerOpen(true)}
                className="absolute -bottom-1 -right-1 p-1.5 bg-[#00C29A] text-white rounded-full shadow-md hover:scale-110 transition-transform cursor-pointer"
                title="Change photo"
              >
                <Camera className="w-3 h-3" />
              </button>
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">{name || 'User'}</h3>
              <span className="text-xs text-slate-400 font-medium">{userProfile.email}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Friend Code / ID Card for Real Social Sharing */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
              Your friend-add ID
            </span>
            <span className="text-sm font-black text-slate-900 tracking-wider font-mono">
              {userFriendCode}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(userFriendCode);
              setFitToast(`📋 Your ID ${userFriendCode} copied!`);
              setTimeout(() => setFitToast(null), 3000);
            }}
            className="px-3 py-1.5 bg-[#00C29A] hover:bg-[#00A885] text-white text-xs font-black rounded-xl transition-all shadow-xs flex items-center space-x-1 cursor-pointer"
          >
            <span>Copy</span>
          </button>
        </div>

        {/* Profile Settings Form */}
        <div className="space-y-3">
          {/* Avatar & Name Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-bold text-slate-400">Your name</label>
              <button
                type="button"
                onClick={() => setIsAvatarPickerOpen(true)}
                className="text-[11px] text-[#00C29A] font-extrabold hover:underline flex items-center space-x-1"
              >
                <Camera className="w-3 h-3" />
                <span>Change profile photo</span>
              </button>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-[#00C29A]"
              placeholder="Enter your name..."
            />
          </div>

          {/* Weight Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Current weight (kg)</label>
              <input
                type="number"
                step="0.5"
                value={currentWeight}
                onChange={(e) => setCurrentWeight(Number(e.target.value))}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-black text-[#00C29A] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">Goal weight (kg)</label>
              <input
                type="number"
                step="0.5"
                value={targetWeight}
                onChange={(e) => setTargetWeight(Number(e.target.value))}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-black text-indigo-600 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">Diet type</label>
            <select
              value={dietType}
              onChange={(e) => setDietType(e.target.value as any)}
              className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold outline-none"
            >
              <option value="Standard">Standard balanced</option>
              <option value="Keto">Keto</option>
              <option value="Low_Carb">Low carb</option>
              <option value="Vegetarian">Vegetarian</option>
              <option value="Vegan">Vegan</option>
            </select>
          </div>

          {/* Daily Calories & Macros Settings Block */}
          <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-slate-900 flex items-center space-x-1.5">
                <Flame className="w-4 h-4 text-[#00C29A]" />
                <span>Daily calorie target</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (isManualCalorie) {
                    setIsManualCalorie(false);
                    handleRecalculateAuto();
                  } else {
                    setIsManualCalorie(true);
                  }
                }}
                className="text-[11px] text-[#00C29A] font-extrabold hover:underline"
              >
                {isManualCalorie ? 'Reset to auto' : 'Enter manually'}
              </button>
            </div>

            {/* Calorie Goal Input */}
            <div className="relative flex items-center">
              <input
                type="number"
                value={targetCalories}
                onChange={(e) => {
                  setIsManualCalorie(true);
                  setTargetCalories(Number(e.target.value));
                }}
                className="w-full p-3 pr-28 bg-white rounded-xl border border-emerald-300 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-[#00C29A]"
              />
              <span className="absolute right-3 text-xs font-bold text-emerald-700 pointer-events-none select-none">
                kcal / day
              </span>
            </div>

            {/* AI Advisor Trigger Button */}
            <button
              type="button"
              onClick={() => setIsAIAssistantOpen(true)}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-sm hover:opacity-95 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Find your calorie target with AI</span>
            </button>

            {/* Manual Macros Accordion / Custom Inputs */}
            {isManualCalorie && (
              <div className="pt-2 border-t border-emerald-200/60 grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Protein (g)</label>
                  <input
                    type="number"
                    value={targetProtein}
                    onChange={(e) => setTargetProtein(Number(e.target.value))}
                    className="w-full p-2 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Fat (g)</label>
                  <input
                    type="number"
                    value={targetFat}
                    onChange={(e) => setTargetFat(Number(e.target.value))}
                    className="w-full p-2 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-0.5">Carbs (g)</label>
                  <input
                    type="number"
                    value={targetCarbs}
                    onChange={(e) => setTargetCarbs(Number(e.target.value))}
                    className="w-full p-2 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>

          {/* STREAK DAYS SETTING */}
          <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-xs">
                  <Flame className="w-4 h-4 fill-white" />
                </div>
                <div>
                  <label className="text-xs font-extrabold text-amber-900 block">
                    Streak (days in a row)
                  </label>
                  <p className="text-[10px] text-amber-700">
                    Your current food-logging streak
                  </p>
                </div>
              </div>
              <div className="w-24">
                <input
                  type="number"
                  min="0"
                  value={streakDays}
                  onChange={(e) => setStreakDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full p-2 bg-white rounded-xl border border-amber-300 text-sm font-black text-amber-900 text-center outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* GOOGLE FIT INTEGRATION SETTING */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl p-4 text-white space-y-3 shadow-sm border border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-xs">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                    <path fill="#EA4335" d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
                    <path fill="#FBBC05" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/>
                    <path fill="#34A853" d="M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-white flex items-center space-x-1.5">
                    <span>Google Fit</span>
                    {googleFitState.isConnected && (
                      <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-black px-2 py-0.5 rounded-full border border-emerald-500/40">
                        Connected
                      </span>
                    )}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Import sleep, steps and calories burned
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleGoogleFit}
                disabled={isFitSyncing}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  googleFitState.isConnected
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                    : 'bg-white hover:bg-slate-100 text-slate-900 shadow-sm'
                }`}
              >
                {isFitSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : googleFitState.isConnected ? (
                  'Disconnect'
                ) : (
                  'Connect'
                )}
              </button>
            </div>

            {googleFitState.isConnected && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                  <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                    <div className="text-indigo-300 font-black">
                      {googleFitState.todayData.sleepHours}h {googleFitState.todayData.sleepMinutes}m
                    </div>
                    <div className="text-[9px] text-slate-400 flex items-center justify-center space-x-1 mt-0.5">
                      <Moon className="w-2.5 h-2.5" />
                      <span>Sleep</span>
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                    <div className="text-emerald-300 font-black">
                      {googleFitState.todayData.steps.toLocaleString('en-US')}
                    </div>
                    <div className="text-[9px] text-slate-400 flex items-center justify-center space-x-1 mt-0.5">
                      <Footprints className="w-2.5 h-2.5" />
                      <span>Steps</span>
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                    <div className="text-amber-300 font-black">
                      {googleFitState.todayData.activeCaloriesBurned} kcal
                    </div>
                    <div className="text-[9px] text-slate-400 flex items-center justify-center space-x-1 mt-0.5">
                      <Flame className="w-2.5 h-2.5" />
                      <span>Activity</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Synced: {googleFitState.lastSyncedAt || 'Just now'}</span>
                  <button
                    type="button"
                    onClick={handleSyncGoogleFitNow}
                    disabled={isFitSyncing}
                    className="text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFitSyncing ? 'animate-spin' : ''}`} />
                    <span>Sync now</span>
                  </button>
                </div>
              </div>
            )}

            {fitToast && (
              <div className="text-[11px] font-bold text-emerald-300 bg-emerald-950/60 p-2 rounded-xl border border-emerald-800">
                {fitToast}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {userProfile?.uid && (
          <button
            type="button"
            onClick={handleSyncFromFirestore}
            disabled={isDBSyncing}
            className="w-full py-2.5 bg-emerald-50 text-[#00C29A] hover:bg-emerald-100 border border-emerald-200 font-extrabold text-xs rounded-2xl transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDBSyncing ? 'animate-spin' : ''}`} />
            <span>{isDBSyncing ? 'Loading from database...' : 'Pull data from database'}</span>
          </button>
        )}

        <button
          onClick={handleSaveProfile}
          className="w-full py-3.5 bg-[#00C29A] text-white font-extrabold text-xs rounded-2xl shadow-[0_6px_20px_rgba(0,194,154,0.35)] hover:bg-[#00A885] transition-colors flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Check className="w-4.5 h-4.5" />
          <span>Save settings</span>
        </button>

        <button
          onClick={onResetOnboarding}
          className="w-full py-2.5 bg-slate-100 text-slate-600 font-bold rounded-2xl text-xs hover:bg-slate-200 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          <span>Retake the quiz</span>
        </button>

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full py-2 bg-rose-50 text-rose-600 font-bold rounded-2xl text-xs hover:bg-rose-100 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <span>Log out</span>
          </button>
        )}

        {/* SUB-MODAL 1: Avatar Picker */}
        <AnimatePresence>
          {isAvatarPickerOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="absolute inset-0 z-[110] bg-white rounded-[32px] p-5 flex flex-col justify-between shadow-2xl overflow-y-auto"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-emerald-100 text-[#00C29A] rounded-xl">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">Pick an avatar</h4>
                      <p className="text-[10px] text-slate-400 font-medium">Choose a preset look or upload your own</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAvatarPickerOpen(false)}
                    className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Avatar Live Preview */}
                <div className="flex items-center justify-center space-x-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="relative">
                    <img
                      src={avatar}
                      alt="Selected avatar"
                      className="w-16 h-16 rounded-full object-cover border-3 border-[#00C29A] shadow-md bg-white"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -bottom-1 -right-1 bg-[#00C29A] text-white p-1 rounded-full shadow-xs">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-black text-slate-800 block">Selected avatar</span>
                    <span className="text-[11px] text-emerald-600 font-bold">Visible to you and all friends</span>
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'fitness', label: 'Sport & Fitness' },
                    { id: 'lifestyle', label: 'Lifestyle' },
                    { id: 'characters', label: 'Characters' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setAvatarCategory(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                        avatarCategory === cat.id
                          ? 'bg-[#00C29A] text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Preset Avatar Gallery Grid */}
                <div>
                  <div className="text-[11px] font-bold text-slate-400 mb-2">Tap to select:</div>
                  <div className="grid grid-cols-4 gap-2.5 max-h-[190px] overflow-y-auto p-1 bg-slate-50/70 rounded-2xl border border-slate-200/60">
                    {AVATAR_PRESETS.filter((p) => avatarCategory === 'all' || p.category === avatarCategory).map((preset) => {
                      const isSelected = avatar === preset.url;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setAvatar(preset.url);
                          }}
                          className={`flex flex-col items-center p-1.5 rounded-2xl transition-all relative cursor-pointer group ${
                            isSelected
                              ? 'bg-emerald-100/90 ring-2 ring-[#00C29A] scale-105 shadow-xs'
                              : 'bg-white hover:bg-emerald-50/60 border border-slate-200/60 hover:border-emerald-200'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-full overflow-hidden relative shadow-2xs">
                            <img
                              src={preset.url}
                              alt={preset.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              referrerPolicy="no-referrer"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-[#00C29A]/30 flex items-center justify-center">
                                <Check className="w-4 h-4 text-white drop-shadow-md stroke-[3]" />
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] font-black text-slate-700 mt-1 truncate w-full text-center">
                            {preset.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Upload & URL Actions */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <label className="w-full py-3 px-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white font-extrabold rounded-xl text-xs shadow-md active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer">
                    {isCompressingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>Processing photo...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-emerald-400" />
                        <span>Upload your own photo</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={isCompressingImage}
                      className="hidden"
                    />
                  </label>

                  <div className="flex space-x-2">
                    <input
                      type="url"
                      value={customAvatarUrl}
                      onChange={(e) => setCustomAvatarUrl(e.target.value)}
                      placeholder="Or a photo link: https://..."
                      className="flex-1 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:border-[#00C29A]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customAvatarUrl.trim()) {
                          setAvatar(customAvatarUrl.trim());
                          setCustomAvatarUrl('');
                        }
                      }}
                      className="px-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-extrabold hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer border border-slate-200"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <button
                  onClick={() => setIsAvatarPickerOpen(false)}
                  className="w-full py-3 bg-[#00C29A] text-white font-extrabold rounded-xl text-xs hover:bg-[#00A885] transition-colors cursor-pointer shadow-md"
                >
                  Done
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SUB-MODAL 2: AI Calorie Calculation Assistant */}
        <AnimatePresence>
          {isAIAssistantOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 z-[120] bg-white rounded-[32px] p-5 flex flex-col justify-between overflow-y-auto"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-emerald-100 text-[#00C29A] rounded-xl">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">AI calorie target tuning</h4>
                      <p className="text-[10px] text-slate-400">A personal consult with a nutritionist</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAIAssistantOpen(false)}
                    className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5 text-xs">
                  <div className="font-extrabold text-slate-800">Inputs for the AI:</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                    <span>• Gender: {userProfile.gender === 'male' ? 'Male' : 'Female'}</span>
                    <span>• Age: {userProfile.age} y.o.</span>
                    <span>• Height: {userProfile.height} cm</span>
                    <span>• Current weight: {currentWeight} kg</span>
                    <span>• Goal weight: {targetWeight} kg</span>
                    <span>• Diet: {dietType}</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Workout notes or preferences (optional):
                  </label>
                  <textarea
                    value={aiNotes}
                    onChange={(e) => setAiNotes(e.target.value)}
                    placeholder="E.g.: gym 3x a week, want more protein, hard to lose weight..."
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs outline-none h-20 resize-none"
                  />
                </div>

                {isAiLoading && (
                  <div className="py-8 text-center space-y-2">
                    <Loader2 className="w-8 h-8 text-[#00C29A] animate-spin mx-auto" />
                    <p className="text-xs font-bold text-slate-600">AI is analyzing your metabolism and goals...</p>
                  </div>
                )}

                {aiResult && !isAiLoading && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-emerald-900">AI recommendation:</span>
                      <span className="text-lg font-black text-[#00C29A]">{aiResult.recommendedCalories} kcal/day</span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs">
                      {aiResult.explanation}
                    </p>

                    <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <div className="text-emerald-700">{aiResult.recommendedProtein}g</div>
                        <div className="text-slate-400">Protein</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <div className="text-amber-700">{aiResult.recommendedFat}g</div>
                        <div className="text-slate-400">Fat</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-100">
                        <div className="text-indigo-700">{aiResult.recommendedCarbs}g</div>
                        <div className="text-slate-400">Carbs</div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="space-y-2 pt-3">
                {!aiResult ? (
                  <button
                    onClick={handleCalculateWithAI}
                    disabled={isAiLoading}
                    className="w-full py-3.5 bg-[#00C29A] text-white font-extrabold text-xs rounded-2xl shadow-md hover:bg-[#00A885] transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Calculate targets with AI</span>
                  </button>
                ) : (
                  <button
                    onClick={handleApplyAiResult}
                    className="w-full py-3.5 bg-[#00C29A] text-white font-extrabold text-xs rounded-2xl shadow-md hover:bg-[#00A885] transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Check className="w-4.5 h-4.5" />
                    <span>Apply AI targets to profile</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
