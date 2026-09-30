'use client';

import React from 'react';
import { User, Sparkles, Calendar, ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { UserProfile } from '../types/user';

interface MobileShellProps {
  children: React.ReactNode;
  userProfile: UserProfile;
  onOpenProfile: () => void;
  selectedDate: string; // YYYY-MM-DD
  setSelectedDate: (date: string) => void;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  userProfile,
  onOpenProfile,
  selectedDate,
  setSelectedDate,
}) => {
  // Date navigation helpers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const formatDateLabel = (dateStr: string) => {
    if (isToday) return 'Today';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-0 md:p-6 font-sans">
      {/* Mobile Container Frame */}
      <div className="w-full max-w-md bg-slate-50 min-h-screen md:min-h-[844px] md:max-h-[880px] md:rounded-[44px] shadow-2xl border border-slate-200/80 flex flex-col relative overflow-hidden">
        {/* Top App Header Bar */}
        <header className="px-5 pt-4 pb-3 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#00C29A] text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-sm tracking-tight leading-none">
                Foodvisor
              </h1>
              <span className="text-[10px] font-bold text-[#00C29A]">
                AI Nutrition Diary
              </span>
            </div>
          </div>

          {/* Date Selector Strip */}
          <div className="flex items-center bg-slate-100/80 px-2 py-1 rounded-xl text-xs font-extrabold text-slate-700 space-x-1">
            <button onClick={handlePrevDay} className="p-0.5 hover:text-[#00C29A] transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[60px] text-center">{formatDateLabel(selectedDate)}</span>
            <button onClick={handleNextDay} className="p-0.5 hover:text-[#00C29A] transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Profile Button */}
          <button
            onClick={onOpenProfile}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold hover:bg-slate-200 transition-colors border border-slate-200/60 overflow-hidden shadow-2xs cursor-pointer"
            title="Profile"
          >
            {(userProfile.avatar || userProfile.avatarUrl) ? (
              <img
                src={userProfile.avatar || userProfile.avatarUrl}
                alt={userProfile.name || 'Profile'}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : userProfile.name ? (
              userProfile.name.charAt(0).toUpperCase()
            ) : (
              <User className="w-4 h-4" />
            )}
          </button>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-24 no-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
};
