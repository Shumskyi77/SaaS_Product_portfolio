'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Scale,
  Plus,
  X,
  Check,
  Trash2,
  TrendingDown,
  TrendingUp,
  Settings,
  Pencil,
  Cloud,
  Minus,
  Sparkles,
  Award,
  Calendar,
  Flame,
  ChevronRight,
  Info,
  ShieldCheck,
  AlertCircle,
  Zap,
  Apple,
  Droplets,
  Brain,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  BarChart3,
  Moon,
  Footprints,
  RefreshCw,
  BedDouble,
  Heart,
  Timer,
  Compass,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Line,
  ComposedChart,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { UserProfile, WeightLogEntry } from '../types/user';
import {
  getLocalDateString,
  getStoredWeightLogs,
  saveWeightLog,
  deleteWeightLog,
  saveWeightLogsBulk,
  getStoredMealLogs,
  getStoredWorkoutLogs,
  getStoredWater,
} from '../lib/store';
import {
  fetchWeightLogsFromFirestore,
  saveWeightLogToFirestore,
  deleteWeightLogFromFirestore,
} from '../lib/supabaseDb';
import {
  getStoredGoogleFitState,
  syncGoogleFitData,
  connectGoogleFitAccount,
} from '../lib/googleFit';
import { GoogleFitState } from '../types/googleFit';

interface ProgressPageProps {
  userProfile: UserProfile;
  onUpdateWeight: (newWeight: number) => void;
  onOpenProfile?: () => void;
}

export const ProgressPage: React.FC<ProgressPageProps> = ({ userProfile, onUpdateWeight, onOpenProfile }) => {
  const [activeTab, setActiveTab] = useState<'google_fit' | 'weight' | 'nutrition' | 'portrait'>('google_fit');
  const [chartViewMode, setChartViewMode] = useState<'weight' | 'delta'>('weight');
  const [isCo1ModalOpen, setIsCo1ModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');

  // Google Fit state
  const [googleFitState, setGoogleFitState] = useState<GoogleFitState>(() => getStoredGoogleFitState());
  const [isFitSyncing, setIsFitSyncing] = useState(false);
  const [fitToast, setFitToast] = useState<string | null>(null);

  useEffect(() => {
    setGoogleFitState(getStoredGoogleFitState());
  }, []);

  const handleSyncFitNow = async () => {
    setIsFitSyncing(true);
    const updated = await syncGoogleFitData();
    setGoogleFitState(updated);
    setIsFitSyncing(false);
    setFitToast('Google Fit data refreshed!');
    setTimeout(() => setFitToast(null), 3000);
  };

  const handleConnectFit = async () => {
    setIsFitSyncing(true);
    const updated = await connectGoogleFitAccount(userProfile.email, userProfile.name);
    setGoogleFitState(updated);
    setIsFitSyncing(false);
    setFitToast('🎉 Google Fit connected!');
    setTimeout(() => setFitToast(null), 3000);
  };

  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>(() =>
    getStoredWeightLogs(userProfile.currentWeight)
  );

  const [weightTimeRange, setWeightTimeRange] = useState<'1 day' | '7 days' | '1 month' | '3 months' | '6 months' | 'All'>('1 month');
  const [nutritionTimeRange, setNutritionTimeRange] = useState<'7 days' | '30 days' | '90 days'>('30 days');
  const [mealGradeRange, setMealGradeRange] = useState<'7 days' | '30 days' | '90 days'>('90 days');

  const [isAddWeightModalOpen, setIsAddWeightModalOpen] = useState(false);
  const [newWeightInput, setNewWeightInput] = useState<number>(userProfile.currentWeight || 70.0);
  const [newDateInput, setNewDateInput] = useState<string>(
    getLocalDateString()
  );

  // Sync weight logs from Firestore
  useEffect(() => {
    if (userProfile?.uid) {
      setIsSyncing(true);
      fetchWeightLogsFromFirestore(userProfile.uid)
        .then((firestoreWeights) => {
          if (firestoreWeights && firestoreWeights.length > 0) {
            const formatted: WeightLogEntry[] = firestoreWeights.map((fw) => ({
              userId: userProfile.uid,
              date: fw.date,
              weight: Number(fw.weight),
            }));
            const merged = saveWeightLogsBulk(formatted);
            setWeightLogs(merged);
            const latest = merged[merged.length - 1];
            if (latest && latest.weight !== userProfile.currentWeight) {
              onUpdateWeight(latest.weight);
            }
          } else {
            const local = getStoredWeightLogs(userProfile.currentWeight);
            local.forEach((entry) => {
              saveWeightLogToFirestore({
                userId: userProfile.uid,
                date: entry.date,
                weight: entry.weight,
              });
            });
          }
          setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        })
        .catch((err) => {
          console.warn('Firestore weight logs sync error:', err);
        })
        .finally(() => {
          setIsSyncing(false);
        });
    }
  }, [userProfile?.uid]);

  // Weight & Calculations
  const currentWeightVal = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight : (userProfile.currentWeight || 70);
  const startWeight = weightLogs[0]?.weight || currentWeightVal;
  const targetWeight = userProfile.targetWeight || 65;

  // Weight Change Calculations
  const totalWeightChange = +(currentWeightVal - startWeight).toFixed(1);
  const remainingToGoal = +(currentWeightVal - targetWeight).toFixed(1);
  const totalGoalDelta = Math.abs(startWeight - targetWeight);
  const achievedDelta = Math.abs(startWeight - currentWeightVal);
  const progressPercent = totalGoalDelta > 0 
    ? Math.min(100, Math.max(0, Math.round((achievedDelta / totalGoalDelta) * 100))) 
    : 100;

  // BMI Calculation
  const heightM = (userProfile.height || 175) / 100;
  const bmi = +(currentWeightVal / (heightM * heightM)).toFixed(1);
  const getBmiCategory = (b: number) => {
    if (b < 18.5) return { label: 'Underweight', color: 'text-amber-700', bg: 'bg-amber-100/70', border: 'border-amber-300' };
    if (b < 25) return { label: 'Healthy weight', color: 'text-emerald-700', bg: 'bg-emerald-100/70', border: 'border-emerald-300' };
    if (b < 30) return { label: 'Overweight', color: 'text-amber-700', bg: 'bg-amber-100/70', border: 'border-amber-300' };
    return { label: 'Obesity', color: 'text-rose-700', bg: 'bg-rose-100/70', border: 'border-rose-300' };
  };
  const bmiInfo = getBmiCategory(bmi);

  // Best recorded weight
  const minRecordedWeight = weightLogs.length > 0 ? Math.min(...weightLogs.map((l) => l.weight)) : currentWeightVal;

  const handleSaveWeightEntry = async () => {
    const entry: WeightLogEntry = {
      userId: userProfile.uid || 'u1',
      date: newDateInput,
      weight: Number(newWeightInput.toFixed(1)),
    };

    const updated = saveWeightLog(entry);
    setWeightLogs(updated);

    const latest = updated[updated.length - 1];
    if (latest) {
      onUpdateWeight(latest.weight);
    }

    if (userProfile?.uid) {
      setIsSyncing(true);
      await saveWeightLogToFirestore(entry);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsSyncing(false);
    }

    setIsAddWeightModalOpen(false);
  };

  const handleDeleteEntry = async (dateStr: string) => {
    const updated = deleteWeightLog(dateStr);
    setWeightLogs(updated);
    if (updated.length > 0) {
      onUpdateWeight(updated[updated.length - 1].weight);
    }

    if (userProfile?.uid) {
      setIsSyncing(true);
      await deleteWeightLogFromFirestore(userProfile.uid, dateStr);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsSyncing(false);
    }
  };

  // Filtered Weight Chart Data
  const filteredLogs = useMemo(() => {
    if (weightLogs.length === 0) return [];
    if (weightTimeRange === 'All') return weightLogs;

    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let daysToSubtract = 30;
    if (weightTimeRange === '1 day') daysToSubtract = 1;
    else if (weightTimeRange === '7 days') daysToSubtract = 7;
    else if (weightTimeRange === '1 month') daysToSubtract = 30;
    else if (weightTimeRange === '3 months') daysToSubtract = 90;
    else if (weightTimeRange === '6 months') daysToSubtract = 180;

    const cutoffMs = todayEnd.getTime() - daysToSubtract * 24 * 60 * 60 * 1000;
    const cutoffDateStr = getLocalDateString(new Date(cutoffMs));

    let filtered = weightLogs.filter((log) => log.date >= cutoffDateStr);

    if (filtered.length === 1 && weightLogs.length > 1) {
      const idx = weightLogs.findIndex((l) => l.date === filtered[0].date);
      if (idx > 0) {
        filtered = [weightLogs[idx - 1], ...filtered];
      }
    } else if (filtered.length === 0) {
      filtered = weightLogs.slice(-2);
    }

    return filtered;
  }, [weightLogs, weightTimeRange]);

  const formatXAxisDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNamesEn[month - 1] || `${month}`;

    if (weightTimeRange === '3 months' || weightTimeRange === '6 months' || weightTimeRange === 'All') {
      return `${day} ${monthName}`;
    }
    return `${month < 10 ? '0' + month : month}/${day < 10 ? '0' + day : day}`;
  };

  const weightChartData = useMemo(() => {
    return filteredLogs.map((log) => {
      const deltaFromStart = +(log.weight - startWeight).toFixed(1);
      const deltaToTarget = +(log.weight - targetWeight).toFixed(1);
      return {
        date: formatXAxisDate(log.date),
        rawDate: log.date,
        weight: log.weight,
        deltaFromStart,
        deltaToTarget,
        target: targetWeight,
        start: startWeight,
      };
    });
  }, [filteredLogs, startWeight, targetWeight]);

  const weightsArray = filteredLogs.map((l) => l.weight);
  const minW = weightsArray.length ? Math.floor(Math.min(...weightsArray, targetWeight) - 1.5) : 40;
  const maxW = weightsArray.length ? Math.ceil(Math.max(...weightsArray, targetWeight) + 1.5) : 80;

  // Nutrition & Macro Chart Data
  const nutritionData = useMemo(() => {
    const data = [];
    const today = new Date();
    const daysCount = nutritionTimeRange === '7 days' ? 7 : nutritionTimeRange === '30 days' ? 14 : 30;

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const monthDay = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;

      const dayMeals = getStoredMealLogs(dateStr);
      const dayWorkouts = getStoredWorkoutLogs(dateStr);
      const dayWater = getStoredWater(dateStr);

      const totalCals = dayMeals.reduce((acc, m) => acc + (m.calories || 0), 0);
      const totalProtein = dayMeals.reduce((acc, m) => acc + (m.protein || 0), 0);
      const totalFat = dayMeals.reduce((acc, m) => acc + (m.fat || 0), 0);
      const totalCarbs = dayMeals.reduce((acc, m) => acc + (m.carbs || 0), 0);
      const totalFiber = dayMeals.reduce((acc, m) => acc + (m.fiber || 0), 0);
      const totalBurned = dayWorkouts.reduce((acc, w) => acc + (w.caloriesBurned || 0), 0);
      const effectiveTarget = (userProfile.targetCalories || 1200) + totalBurned;

      // Meal type breakdown
      const bCals = dayMeals.filter((m) => m.type === 'breakfast').reduce((acc, m) => acc + (m.calories || 0), 0);
      const lCals = dayMeals.filter((m) => m.type === 'lunch').reduce((acc, m) => acc + (m.calories || 0), 0);
      const dCals = dayMeals.filter((m) => m.type === 'dinner').reduce((acc, m) => acc + (m.calories || 0), 0);
      const sCals = dayMeals.filter((m) => m.type === 'snack').reduce((acc, m) => acc + (m.calories || 0), 0);

      data.push({
        date: monthDay,
        rawDate: dateStr,
        calories: totalCals,
        target: effectiveTarget,
        burned: totalBurned,
        protein: totalProtein,
        fat: totalFat,
        carbs: totalCarbs,
        fiber: totalFiber,
        water: dayWater,
        breakfast: bCals,
        lunch: lCals,
        dinner: dCals,
        snack: sCals,
      });
    }
    return data;
  }, [nutritionTimeRange, userProfile.targetCalories]);

  // Aggregated Macro & Lifestyle Portrait Analysis
  const healthPortrait = useMemo(() => {
    const activeDays = nutritionData.filter((d) => d.calories > 0);
    const count = activeDays.length || 1;

    const avgCals = Math.round(activeDays.reduce((a, b) => a + b.calories, 0) / count) || (userProfile.targetCalories || 1200);
    const avgProtein = Math.round(activeDays.reduce((a, b) => a + b.protein, 0) / count) || Math.round(((userProfile.targetCalories || 1200) * 0.3) / 4);
    const avgFat = Math.round(activeDays.reduce((a, b) => a + b.fat, 0) / count) || Math.round(((userProfile.targetCalories || 1200) * 0.25) / 9);
    const avgCarbs = Math.round(activeDays.reduce((a, b) => a + b.carbs, 0) / count) || Math.round(((userProfile.targetCalories || 1200) * 0.45) / 4);
    const avgFiber = Math.round(activeDays.reduce((a, b) => a + b.fiber, 0) / count) || 22;
    const avgWater = Math.round(activeDays.reduce((a, b) => a + b.water, 0) / count) || 2100;

    const targetCals = userProfile.targetCalories || 1200;
    const targetProtein = Math.round((targetCals * 0.3) / 4);
    const targetFat = Math.round((targetCals * 0.25) / 9);
    const targetCarbs = Math.round((targetCals * 0.45) / 4);
    const targetFiber = 30;
    const targetWater = 2500;

    const totalB = activeDays.reduce((a, b) => a + b.breakfast, 0);
    const totalL = activeDays.reduce((a, b) => a + b.lunch, 0);
    const totalD = activeDays.reduce((a, b) => a + b.dinner, 0);
    const totalS = activeDays.reduce((a, b) => a + b.snack, 0);
    const allMealCals = (totalB + totalL + totalD + totalS) || 1;

    const pctB = Math.round((totalB / allMealCals) * 100) || 25;
    const pctL = Math.round((totalL / allMealCals) * 100) || 35;
    const pctD = Math.round((totalD / allMealCals) * 100) || 30;
    const pctS = Math.round((totalS / allMealCals) * 100) || 10;

    const mealDistributionPie = [
      { name: 'Breakfast', value: pctB, color: '#0AB68B' },
      { name: 'Lunch', value: pctL, color: '#f59e0b' },
      { name: 'Dinner', value: pctD, color: '#6366f1' },
      { name: 'Snacks', value: pctS, color: '#ec4899' },
    ];

    // Compute Strengths & Weaknesses
    const strengths: { title: string; desc: string; icon: string; impact: string }[] = [];
    const weaknesses: { title: string; desc: string; recommendation: string; icon: string; severity: 'high' | 'medium' }[] = [];

    // Protein check
    if (avgProtein >= targetProtein * 0.85) {
      strengths.push({
        title: 'High protein density',
        desc: `You average ${avgProtein}g of protein per day (${Math.round((avgProtein / targetProtein) * 100)}% of target). This protects muscle from breakdown and keeps you full.`,
        icon: '🥩',
        impact: '+95% muscle protection',
      });
    } else {
      weaknesses.push({
        title: 'Low protein intake',
        desc: `Your current protein ${avgProtein}g/day is below the ${targetProtein}g target.`,
        recommendation: 'Add eggs, cottage cheese, chicken breast, tofu or fish to your main meals.',
        icon: '🥩',
        severity: 'high',
      });
    }

    // Breakfast regularity
    if (pctB >= 20 && pctB <= 35) {
      strengths.push({
        title: 'Consistent hearty breakfast',
        desc: `Breakfast is ${pctB}% of your daily intake. This prevents daytime hunger spikes and evening overeating.`,
        icon: '🌅',
        impact: '+90% appetite control',
      });
    } else if (pctB < 15) {
      weaknesses.push({
        title: 'Too light or skipped breakfast',
        desc: `Breakfast is only ${pctB}% of your daily calories.`,
        recommendation: 'Make time for a filling protein-carb breakfast (oatmeal with berries, omelet).',
        icon: '🌅',
        severity: 'medium',
      });
    }

    // Fiber Check
    if (avgFiber >= 25) {
      strengths.push({
        title: 'Great fiber level',
        desc: `Your plant fiber intake (${avgFiber}g/day) supports healthy gut flora and stable blood sugar.`,
        icon: '🥗',
        impact: '+92% gut health',
      });
    } else {
      weaknesses.push({
        title: 'Low fiber intake',
        desc: `You average ${avgFiber}g of fiber vs the 30g daily target.`,
        recommendation: 'Eat more greens, broccoli, flax/chia seeds, berries and whole-grain bread.',
        icon: '🥗',
        severity: 'high',
      });
    }

    // Hydration Check
    if (avgWater >= 2000) {
      strengths.push({
        title: 'Optimal hydration',
        desc: `Average hydration of ${avgWater} ml/day speeds up cellular metabolism and waste removal.`,
        icon: '💧',
        impact: '+88% metabolism',
      });
    } else {
      weaknesses.push({
        title: 'Not enough plain water',
        desc: `Average water ${avgWater} ml/day is below the ${targetWater} ml target.`,
        recommendation: 'Keep a water bottle on your desk and drink a glass every hour.',
        icon: '💧',
        severity: 'medium',
      });
    }

    // Evening caloric load
    if (pctD > 38) {
      weaknesses.push({
        title: 'Heavy evening calorie load',
        desc: `Dinner is ${pctD}% of your daily energy. This can hurt sleep quality and slow overnight fat burn.`,
        recommendation: 'Make dinner lighter (protein + non-starchy veggies) and shift calories to lunch.',
        icon: '🌙',
        severity: 'medium',
      });
    } else {
      strengths.push({
        title: 'Even calorie distribution',
        desc: `Dinner is a balanced ${pctD}% of your intake without overloading digestion before bed.`,
        icon: '🌙',
        impact: '+86% sleep quality',
      });
    }

    // Quality Score Calculation
    let score = 70;
    if (avgProtein >= targetProtein * 0.8) score += 8;
    if (avgFiber >= 22) score += 8;
    if (avgWater >= 2000) score += 7;
    if (pctD <= 35) score += 4;
    if (Math.abs(avgCals - targetCals) < 150) score += 5;
    score = Math.min(98, Math.max(55, score));

    return {
      score,
      avgCals,
      avgProtein,
      avgFat,
      avgCarbs,
      avgFiber,
      avgWater,
      targetCals,
      targetProtein,
      targetFat,
      targetCarbs,
      targetFiber,
      targetWater,
      mealDistributionPie,
      strengths,
      weaknesses,
    };
  }, [nutritionData, userProfile.targetCalories]);

  const todayDateStr = useMemo(() => getLocalDateString(), []);
  const todayMeals = useMemo(() => getStoredMealLogs(todayDateStr), [todayDateStr, activeTab]);
  const todayFoodCalories = useMemo(() => todayMeals.reduce((sum, m) => sum + (m.calories || 0), 0), [todayMeals]);
  const todayFoodProtein = useMemo(() => todayMeals.reduce((sum, m) => sum + (m.protein || 0), 0), [todayMeals]);
  const todayFoodFat = useMemo(() => todayMeals.reduce((sum, m) => sum + (m.fat || 0), 0), [todayMeals]);
  const todayFoodCarbs = useMemo(() => todayMeals.reduce((sum, m) => sum + (m.carbs || 0), 0), [todayMeals]);

  // Metabolic & Energy Balance calculations connecting Food Diary + Google Fit
  const baseTDEE = userProfile.tdee || (userProfile.bmr ? Math.round(userProfile.bmr * 1.2) : 1850);
  const fitActiveCalories = googleFitState.todayData.activeCaloriesBurned || 0;
  const totalDailyBurned = baseTDEE + fitActiveCalories;
  const netEnergyDeficit = totalDailyBurned - todayFoodCalories;

  const formatDateRu = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const monthsRu = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      const mIdx = parseInt(month, 10) - 1;
      return `${parseInt(day, 10)} ${monthsRu[mIdx]} ${year}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4 font-sans max-w-full pb-20">
      {/* 1. COMPACT SLEEK PROFILE & TARGET SUMMARY STRIP */}
      <div className="bg-gradient-to-r from-emerald-600/10 via-emerald-500/5 to-teal-500/10 p-3.5 rounded-2xl border border-emerald-200/60 flex items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center space-x-3 min-w-0">
          <div
            onClick={() => onOpenProfile?.()}
            className="relative cursor-pointer shrink-0"
            title="Open profile settings"
          >
            <img
              src={(userProfile as any).avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
              alt={userProfile.name || 'User'}
              className="w-11 h-11 rounded-full object-cover border-2 border-white shadow-xs ring-1 ring-emerald-300/50"
              referrerPolicy="no-referrer"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white shadow-xs" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 truncate">
              <span className="text-sm font-black text-slate-900 truncate">
                {userProfile.name || 'User'}
              </span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 shrink-0">
                {userProfile.targetCalories || 1200} kcal
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
              {userProfile.weeklyGoal < 0
                ? 'Weight loss'
                : userProfile.weeklyGoal > 0
                ? 'Muscle gain'
                : 'Maintenance'}{' '}
              · goal {targetWeight} kg
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Cloud Sync Status */}
          <div
            className={`flex items-center space-x-1 px-2 py-1 rounded-xl text-[10px] font-bold border transition-colors ${
              isSyncing
                ? 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse'
                : 'bg-white/90 text-emerald-700 border-emerald-200/80 shadow-2xs'
            }`}
            title="Firestore cloud database"
          >
            <Cloud className="w-3 h-3" />
            <span className="hidden xs:inline">{isSyncing ? 'Syncing...' : 'Cloud'}</span>
          </div>

          {/* Co1 Badge */}
          <button
            onClick={() => setIsCo1ModalOpen(true)}
            className="w-7 h-7 rounded-xl bg-white text-slate-700 flex items-center justify-center text-[10px] font-black border border-slate-200/80 shadow-2xs hover:border-emerald-500 hover:text-emerald-600 transition-colors cursor-pointer"
            title="Cohort & Streak"
          >
            co<span className="text-[8px] -mt-1 font-bold">1</span>
          </button>

          {/* Edit Profile */}
          <button
            onClick={() => onOpenProfile?.()}
            className="w-7 h-7 rounded-xl bg-white text-slate-700 flex items-center justify-center border border-slate-200/80 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
            title="Profile settings"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* 2. ELEGANT SEGMENTED TABS (Google Fit / Weight / Nutrition / Health Portrait) */}
      <div className="bg-slate-200/70 p-1 rounded-2xl flex items-center shadow-inner gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('google_fit')}
          className={`flex-1 min-w-[90px] py-2 px-2 text-center rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
            activeTab === 'google_fit'
              ? 'bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-sm ring-1 ring-slate-900/10'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Google Fit</span>
        </button>
        <button
          onClick={() => setActiveTab('weight')}
          className={`flex-1 min-w-[90px] py-2 px-2 text-center rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'weight'
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Weight trend
        </button>
        <button
          onClick={() => setActiveTab('nutrition')}
          className={`flex-1 min-w-[85px] py-2 px-2 text-center rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'nutrition'
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Macro charts
        </button>
        <button
          onClick={() => setActiveTab('portrait')}
          className={`flex-1 min-w-[70px] py-2 px-2 text-center rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'portrait'
              ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-500/20'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Profile
        </button>
      </div>

      {/* TAB 0: GOOGLE FIT HEALTH & LIFESTYLE ANALYTICS */}
      {activeTab === 'google_fit' && (
        <div className="space-y-4">
          {/* A. GOOGLE FIT SYNC & STATUS HEADER */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl p-5 border border-slate-800 shadow-md space-y-4">
            <div className="flex flex-col justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-xs shrink-0 mt-1">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                    <path fill="#EA4335" d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
                    <path fill="#FBBC05" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/>
                    <path fill="#34A853" d="M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-white">Google Fit & Ecosystem</h3>
                    {googleFitState.isConnected ? (
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/40">
                        Synced
                      </span>
                    ) : (
                      <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                        Standalone mode
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sync of sleep, steps, burned calories and personal AI recommendations
                  </p>
                </div>
              </div>

              <div className="flex items-center w-full">
                {googleFitState.isConnected ? (
                  <button
                    onClick={handleSyncFitNow}
                    disabled={isFitSyncing}
                    className="w-full px-4 py-2.5 bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer flex justify-center items-center space-x-2"
                    title="Refresh Google Fit data"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFitSyncing ? 'animate-spin' : ''}`} />
                    <span>{isFitSyncing ? 'Syncing...' : 'Refresh'}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleConnectFit}
                    disabled={isFitSyncing}
                    className="w-full px-4 py-2.5 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm text-center"
                  >
                    Connect account
                  </button>
                )}
              </div>
            </div>

            {/* Quick 4 KPI Cards */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
              <div className="bg-slate-800/70 p-3 rounded-2xl border border-slate-700/80 space-y-1">
                <div className="flex items-center justify-between text-indigo-300">
                  <span className="text-[10px] uppercase font-black text-slate-400">Sleep</span>
                  <Moon className="w-3.5 h-3.5" />
                </div>
                <div className="text-base font-black text-white">
                  {googleFitState.todayData.sleepHours}h {googleFitState.todayData.sleepMinutes}m
                </div>
                <div className="text-[10px] text-emerald-400 font-bold">
                  Recovery: {googleFitState.todayData.sleepScore}%
                </div>
              </div>

              <div className="bg-slate-800/70 p-3 rounded-2xl border border-slate-700/80 space-y-1">
                <div className="flex items-center justify-between text-emerald-300">
                  <span className="text-[10px] uppercase font-black text-slate-400">Google Fit steps</span>
                  <Footprints className="w-3.5 h-3.5" />
                </div>
                <div className="text-base font-black text-white">
                  {googleFitState.todayData.steps.toLocaleString('ru-RU')}
                </div>
                <div className="text-[10px] text-slate-300 font-bold">
                  Goal: {googleFitState.todayData.stepGoal.toLocaleString('en-US')} ({Math.round((googleFitState.todayData.steps / googleFitState.todayData.stepGoal) * 100)}%)
                </div>
              </div>

              <div className="bg-slate-800/70 p-3 rounded-2xl border border-slate-700/80 space-y-1">
                <div className="flex items-center justify-between text-amber-300">
                  <span className="text-[10px] uppercase font-black text-slate-400">Active burn</span>
                  <Flame className="w-3.5 h-3.5" />
                </div>
                <div className="text-base font-black text-amber-400">
                  +{googleFitState.todayData.activeCaloriesBurned} kcal
                </div>
                <div className="text-[10px] text-slate-300 font-bold">
                  {googleFitState.todayData.distanceKm} km · {googleFitState.todayData.activeMinutes} min
                </div>
              </div>

              <div className="bg-slate-800/70 p-3 rounded-2xl border border-slate-700/80 space-y-1">
                <div className="flex items-center justify-between text-rose-300">
                  <span className="text-[10px] uppercase font-black text-slate-400">Resting heart rate</span>
                  <Heart className="w-3.5 h-3.5" />
                </div>
                <div className="text-base font-black text-white">
                  {googleFitState.todayData.heartRateRest} bpm
                </div>
                <div className="text-[10px] text-slate-400 font-bold">
                  Average: {googleFitState.todayData.heartRateAvg} bpm
                </div>
              </div>
            </div>

            {fitToast && (
              <div className="text-xs font-bold text-emerald-300 bg-emerald-950/80 p-2.5 rounded-xl border border-emerald-700">
                {fitToast}
              </div>
            )}
          </div>

          {/* B. DEEP METABOLIC ENERGY BALANCE (Food + Google Fit Synergy) */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Energy balance (Food ↔ Google Fit)</h4>
                  <p className="text-[10px] text-slate-400">Comparison of actual food intake and daily burn</p>
                </div>
              </div>

              <div className={`px-2.5 py-1 rounded-xl text-xs font-black border ${
                netEnergyDeficit > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {netEnergyDeficit > 0 ? `Deficit: -${netEnergyDeficit} kcal` : `Surplus: +${Math.abs(netEnergyDeficit)} kcal`}
              </div>
            </div>

            {/* In vs Out Cards */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center text-xs">
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Consumed (Food)</div>
                <div className="font-black text-slate-900 text-sm mt-0.5">
                  {todayFoodCalories} kcal
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">
                  P {todayFoodProtein}g · F {todayFoodFat}g · C {todayFoodCarbs}g
                </div>
              </div>

              <div className="border-x border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Burned (Google Fit)</div>
                <div className="font-black text-amber-600 text-sm mt-0.5">
                  {totalDailyBurned} kcal
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">
                  TDEE {baseTDEE} + Active {fitActiveCalories}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Net balance</div>
                <div className={`font-black text-sm mt-0.5 ${netEnergyDeficit > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {netEnergyDeficit > 0 ? `-${netEnergyDeficit}` : `+${Math.abs(netEnergyDeficit)}`} kcal
                </div>
                <div className="text-[9px] text-emerald-700 font-bold mt-0.5">
                  {netEnergyDeficit >= 300 && netEnergyDeficit <= 700 ? 'Fat burning ✅' : netEnergyDeficit > 700 ? 'High deficit' : 'Maintenance'}
                </div>
              </div>
            </div>

            {/* Calorie Deficit Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Calorie burn progress for the day:</span>
                <span className="text-emerald-700 font-black">
                  {totalDailyBurned > 0 ? Math.round((todayFoodCalories / totalDailyBurned) * 100) : 0}% of the burn compensated
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="bg-[#0AB68B] h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (todayFoodCalories / totalDailyBurned) * 100)}%` }}
                  title="Consumed"
                />
                <div
                  className="bg-amber-400 h-full flex-1 opacity-70"
                  title="Remaining deficit"
                />
              </div>
            </div>
          </div>

          {/* C. AI COACH DYNAMIC PRESCRIPTION (Sleep + Steps + Nutrition) */}
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white rounded-3xl p-5 border border-indigo-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white">AI Coach recommendations based on Google Fit</h4>
                  <p className="text-[10px] text-indigo-200/70">Automatic analysis of sleep, activity and nutrition</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Smart Coach AI
              </span>
            </div>

            <div className="space-y-2.5">
              {/* Sleep impact recommendation */}
              <div className="bg-indigo-900/40 p-3 rounded-2xl border border-indigo-700/50 flex items-start space-x-3">
                <Moon className="w-4 h-4 text-indigo-300 mt-0.5 shrink-0" />
                <div className="space-y-0.5 text-xs text-indigo-100">
                  <div className="font-extrabold text-white">
                    {googleFitState.todayData.sleepHours >= 7.5 ? 'Excellent nervous system recovery' : 'Slight sleep deficit — appetite control'}
                  </div>
                  <p className="text-[11px] text-indigo-200/90 leading-relaxed">
                    {googleFitState.todayData.sleepHours >= 7.5
                      ? `Deep sleep of ${Math.floor(googleFitState.todayData.deepSleepMinutes / 60)}h ${googleFitState.todayData.deepSleepMinutes % 60}m optimized your leptin level. Your satiety will stay stable.`
                      : `With less than 7.5h of sleep, ghrelin production increases. We recommend drinking +400 ml of water and adding 25 g of complex carbs to lunch to prevent evening sugar cravings.`}
                  </p>
                </div>
              </div>

              {/* Steps & workout recommendation */}
              <div className="bg-indigo-900/40 p-3 rounded-2xl border border-indigo-700/50 flex items-start space-x-3">
                <Flame className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-0.5 text-xs text-indigo-100">
                  <div className="font-extrabold text-white">
                    Daily activity: {googleFitState.todayData.steps.toLocaleString('en-US')} steps
                  </div>
                  <p className="text-[11px] text-indigo-200/90 leading-relaxed">
                    Activity burned {googleFitState.todayData.activeCaloriesBurned} kcal. To support muscle synthesis, increase the protein portion in your next meal to 30-35 g.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* D. SLEEP ARCHITECTURE & PHASES CARD */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Sleep architecture and phases</h4>
                  <p className="text-[10px] text-slate-400">Nervous system and muscle recovery analysis</p>
                </div>
              </div>

              <div className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black">
                {googleFitState.todayData.sleepScore}/100 Sleep score
              </div>
            </div>

            {/* Total Sleep Time & Bedtime Schedule */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center text-xs">
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Total time</div>
                <div className="font-black text-slate-900 text-sm mt-0.5">
                  {googleFitState.todayData.sleepHours}h {googleFitState.todayData.sleepMinutes}m
                </div>
              </div>
              <div className="border-x border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Bedtime</div>
                <div className="font-black text-indigo-700 text-sm mt-0.5">
                  {googleFitState.todayData.bedTime}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Wake up</div>
                <div className="font-black text-emerald-700 text-sm mt-0.5">
                  {googleFitState.todayData.wakeTime}
                </div>
              </div>
            </div>

            {/* Sleep Stages Proportions Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span>Sleep phases (duration):</span>
                <span className="text-slate-400 text-[11px]">100% of the cycle</span>
              </div>

              <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 shadow-inner">
                <div
                  className="bg-indigo-700 h-full"
                  style={{ width: `${Math.round((googleFitState.todayData.deepSleepMinutes / (googleFitState.todayData.sleepHours * 60 + googleFitState.todayData.sleepMinutes)) * 100)}%` }}
                  title="Deep sleep"
                />
                <div
                  className="bg-violet-500 h-full"
                  style={{ width: `${Math.round((googleFitState.todayData.remSleepMinutes / (googleFitState.todayData.sleepHours * 60 + googleFitState.todayData.sleepMinutes)) * 100)}%` }}
                  title="REM sleep"
                />
                <div
                  className="bg-indigo-300 h-full flex-1"
                  title="Light sleep"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-700 shrink-0" />
                  <div>
                    <span className="font-extrabold text-slate-800">Deep:</span>{' '}
                    <span className="text-slate-500">{Math.floor(googleFitState.todayData.deepSleepMinutes / 60)}h {googleFitState.todayData.deepSleepMinutes % 60}m</span>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />
                  <div>
                    <span className="font-extrabold text-slate-800">REM:</span>{' '}
                    <span className="text-slate-500">{Math.floor(googleFitState.todayData.remSleepMinutes / 60)}h {googleFitState.todayData.remSleepMinutes % 60}m</span>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-300 shrink-0" />
                  <div>
                    <span className="font-extrabold text-slate-800">Light:</span>{' '}
                    <span className="text-slate-500">{Math.floor(googleFitState.todayData.lightSleepMinutes / 60)}h {googleFitState.todayData.lightSleepMinutes % 60}m</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 7-Day Sleep Duration Chart */}
            <div className="pt-2 space-y-2">
              <div className="flex justify-between items-center text-xs font-black text-slate-800">
                <span>Sleep duration over the last 7 days (hours)</span>
                <span className="text-indigo-600 text-[11px] font-bold">Target: 8.0 h</span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={googleFitState.history7Days.map((d) => ({
                      date: d.date.split('-').slice(1).join('/'),
                      hours: Number((d.sleepHours + d.sleepMinutes / 60).toFixed(1)),
                      score: d.sleepScore,
                    }))}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="fitSleepGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[4, 10]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                    <Tooltip formatter={(value: any) => [`${value} h`, 'Sleep']} />
                    <ReferenceLine y={8.0} stroke="#6366f1" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={2.5} fill="url(#fitSleepGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* E. STEPS & ACTIVITY DETAILS CARD */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#0AB68B] flex items-center justify-center">
                  <Footprints className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">Activity and steps</h4>
                  <p className="text-[10px] text-slate-400">Synced from Google Fit step-counter sensors</p>
                </div>
              </div>

              <div className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black">
                {googleFitState.todayData.steps.toLocaleString('ru-RU')} steps
              </div>
            </div>

            {/* Progress Bar toward 10k steps */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>Goal progress (10,000 steps):</span>
                <span className="text-[#0AB68B] font-extrabold">
                  {Math.min(100, Math.round((googleFitState.todayData.steps / googleFitState.todayData.stepGoal) * 100))}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#0AB68B] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((googleFitState.todayData.steps / googleFitState.todayData.stepGoal) * 100))}%` }}
                />
              </div>
            </div>

            {/* Distance, Active Mins, Burned Grid */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center text-xs">
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Distance</div>
                <div className="font-black text-slate-900 text-sm mt-0.5">
                  {googleFitState.todayData.distanceKm} km
                </div>
              </div>
              <div className="border-x border-slate-200">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Active minutes</div>
                <div className="font-black text-emerald-700 text-sm mt-0.5">
                  {googleFitState.todayData.activeMinutes} min
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Burned</div>
                <div className="font-black text-amber-600 text-sm mt-0.5">
                  +{googleFitState.todayData.activeCaloriesBurned} kcal
                </div>
              </div>
            </div>

            {/* 7-Day Steps Bar Chart */}
            <div className="pt-2 space-y-2">
              <div className="flex justify-between items-center text-xs font-black text-slate-800">
                <span>Steps over the last 7 days</span>
                <span className="text-emerald-600 text-[11px] font-bold">Goal: 10,000</span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={googleFitState.history7Days.map((d) => ({
                      date: d.date.split('-').slice(1).join('/'),
                      steps: d.steps,
                      cals: d.activeCaloriesBurned,
                    }))}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(val: any) => [`${val.toLocaleString()} steps`, 'Steps']} />
                    <ReferenceLine y={10000} stroke="#10b981" strokeDasharray="3 3" />
                    <Bar dataKey="steps" fill="#0AB68B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: WEIGHT VIEW */}
      {activeTab === 'weight' && (
        <div className="space-y-4">
          {/* A. REFINED HERO PROGRESS OUTCOME CARD (Clean, no awkward wraps) */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
            {/* Top Label & BMI Chip */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                Progress result
              </span>
              <div className={`px-2.5 py-1 rounded-xl text-[11px] font-black ${bmiInfo.bg} ${bmiInfo.color} border ${bmiInfo.border} shadow-2xs`}>
                BMI {bmi} · {bmiInfo.label}
              </div>
            </div>

            {/* Main Result Headline */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2.5">
                {totalWeightChange < 0 ? (
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-[#0AB68B] flex items-center justify-center shrink-0">
                    <TrendingDown className="w-6 h-6" />
                  </div>
                ) : totalWeightChange > 0 ? (
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                    <Minus className="w-6 h-6" />
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-black text-slate-900 leading-tight">
                    {totalWeightChange < 0
                      ? `Lost ${Math.abs(totalWeightChange)} kg`
                      : totalWeightChange > 0
                      ? `Gained +${totalWeightChange} kg`
                      : 'Weight is stable'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {totalWeightChange === 0
                      ? 'No deviation from the starting weight'
                      : `Change from the start (${startWeight} kg)`}
                  </p>
                </div>
              </div>
            </div>

            {/* Goal Progress Bar & Target Distance */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-600">To the goal ({targetWeight} kg):</span>
                <span className="text-[#0AB68B] font-black">
                  {remainingToGoal === 0
                    ? '🎯 Goal achieved!'
                    : remainingToGoal > 0
                    ? `${Math.abs(remainingToGoal)} kg left to lose`
                    : `${Math.abs(remainingToGoal)} kg left to gain`}
                </span>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/50">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="bg-gradient-to-r from-emerald-400 to-[#0AB68B] h-full rounded-full"
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-400 font-semibold">
                <span>Start {startWeight} kg</span>
                <span className="text-slate-700 font-black">{progressPercent}% completed</span>
                <span>Goal {targetWeight} kg</span>
              </div>
            </div>
          </div>

          {/* B. 3 KEY STAT CARDS ROW (Start, Current, Goal) */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/70 shadow-2xs text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Start</span>
              <div className="text-base font-black text-slate-800 mt-0.5">{startWeight} <span className="text-xs font-medium text-slate-400">kg</span></div>
            </div>

            <div className="bg-emerald-50/70 rounded-2xl p-3.5 border border-emerald-200/70 shadow-2xs text-center ring-1 ring-emerald-400/20">
              <span className="text-[10px] uppercase font-black text-emerald-700 tracking-wider block">Current</span>
              <div className="text-base font-black text-emerald-900 mt-0.5">{currentWeightVal} <span className="text-xs font-medium text-emerald-600">kg</span></div>
            </div>

            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/70 shadow-2xs text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Goal</span>
              <div className="text-base font-black text-[#0AB68B] mt-0.5">{targetWeight} <span className="text-xs font-medium text-slate-400">kg</span></div>
            </div>
          </div>

          {/* C. ACTION BUTTON: ADD WEIGHT MEASUREMENT */}
          <button
            onClick={() => {
              setNewWeightInput(currentWeightVal);
              setNewDateInput(getLocalDateString());
              setIsAddWeightModalOpen(true);
            }}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-black text-xs rounded-2xl shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center group-hover:rotate-90 transition-transform">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span>Log a new weight (+ measurement)</span>
          </button>

          {/* D. WEIGHT CHART CARD */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-black text-slate-900 block">Weight trend chart</span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Min weight for the period: <strong className="text-slate-700">{minRecordedWeight} kg</strong>
                </span>
              </div>

              {/* Mode switch: Weight vs Delta */}
              <div className="flex bg-slate-100 p-0.5 rounded-xl text-[10px] font-extrabold text-slate-500">
                <button
                  onClick={() => setChartViewMode('weight')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    chartViewMode === 'weight' ? 'bg-white text-slate-900 shadow-2xs font-black' : ''
                  }`}
                >
                  Weight (kg)
                </button>
                <button
                  onClick={() => setChartViewMode('delta')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    chartViewMode === 'delta' ? 'bg-white text-slate-900 shadow-2xs font-black' : ''
                  }`}
                >
                  Change (Δ)
                </button>
              </div>
            </div>

            {/* Time interval filter buttons */}
            <div className="grid grid-cols-6 bg-slate-100/90 p-1 rounded-xl text-[10px] font-bold text-slate-500 gap-1 border border-slate-200/50">
              {[
                { id: '1 day', label: '1d' },
                { id: '7 days', label: '7d' },
                { id: '1 month', label: '1m' },
                { id: '3 months', label: '3m' },
                { id: '6 months', label: '6m' },
                { id: 'All', label: 'All' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setWeightTimeRange(item.id as any)}
                  className={`py-1 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                    weightTimeRange === item.id
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'hover:text-slate-800 text-slate-500 font-semibold'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Responsive Recharts Area */}
            <div className="h-52 w-full pt-2">
              {weightChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="weightLineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0AB68B" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0AB68B" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="deltaLineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={chartViewMode === 'weight' ? [minW, maxW] : ['auto', 'auto']}
                      tick={{ fontSize: 9, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: '14px',
                        border: '1px solid #f1f5f9',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                        padding: '8px 12px',
                      }}
                      labelStyle={{ fontWeight: 'bold', fontSize: '11px', color: '#0f172a' }}
                      formatter={(value: any, name: any, item: any) => {
                        const payload = item?.payload;
                        if (name === 'weight' || name === 'Weight') {
                          return [
                            `${value} kg (Δ from start: ${payload?.deltaFromStart > 0 ? '+' : ''}${payload?.deltaFromStart} kg)`,
                            'Weight',
                          ];
                        }
                        if (name === 'deltaFromStart' || name === 'Change') {
                          return [`${value > 0 ? '+' : ''}${value} kg`, 'Change from start'];
                        }
                        return [`${value} kg`, String(name || '')];
                      }}
                    />

                    {chartViewMode === 'weight' && (
                      <>
                        <ReferenceLine
                          y={targetWeight}
                          stroke="#0AB68B"
                          strokeDasharray="4 4"
                          label={{ value: `Goal ${targetWeight} kg`, fill: '#0AB68B', fontSize: 9, position: 'insideTopRight' }}
                        />
                        <ReferenceLine
                          y={startWeight}
                          stroke="#94a3b8"
                          strokeDasharray="3 3"
                          label={{ value: `Start ${startWeight} kg`, fill: '#94a3b8', fontSize: 9, position: 'insideTopLeft' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="weight"
                          name="Weight"
                          stroke="#0AB68B"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#weightLineGrad)"
                          dot={{ r: 3.5, fill: '#0AB68B', stroke: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 5.5, fill: '#0AB68B', stroke: '#ffffff', strokeWidth: 2.5 }}
                        />
                      </>
                    )}

                    {chartViewMode === 'delta' && (
                      <>
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                        <Area
                          type="monotone"
                          dataKey="deltaFromStart"
                          name="Change"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#deltaLineGrad)"
                          dot={{ r: 3.5, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 5.5, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 2.5 }}
                        />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                  <Scale className="w-8 h-8 text-slate-300 mb-1" />
                  <span>No saved weight measurements</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2 font-medium">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-[#0AB68B] inline-block" />
                <span>Line: weight trend</span>
              </span>
              <span>Synced: {lastSyncTime}</span>
            </div>
          </div>

          {/* E. WEIGHT HISTORY JOURNAL */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-900">All measurements log ({weightLogs.length})</h3>
              <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                Firestore DB ✓
              </span>
            </div>

            {weightLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">The measurement history is empty. Add your first measurement above!</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {[...weightLogs].reverse().map((log, idx, arr) => {
                  const prevLog = arr[idx + 1];
                  const diff = prevLog ? +(log.weight - prevLog.weight).toFixed(1) : 0;
                  const deltaFromStart = +(log.weight - startWeight).toFixed(1);

                  return (
                    <div
                      key={`weight-entry-${log.date}-${idx}`}
                      className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 transition-colors"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100/70 text-[#0AB68B] flex items-center justify-center font-black text-xs shadow-2xs">
                          <Scale className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-slate-800 block">
                            {formatDateRu(log.date)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {log.date === getLocalDateString() ? 'Today' : 'Measurement in the diary'}
                            {deltaFromStart !== 0 && (
                              <span className="ml-1 text-slate-500">
                                ({deltaFromStart > 0 ? '+' : ''}{deltaFromStart} kg)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2.5">
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-900 block">
                            {log.weight} kg
                          </span>
                          {diff !== 0 ? (
                            <span
                              className={`text-[10px] font-black flex items-center justify-end ${
                                diff < 0 ? 'text-[#0AB68B]' : 'text-rose-500'
                              }`}
                            >
                              {diff < 0 ? `${diff} kg` : `+${diff} kg`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">0.0 kg</span>
                          )}
                        </div>

                        <button
                          onClick={() => handleDeleteEntry(log.date)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer rounded-lg hover:bg-rose-50"
                          title="Delete measurement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NUTRITION & MACROS VIEW */}
      {activeTab === 'nutrition' && (
        <div className="space-y-4">
          {/* 1. Time range selector header */}
          <div className="flex justify-between items-center bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div>
              <span className="text-xs font-black text-slate-900 block">Analysis period</span>
              <span className="text-[10px] text-slate-400">Charts for calories, macronutrients and meals</span>
            </div>

            <div className="flex bg-slate-100 p-0.5 rounded-xl text-[10px] font-bold text-slate-500">
              {(['7 days', '30 days', '90 days'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setNutritionTimeRange(range)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    nutritionTimeRange === range
                      ? 'bg-white text-slate-900 shadow-2xs font-black'
                      : 'hover:text-slate-800'
                  }`}
                >
                  {range === '7 days' ? '7 days' : range === '30 days' ? '30 days' : '90 days'}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Calorie Balance Composed Chart */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3.5">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-black text-slate-900 block">Calorie balance (kcal)</span>
                <span className="text-[10px] text-slate-400">Eaten vs Target including activity</span>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-bold">
                <span className="flex items-center text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1"></span>Eaten</span>
                <span className="flex items-center text-slate-400"><span className="w-2 h-0.5 bg-slate-400 inline-block mr-1"></span>Target</span>
              </div>
            </div>

            <div className="h-52 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={nutritionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nutritionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0AB68B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0AB68B" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 'auto']} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '14px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    }}
                    labelStyle={{ fontWeight: 'bold', fontSize: '11px', color: '#0f172a' }}
                    formatter={(value: any, name: any) => [
                      `${value} kcal`,
                      name === 'calories' ? 'Eaten' : name === 'target' ? 'Target (with workouts)' : String(name || ''),
                    ]}
                  />
                  <ReferenceLine
                    y={userProfile.targetCalories || 1200}
                    stroke="#0AB68B"
                    strokeDasharray="4 4"
                    label={{
                      value: `${userProfile.targetCalories || 1200} kcal`,
                      fill: '#0AB68B',
                      fontSize: 9,
                      fontWeight: 'bold',
                      position: 'top',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="calories"
                    name="calories"
                    stroke="#0AB68B"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#nutritionGrad)"
                    dot={{ r: 3, fill: '#0AB68B' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="target"
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Daily Macro Breakdown (Proteins, Fats, Carbs in Grams) */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3.5">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-black text-slate-900 block">Macro trend (in grams)</span>
                <span className="text-[10px] text-slate-400">Protein, fat and carbs by day</span>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-bold">
                <span className="flex items-center text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1"></span>Protein</span>
                <span className="flex items-center text-amber-500"><span className="w-2 h-2 rounded-full bg-amber-500 mr-1"></span>Fat</span>
                <span className="flex items-center text-indigo-500"><span className="w-2 h-2 rounded-full bg-indigo-500 mr-1"></span>Carbs</span>
              </div>
            </div>

            <div className="h-48 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nutritionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '14px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    }}
                    labelStyle={{ fontWeight: 'bold', fontSize: '11px', color: '#0f172a' }}
                    formatter={(value: any, name: any) => [
                      `${value} g`,
                      name === 'protein' ? 'Protein' : name === 'fat' ? 'Fat' : name === 'carbs' ? 'Carbs' : String(name || ''),
                    ]}
                  />
                  <Bar dataKey="protein" fill="#0AB68B" radius={[4, 4, 0, 0]} name="protein" />
                  <Bar dataKey="fat" fill="#f59e0b" radius={[4, 4, 0, 0]} name="fat" />
                  <Bar dataKey="carbs" fill="#6366f1" radius={[4, 4, 0, 0]} name="carbs" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Meal Timing Distribution (PieChart & Breakdown) */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3.5">
            <div>
              <span className="text-xs font-black text-slate-900 block">Calorie distribution by meal</span>
              <span className="text-[10px] text-slate-400">Share of daily energy in %</span>
            </div>

            <div className="flex flex-col items-center justify-between gap-4 pt-1">
              <div className="h-40 w-40 relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={healthPortrait.mealDistributionPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={68}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {healthPortrait.mealDistributionPie.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [`${val}%`, 'Share']}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #f1f5f9',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-black text-slate-800">100%</span>
                  <span className="text-[9px] text-slate-400 font-bold">Diet</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full">
                {healthPortrait.mealDistributionPie.map((item, pIdx) => (
                  <div key={`meal-pie-item-${item.name}-${pIdx}`} className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs font-bold text-slate-700">{item.name}</span>
                    </div>
                    <span className="text-xs font-black text-slate-900">{item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5. Hydration & Fiber Trend Chart */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3.5">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-black text-slate-900 block">Fiber (g) and Water (ml)</span>
                <span className="text-[10px] text-slate-400">Digestive support and hydration balance</span>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-bold">
                <span className="flex items-center text-teal-600"><span className="w-2 h-2 rounded-full bg-teal-500 mr-1"></span>Fiber</span>
                <span className="flex items-center text-cyan-600"><span className="w-2 h-2 rounded-full bg-cyan-500 mr-1"></span>Water</span>
              </div>
            </div>

            <div className="h-44 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={nutritionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '14px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    }}
                    labelStyle={{ fontWeight: 'bold', fontSize: '11px', color: '#0f172a' }}
                    formatter={(value: any, name: any) => [
                      name === 'fiber' ? `${value} g` : `${value} ml`,
                      name === 'fiber' ? 'Fiber' : 'Water',
                    ]}
                  />
                  <Bar yAxisId="left" dataKey="fiber" fill="#0d9488" radius={[4, 4, 0, 0]} name="fiber" />
                  <Line yAxisId="right" type="monotone" dataKey="water" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} name="water" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DIET & LIFESTYLE PORTRAIT VIEW (Strengths & Weaknesses) */}
      {activeTab === 'portrait' && (
        <div className="space-y-4">
          {/* A. HERO NUTRITIONAL HEALTH SCORE */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 rounded-3xl p-5 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-emerald-400" />
                Nutrition profile portrait
              </span>
              <div className="px-2.5 py-1 rounded-xl bg-white/10 text-emerald-300 text-xs font-black border border-white/10">
                Nutri-IQ: {healthPortrait.score}/100
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0 shadow-inner">
                <span className="text-2xl font-black text-emerald-400">{healthPortrait.score}</span>
                <span className="text-[9px] font-extrabold text-emerald-200 absolute -bottom-1">POINTS</span>
              </div>
              <div>
                <h3 className="text-lg font-black leading-tight text-white">
                  {healthPortrait.score >= 85
                    ? 'Balanced metabolic profile'
                    : healthPortrait.score >= 70
                    ? 'Sustainable diet with growth areas'
                    : 'Macronutrient optimization required'}
                </h3>
                <p className="text-xs text-slate-300 font-medium mt-1">
                  Based on {nutritionData.length} days of analysis of your meals, hydration and workouts.
                </p>
              </div>
            </div>

            {/* Quick Macro Averages */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/10 text-center">
              <div className="bg-white/5 rounded-xl p-2">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Calories</span>
                <span className="text-xs font-black text-white">{healthPortrait.avgCals} <span className="text-[9px] text-slate-400">kcal</span></span>
              </div>
              <div className="bg-white/5 rounded-xl p-2">
                <span className="text-[9px] text-emerald-400 uppercase font-bold block">Protein</span>
                <span className="text-xs font-black text-emerald-300">{healthPortrait.avgProtein}g</span>
              </div>
              <div className="bg-white/5 rounded-xl p-2">
                <span className="text-[9px] text-amber-400 uppercase font-bold block">Fat</span>
                <span className="text-xs font-black text-amber-300">{healthPortrait.avgFat}g</span>
              </div>
              <div className="bg-white/5 rounded-xl p-2">
                <span className="text-[9px] text-indigo-400 uppercase font-bold block">Carbs</span>
                <span className="text-xs font-black text-indigo-300">{healthPortrait.avgCarbs}g</span>
              </div>
            </div>
          </div>

          {/* B. STRENGTHS */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Diet strengths</h3>
                  <p className="text-[10px] text-slate-400">Your healthy habits and advantages</p>
                </div>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                {healthPortrait.strengths.length} factors
              </span>
            </div>

            <div className="space-y-2.5">
              {healthPortrait.strengths.map((st, i) => (
                <div
                  key={`strength-item-${st.title}-${i}`}
                  className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/60 flex items-start space-x-3 transition-all hover:bg-emerald-50"
                >
                  <span className="text-xl shrink-0 mt-0.5">{st.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-emerald-950">{st.title}</h4>
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-lg shrink-0">
                        {st.impact}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-900/80 font-medium mt-1 leading-relaxed">
                      {st.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* C. WEAKNESSES & GROWTH POINTS */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Weaknesses and growth areas</h3>
                  <p className="text-[10px] text-slate-400">Areas where progress can be improved</p>
                </div>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                {healthPortrait.weaknesses.length} areas
              </span>
            </div>

            <div className="space-y-3">
              {healthPortrait.weaknesses.map((wk, i) => (
                <div
                  key={`weakness-item-${wk.title}-${i}`}
                  className="p-3.5 rounded-2xl bg-amber-50/40 border border-amber-200/70 space-y-2"
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-xl shrink-0 mt-0.5">{wk.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-black text-amber-950">{wk.title}</h4>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase shrink-0 ${
                          wk.severity === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {wk.severity === 'high' ? 'Important' : 'Attention'}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900/90 font-medium mt-0.5 leading-relaxed">
                        {wk.desc}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50 flex items-start space-x-2 text-[11px] text-slate-700 font-medium">
                    <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span><strong className="font-bold text-slate-900">Recommendation:</strong> {wk.recommendation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* D. 5 CORE PILLARS OF NUTRITION */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">5 key pillars of your diet</h3>
              <p className="text-[10px] text-slate-400">Actual average vs your personal target</p>
            </div>

            <div className="space-y-3 pt-1">
              {/* Pillar 1: Protein */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1.5">🥩 Protein balance</span>
                  <span className="text-emerald-700 font-black">{healthPortrait.avgProtein}g / {healthPortrait.targetProtein}g</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.round((healthPortrait.avgProtein / healthPortrait.targetProtein) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Pillar 2: Fats */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1.5">🥑 Healthy fats</span>
                  <span className="text-amber-700 font-black">{healthPortrait.avgFat}g / {healthPortrait.targetFat}g</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.round((healthPortrait.avgFat / healthPortrait.targetFat) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Pillar 3: Carbs */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1.5">🌾 Complex carbs</span>
                  <span className="text-indigo-700 font-black">{healthPortrait.avgCarbs}g / {healthPortrait.targetCarbs}g</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.round((healthPortrait.avgCarbs / healthPortrait.targetCarbs) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Pillar 4: Fiber */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1.5">🥦 Fiber</span>
                  <span className="text-teal-700 font-black">{healthPortrait.avgFiber}g / {healthPortrait.targetFiber}g</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-teal-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.round((healthPortrait.avgFiber / healthPortrait.targetFiber) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Pillar 5: Water */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1.5">💧 Clean water</span>
                  <span className="text-cyan-700 font-black">{healthPortrait.avgWater} ml / {healthPortrait.targetWater} ml</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.round((healthPortrait.avgWater / healthPortrait.targetWater) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD WEIGHT MODAL */}
      <AnimatePresence>
        {isAddWeightModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-white rounded-3xl p-5 text-slate-800 space-y-4 shadow-2xl overflow-y-auto max-h-[85vh] border border-slate-100"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-black text-slate-900">Log weight</h3>
                  <p className="text-[11px] text-slate-400">Saved to Firestore and the diary</p>
                </div>
                <button
                  onClick={() => setIsAddWeightModalOpen(false)}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Measurement date</label>
                <input
                  type="date"
                  value={newDateInput}
                  onChange={(e) => setNewDateInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold outline-none focus:ring-2 focus:ring-[#0AB68B]"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl text-center space-y-2.5">
                <label className="text-xs font-bold text-slate-400 block">Weight in kilograms</label>
                <div className="flex items-center justify-center space-x-2">
                  <input
                    type="number"
                    step="0.1"
                    value={newWeightInput}
                    onChange={(e) => setNewWeightInput(Number(e.target.value))}
                    className="text-4xl font-black text-[#0AB68B] text-center w-36 bg-transparent outline-none border-b-2 border-[#0AB68B]"
                  />
                  <span className="text-lg font-bold text-slate-400">kg</span>
                </div>

                {/* Quick adjustments */}
                <div className="flex justify-center items-center gap-1.5 pt-1">
                  {[-1.0, -0.5, -0.1, 0.1, 0.5, 1.0].map((step, sIdx) => (
                    <button
                      key={`weight-step-${step}-${sIdx}`}
                      type="button"
                      onClick={() => setNewWeightInput((prev) => +(prev + step).toFixed(1))}
                      className="px-2 py-1 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-extrabold text-[11px] rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                    >
                      {step > 0 ? `+${step}` : step}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveWeightEntry}
                disabled={isSyncing}
                className="w-full py-3.5 bg-[#0AB68B] text-white font-extrabold text-xs rounded-xl shadow-md hover:bg-[#08a27b] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isSyncing ? 'Syncing...' : 'Save measurement'}</span>
              </button>
            </motion.div>
          </div>
        )}

        {/* CO1 BADGE INFO MODAL */}
        {isCo1ModalOpen && (
          <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3.5 text-slate-800 shadow-2xl relative border border-slate-100"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 text-[#0AB68B] font-black text-xs flex items-center justify-center">
                    co1
                  </div>
                  <h3 className="font-black text-slate-900 text-sm">Activity cohort «co1»</h3>
                </div>
                <button
                  onClick={() => setIsCo1ModalOpen(false)}
                  className="p-1 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs leading-relaxed text-slate-600">
                <p>
                  <strong className="text-slate-900">co¹ (Cohort 1)</strong> — this is your personal badge for consistently keeping the diary.
                </p>
                <p>
                  Log your meals, water and weight every day to keep your leader status and build up your day streak!
                </p>
              </div>

              <button
                onClick={() => setIsCo1ModalOpen(false)}
                className="w-full py-2.5 bg-[#0AB68B] text-white font-extrabold text-xs rounded-xl hover:bg-[#08a27b] transition-colors cursor-pointer"
              >
                Got it!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
