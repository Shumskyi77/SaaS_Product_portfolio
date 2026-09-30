import React, { useState, useEffect } from 'react';
import { OnboardingFlow } from '../components/OnboardingFlow';
import { WelcomeScreen } from '../components/WelcomeScreen';
import { AppShell } from '../components/AppShell';
import { Dashboard } from '../components/Dashboard';
import { AICameraScanner } from '../components/AICameraScanner';
import { FoodSearchModal } from '../components/FoodSearchModal';
import { AICoachChat } from '../components/AICoachChat';
import { RecipesPage } from '../components/RecipesPage';
import { ProgressPage } from '../components/ProgressPage';
import { ProfileModal } from '../components/ProfileModal';
import { WorkoutModal } from '../components/WorkoutModal';
import { TamagotchiModal } from '../components/TamagotchiModal';
import { TamagotchiPlayModal } from '../components/TamagotchiPlayModal';
import { UserProfile } from '../types/user';
import { MealLog, MealType } from '../types/meal';
import { TamagotchiState } from '../types/tamagotchi';
import { DesktopShell } from '../components/DesktopShell';
import { AiLimitPopup } from '../components/AiLimitPopup';
import { hasDishQuota, consumeDish } from '../lib/dishQuota';
import {
  getStoredProfile,
  saveStoredProfile,
  getStoredMealLogs,
  getAllStoredMealLogs,
  saveMealLog,
  saveMealLogsBulk,
  deleteMealLog,
  getStoredWater,
  getStoredWorkoutLogs,
  saveWorkoutLog,
  deleteWorkoutLog,
  clearAllUserData,
  WorkoutLog,
  getStoredTamagotchi,
  saveStoredTamagotchi,
  calculateStreakFromMealLogs,
  getLocalDateString,
} from '../lib/store';

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  // Guest-only mode: no sign-in, no cloud. 'welcome' -> 'onboarding' -> 'app'.
  const [appState, setAppState] = useState<'welcome' | 'onboarding' | 'app'>('welcome');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'camera' | 'chat' | 'progress'>('dashboard');

  // Selected Date (using timezone-safe local date string YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateString());

  // Active Meal Logs, Water, and Workout Logs for selected date
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [waterAmount, setWaterAmount] = useState<number>(0);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchMealType, setSearchMealType] = useState<MealType>('breakfast');
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isWorkoutOpen, setIsWorkoutOpen] = useState<boolean>(false);
  const [isTamagotchiOpen, setIsTamagotchiOpen] = useState<boolean>(false);
  const [isPlayModalOpen, setIsPlayModalOpen] = useState<boolean>(false);

  // Demo limit: just one dish in total, any method
  const [isDishLimitOpen, setIsDishLimitOpen] = useState<boolean>(false);

  // Tamagotchi State
  const [tamagotchi, setTamagotchi] = useState<TamagotchiState | null>(() => getStoredTamagotchi());

  // Save tamagotchi changes to localStorage automatically
  const handleUpdateTamagotchi = (newPet: TamagotchiState | null) => {
    setTamagotchi(newPet);
    saveStoredTamagotchi(newPet);
  };

  // Guest-only startup: no accounts, no cloud — everything lives in localStorage.
  // If a local profile exists -> straight into the app, otherwise -> welcome.
  useEffect(() => {
    try {
      const localProfile = getStoredProfile();
      if (localProfile) {
        const friendCode =
          localProfile.friendCode ||
          `NM-${(localProfile.uid || 'USER').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;
        const enrichedProfile = { ...localProfile, friendCode };
        setUserProfile(enrichedProfile);
        const currentLogs = getStoredMealLogs(selectedDate);
        setMealLogs(currentLogs);
        const w = getStoredWater(selectedDate);
        setWaterAmount(w);
        const workouts = getStoredWorkoutLogs(selectedDate);
        setWorkoutLogs(workouts);
        setAppState('app');
      } else {
        setUserProfile(null);
        setMealLogs([]);
        setWaterAmount(0);
        setWorkoutLogs([]);
        setAppState('welcome');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);


  // Sync Meal, Workout, and Weight Logs when date or profile changes
  useEffect(() => {
    if (selectedDate && userProfile) {
      const logs = getStoredMealLogs(selectedDate);
      setMealLogs(logs);
      const w = getStoredWater(selectedDate);
      setWaterAmount(w);
      const workouts = getStoredWorkoutLogs(selectedDate);
      setWorkoutLogs(workouts);
    }
  }, [selectedDate, userProfile?.uid]);

  const handleStartOnboarding = () => {
    setAppState('onboarding');
  };

  const handleCompleteOnboarding = (profile: UserProfile) => {
    const cleanUid = (profile.uid || 'user').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const friendCode = profile.friendCode || `NM-${cleanUid.length >= 6 ? cleanUid.slice(0, 6) : (cleanUid + 'ABCDEF').slice(0, 6)}`;
    const fullProfile = { ...profile, friendCode };
    setUserProfile(fullProfile);
    saveStoredProfile(fullProfile);
    setAppState('app');
    // Load logs for today (starts clean at 0 calories)
    const todayStr = getLocalDateString();
    const logs = getStoredMealLogs(todayStr);
    setMealLogs(logs);
    const workouts = getStoredWorkoutLogs(todayStr);
    setWorkoutLogs(workouts);
  };

  const handleSaveMeal = (meal: MealLog) => {
    const mealWithUser: MealLog = {
      ...meal,
      userId: userProfile?.uid || meal.userId || 'u1',
      date: meal.date || selectedDate,
    };
    // Demo limit: just one dish in total, any method (photo, voice, text,
    // database, barcode). Updating an already-saved dish is always allowed.
    const alreadyExists = getAllStoredMealLogs().some((m) => m.id === mealWithUser.id);
    if (!alreadyExists) {
      if (!hasDishQuota()) {
        setIsDishLimitOpen(true);
        return;
      }
      consumeDish();
    }
    const updated = saveMealLog(mealWithUser);
    if (mealWithUser.date === selectedDate) {
      setMealLogs(updated);
    }

    // Immediately recalculate streak from real meals
    const allLocal = getAllStoredMealLogs();
    const mealDates = allLocal.map((m) => m.date).filter(Boolean);
    const newStreak = calculateStreakFromMealLogs(mealDates);
    if (userProfile && userProfile.streakDays !== newStreak) {
      const updatedProfile = { ...userProfile, streakDays: newStreak };
      setUserProfile(updatedProfile);
      saveStoredProfile(updatedProfile);
    }
  };

  const handleSaveMultipleMeals = (meals: MealLog[]) => {
    const enriched = meals.map((m) => ({
      ...m,
      userId: userProfile?.uid || m.userId || 'u1',
      date: m.date || selectedDate,
    }));
    // Demo limit: count only genuinely new dishes, updates do not count.
    const existingIds = new Set(getAllStoredMealLogs().map((m) => m.id));
    const newCount = enriched.filter((m) => !existingIds.has(m.id)).length;
    if (newCount > 0) {
      if (!hasDishQuota()) {
        setIsDishLimitOpen(true);
        return;
      }
      for (let i = 0; i < newCount; i++) consumeDish();
    }
    const updated = saveMealLogsBulk(enriched, selectedDate);
    setMealLogs(updated);

    const allLocal = getAllStoredMealLogs();
    const mealDates = allLocal.map((m) => m.date).filter(Boolean);
    const newStreak = calculateStreakFromMealLogs(mealDates);
    if (userProfile && userProfile.streakDays !== newStreak) {
      const updatedProfile = { ...userProfile, streakDays: newStreak };
      setUserProfile(updatedProfile);
      saveStoredProfile(updatedProfile);
    }
  };

  const handleUpdateMeal = (updatedMeal: MealLog) => {
    handleSaveMeal(updatedMeal);
  };

  const handleDeleteMeal = (mealId: string) => {
    const updated = deleteMealLog(mealId, selectedDate);
    setMealLogs(updated);

    const allLocal = getAllStoredMealLogs();
    const mealDates = allLocal.map((m) => m.date).filter(Boolean);
    const newStreak = calculateStreakFromMealLogs(mealDates);
    if (userProfile && userProfile.streakDays !== newStreak) {
      const updatedProfile = { ...userProfile, streakDays: newStreak };
      setUserProfile(updatedProfile);
      saveStoredProfile(updatedProfile);
    }
  };

  const handleSaveWorkout = (workout: WorkoutLog) => {
    const workoutWithUser = { ...workout, userId: userProfile?.uid || workout.userId || 'u1' };
    const updated = saveWorkoutLog(workoutWithUser);
    setWorkoutLogs(updated);
  };

  const handleDeleteWorkout = (workoutId: string) => {
    const updated = deleteWorkoutLog(workoutId, selectedDate);
    setWorkoutLogs(updated);
  };

  const handleOpenSearch = (mealType: MealType) => {
    setSearchMealType(mealType);
    setIsSearchOpen(true);
  };

  const handleResetOnboarding = () => {
    setIsProfileOpen(false);
    setAppState('onboarding');
  };

  // Guest-only: "logout" just resets the local profile back to the welcome screen.
  const handleLogout = () => {
    setIsProfileOpen(false);
    clearAllUserData();
    setUserProfile(null);
    setAppState('welcome');
  };

  if (isLoading) {
    return (
      <DesktopShell>
      <div className="h-full w-full bg-[#FAF8F5] flex items-center justify-center text-[#00C29A] font-bold font-sans">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-[#E6F9F5] border-t-[#00C29A] animate-spin" />
          <span className="text-slate-800 font-black text-sm">Loading Foodvisor...</span>
        </div>
      </div>
      </DesktopShell>
    );
  }

  if (appState === 'welcome') {
    return <WelcomeScreen onStartOnboarding={handleStartOnboarding} />;
  }

  if (appState === 'onboarding' || !userProfile) {
    return <OnboardingFlow onComplete={handleCompleteOnboarding} />;
  }

  const todayCaloriesEaten = mealLogs.reduce((acc, m) => acc + m.calories, 0);

  return (
    <AppShell
      userProfile={userProfile}
      mealLogs={mealLogs}
      tamagotchi={tamagotchi}
      onOpenTamagotchi={() => setIsTamagotchiOpen(true)}
      onOpenProfile={() => setIsProfileOpen(true)}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onOpenScanner={() => setIsScannerOpen(true)}
    >
      {/* Tab Screen Renderer */}
      {activeTab === 'dashboard' && (
        <Dashboard
          userProfile={userProfile}
          mealLogs={mealLogs}
          workoutLogs={workoutLogs}
          waterAmount={waterAmount}
          setWaterAmount={setWaterAmount}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onOpenScanner={() => setIsScannerOpen(true)}
          onOpenSearch={handleOpenSearch}
          onDeleteMeal={handleDeleteMeal}
          onUpdateMeal={handleUpdateMeal}
          onOpenWorkoutModal={() => setIsWorkoutOpen(true)}
          onDeleteWorkout={handleDeleteWorkout}
          tamagotchi={tamagotchi}
          setTamagotchi={handleUpdateTamagotchi}
          onOpenTamagotchiModal={() => setIsTamagotchiOpen(true)}
          onOpenPlayModal={() => setIsPlayModalOpen(true)}
        />
      )}

      {activeTab === 'chat' && (
        <AICoachChat
          userProfile={userProfile}
          mealLogs={mealLogs}
          workoutLogs={workoutLogs}
          selectedDate={selectedDate}
          onAddWorkout={handleSaveWorkout}
          waterAmount={waterAmount}
        />
      )}

      {activeTab === 'progress' && (
        <ProgressPage
          userProfile={userProfile}
          onOpenProfile={() => setIsProfileOpen(true)}
          onUpdateWeight={(newW: number) => {
            const updated = { ...userProfile, currentWeight: newW };
            setUserProfile(updated);
            saveStoredProfile(updated);
          }}
        />
      )}

      {/* Tamagotchi Modal */}
      <TamagotchiModal
        isOpen={isTamagotchiOpen}
        onClose={() => setIsTamagotchiOpen(false)}
        tamagotchi={tamagotchi}
        setTamagotchi={handleUpdateTamagotchi}
        userTargetCalories={userProfile.targetCalories}
        todayCaloriesEaten={todayCaloriesEaten}
        todayWorkoutsCount={workoutLogs.length}
        mealLogs={mealLogs}
        onOpenScanner={() => {
          setIsTamagotchiOpen(false);
          setIsScannerOpen(true);
        }}
      />

      {/* Tamagotchi Interactive Play Modal */}
      <TamagotchiPlayModal
        isOpen={isPlayModalOpen}
        onClose={() => setIsPlayModalOpen(false)}
        tamagotchi={tamagotchi}
        setTamagotchi={handleUpdateTamagotchi}
      />

      {/* Workout Modal */}
      <WorkoutModal
        isOpen={isWorkoutOpen}
        onClose={() => setIsWorkoutOpen(false)}
        selectedDate={selectedDate}
        userWeightKg={userProfile.currentWeight || 70}
        onSaveWorkout={handleSaveWorkout}
      />

      {/* AI Camera Food Scanner Modal */}
      <AICameraScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onSaveMeal={handleSaveMeal}
        onSaveMultipleMeals={handleSaveMultipleMeals}
        targetDate={selectedDate}
      />

      {/* Food Search & Barcode Modal */}
      <FoodSearchModal
        isOpen={isSearchOpen}
        mealType={searchMealType}
        onClose={() => setIsSearchOpen(false)}
        onAddMeal={handleSaveMeal}
        targetDate={selectedDate}
      />

      {/* Profile Settings Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userProfile={userProfile}
        onProfileUpdate={(p: UserProfile) => setUserProfile(p)}
        onResetOnboarding={handleResetOnboarding}
        onLogout={handleLogout}
      />

      {/* Demo limit: no more dishes can be added */}
      <AiLimitPopup
        isOpen={isDishLimitOpen}
        onClose={() => setIsDishLimitOpen(false)}
      />
    </AppShell>
  );
}
