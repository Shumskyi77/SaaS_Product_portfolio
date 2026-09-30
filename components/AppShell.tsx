'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flame,
  Home,
  BookOpen,
  MessageSquare,
  TrendingUp,
  Camera,
  Sparkles,
} from 'lucide-react';
import { UserProfile } from '../types/user';
import { TamagotchiState } from '../types/tamagotchi';
import { TamagotchiAvatar } from './TamagotchiAvatar';
import { CalendarModal } from './CalendarModal';
import { StreakModal } from './StreakModal';
import { DesktopShell } from './DesktopShell';
import { calculateUserStreak, StreakInfo } from '../lib/streakEngine';
import { getLocalDateString, parseLocalDateString } from '../lib/store';
import { MealLog } from '../types/meal';

interface AppShellProps {
  children: React.ReactNode;
  userProfile: UserProfile;
  tamagotchi?: TamagotchiState | null;
  onOpenTamagotchi?: () => void;
  onOpenProfile: () => void;
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
  // Guest-only build: no 'friends' tab (social needs accounts/cloud).
  activeTab: 'dashboard' | 'camera' | 'chat' | 'progress';
  setActiveTab: (tab: 'dashboard' | 'camera' | 'chat' | 'progress') => void;
  onOpenScanner: () => void;
  mealLogs?: MealLog[];
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  userProfile,
  tamagotchi,
  onOpenTamagotchi,
  onOpenProfile,
  selectedDate,
  setSelectedDate,
  activeTab,
  setActiveTab,
  onOpenScanner,
  mealLogs,
}) => {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isStreakModalOpen, setIsStreakModalOpen] = useState(false);
  const [streakData, setStreakData] = useState<StreakInfo>(() =>
    calculateUserStreak()
  );

  // Recalculate streak whenever selectedDate, activeTab, userProfile, or mealLogs changes
  useEffect(() => {
    const info = calculateUserStreak();
    setStreakData(info);
  }, [selectedDate, activeTab, userProfile?.streakDays, mealLogs]);

  // Date navigation helpers (safe against UTC timezone shifting)
  const handlePrevDay = () => {
    const d = parseLocalDateString(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(getLocalDateString(d));
  };

  const handleNextDay = () => {
    const d = parseLocalDateString(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(getLocalDateString(d));
  };

  const todayStr = getLocalDateString();
  const isToday = selectedDate === todayStr;

  const formatDateLabel = (dateStr: string) => {
    if (dateStr === todayStr) return 'Today';
    const d = parseLocalDateString(dateStr);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Diary';
      case 'progress':
        return 'Analytics';
      case 'chat':
        return 'AI Coach';
      default:
        return 'Diary';
    }
  };

  return (
    <DesktopShell>
      {/* Phone content: header + feed + bottom tab bar */}
      <div className="flex h-full w-full flex-col relative overflow-hidden bg-[#FAF8F5] text-slate-800">
        
        {/* Top Header Bar */}
        <header
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
          }}
          className="flex-shrink-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-2.5 pt-2.5 pb-2.5 flex items-center justify-between gap-1 w-full"
        >
          {/* Active Tab Brand/Title */}
          <div
            className="flex items-center space-x-1.5 cursor-pointer shrink-0"
            onClick={() => setActiveTab('dashboard')}
            title="Home"
          >
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#0AB68B] to-emerald-400 flex items-center justify-center text-white shadow-2xs shrink-0">
              <Sparkles className="w-4 h-4 fill-white/20" />
            </div>
            <h1 className="font-extrabold text-slate-900 text-xs tracking-tight hidden">
              {getHeaderTitle()}
            </h1>
          </div>

          {/* Date Selector (Centered, sleek & compact) */}
          <div className="flex items-center bg-slate-100/90 px-1 py-0.5 rounded-xl text-xs font-bold text-slate-700 space-x-0.5 border border-slate-200/70 shadow-2xs shrink-0">
            <button
              onClick={handlePrevDay}
              className="p-1 hover:text-[#0AB68B] transition-colors rounded-lg hover:bg-white cursor-pointer"
              title="Previous day"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsCalendarOpen(true)}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-lg hover:bg-white text-slate-800 hover:text-[#0AB68B] transition-all cursor-pointer"
              title="Open calendar"
            >
              <Calendar className="w-3.5 h-3.5 text-[#0AB68B] shrink-0" />
              <span className="font-extrabold text-[11px] whitespace-nowrap">
                {formatDateLabel(selectedDate)}
              </span>
            </button>

            <button
              onClick={handleNextDay}
              className="p-1 hover:text-[#0AB68B] transition-colors rounded-lg hover:bg-white cursor-pointer"
              title="Next day"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right Header Actions: Tamagotchi, Friends, Streak & Profile */}
          <div className="flex items-center space-x-1 shrink-0">
            {/* Tamagotchi Header Button */}
            {onOpenTamagotchi && (
              <button
                id="header-tamagotchi-btn"
                onClick={onOpenTamagotchi}
                className={`flex items-center space-x-1 px-2 h-7 rounded-xl font-black text-xs transition-all border shadow-2xs shrink-0 cursor-pointer ${
                  tamagotchi?.isAlive
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 animate-pulse'
                }`}
                title={tamagotchi?.isAlive ? `Tamagotchi: ${tamagotchi.name}` : 'Get a Tamagotchi 🐾'}
              >
                {tamagotchi?.isAlive ? (
                  <>
                    <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                      <TamagotchiAvatar
                        breed={tamagotchi.breed}
                        mood="happy"
                        alt={tamagotchi.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="hidden text-[11px] font-extrabold max-w-[54px] truncate">
                      {tamagotchi.name}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs shrink-0">🐾</span>
                    <span className="text-[10px] font-extrabold text-amber-700 hidden">
                      Pet
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Streak Flame Button (Fixed & Interactive) */}
            <button
              id="streak-header-btn"
              onClick={() => setIsStreakModalOpen(true)}
              className={`flex items-center space-x-1 px-2 h-7 rounded-xl text-xs font-black transition-all border shadow-2xs shrink-0 cursor-pointer ${
                streakData.isLoggedToday
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-400 shadow-amber-500/25 animate-pulse'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200/90'
              }`}
              title="Nutrition streak (tap for details)"
            >
              <Flame
                className={`w-3.5 h-3.5 shrink-0 ${
                  streakData.isLoggedToday
                    ? 'text-white fill-white'
                    : 'text-amber-500 fill-amber-500'
                }`}
              />
              <span className="text-[11px] font-black">
                {streakData.currentStreak}d
              </span>
            </button>

            {/* Profile Avatar Button */}
            <button
              onClick={onOpenProfile}
              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-[#0AB68B] flex items-center justify-center font-bold text-xs transition-colors border border-slate-200/80 shadow-2xs shrink-0 cursor-pointer overflow-hidden"
              title="Profile & settings"
            >
              {(userProfile.avatar || (userProfile as any).avatarUrl) ? (
                <img
                  src={userProfile.avatar || (userProfile as any).avatarUrl}
                  alt={userProfile.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : userProfile.name ? (
                userProfile.name.charAt(0).toUpperCase()
              ) : (
                <User className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>
          </div>
        </header>

        {/* Main Scrollable View Area */}
        <main className="flex-1 overflow-y-auto overscroll-contain p-4 pb-28">
          {children}
        </main>

        {/* Floating Bottom Tab Bar */}
        <nav
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          }}
          className="absolute bottom-0 inset-x-0 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-2 pt-2 shadow-lg z-40"
        >
          <div className="flex items-center justify-between relative max-w-sm mx-auto">
            {/* 1. Dashboard Tab */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col items-center justify-center py-1 flex-1 text-[10px] font-extrabold transition-all cursor-pointer ${
                activeTab === 'dashboard' ? 'text-[#0AB68B]' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <Home className="w-5 h-5 mb-0.5" />
              <span>Diary</span>
            </button>

            {/* 2. Central AI Camera Action Button */}
            <div className="relative -top-5 flex flex-col items-center flex-1">
              <button
                id="central-camera-scanner-btn"
                onClick={onOpenScanner}
                className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#0AB68B] to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-[#0AB68B]/40 hover:scale-105 active:scale-95 transition-all cursor-pointer ring-4 ring-[#FAF8F5]"
                title="Scan a dish with camera or barcode"
              >
                <Camera className="w-6 h-6" />
              </button>
              <span className="text-[10px] font-black text-slate-800 mt-1">Scanner</span>
            </div>

            {/* 4. AI Coach / Chat Tab */}
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex flex-col items-center justify-center py-1 flex-1 text-[10px] font-extrabold transition-all cursor-pointer ${
                activeTab === 'chat' ? 'text-[#0AB68B]' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <MessageSquare className="w-5 h-5 mb-0.5" />
              <span>AI Coach</span>
            </button>

            {/* 5. Analytics Tab */}
            <button
              onClick={() => setActiveTab('progress')}
              className={`flex flex-col items-center justify-center py-1 flex-1 text-[10px] font-extrabold transition-all cursor-pointer ${
                activeTab === 'progress' ? 'text-[#0AB68B]' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <TrendingUp className="w-5 h-5 mb-0.5" />
              <span>Analytics</span>
            </button>
          </div>
        </nav>

        {/* Global Calendar Modal */}
        <CalendarModal
          isOpen={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          selectedDate={selectedDate}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setIsCalendarOpen(false);
          }}
        />

        {/* Interactive Streak Details & Milestones Modal */}
        <StreakModal
          isOpen={isStreakModalOpen}
          onClose={() => setIsStreakModalOpen(false)}
          streakInfo={streakData}
          onOpenScanner={() => {
            setIsStreakModalOpen(false);
            onOpenScanner();
          }}
        />
      </div>
    </DesktopShell>
  );
};
