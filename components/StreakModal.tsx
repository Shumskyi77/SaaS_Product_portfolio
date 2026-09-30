'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, X, Check, Award, Calendar, Sparkles, Trophy, Zap, AlertCircle } from 'lucide-react';
import { StreakInfo } from '../lib/streakEngine';

interface StreakModalProps {
  isOpen: boolean;
  onClose: () => void;
  streakInfo: StreakInfo;
  onOpenScanner?: () => void;
}

export const StreakModal: React.FC<StreakModalProps> = ({
  isOpen,
  onClose,
  streakInfo,
  onOpenScanner,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl w-full max-w-sm sm:max-w-md max-h-[90vh] overflow-hidden shadow-2xl border border-amber-100 flex flex-col my-auto"
        >
          {/* Header Banner with Animated Flame */}
          <div className="relative bg-gradient-to-b from-amber-500 via-orange-500 to-amber-600 px-4 py-4 sm:px-5 sm:py-5 text-white text-center overflow-hidden shrink-0">
            {/* Background Glow Circles */}
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-yellow-300/30 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-orange-600/40 rounded-full blur-2xl pointer-events-none" />

            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors cursor-pointer z-10"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Pulsating Flame Badge */}
            <div className="relative mx-auto w-16 h-16 sm:w-20 sm:h-20 mb-2 flex items-center justify-center">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [-2, 2, -2],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-yellow-300 via-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/40"
              >
                <Flame className="w-8 h-8 sm:w-10 sm:h-10 text-white fill-white drop-shadow-md" />
              </motion.div>
              <Sparkles className="w-4 h-4 text-yellow-200 absolute -top-0.5 right-1 animate-pulse" />
              <Zap className="w-3.5 h-3.5 text-yellow-100 absolute bottom-0.5 left-1 animate-bounce" />
            </div>

            <div className="space-y-0.5">
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-black uppercase tracking-wider">
                <Flame className="w-3 h-3 fill-yellow-300 text-yellow-300" />
                <span>Activity streak</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                {streakInfo.currentStreak}{' '}
                <span className="text-lg sm:text-xl font-extrabold text-amber-100">
                  {streakInfo.currentStreak === 1 ? 'day' : streakInfo.currentStreak < 5 ? 'days' : 'days'}
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-amber-100 font-semibold max-w-xs mx-auto">
                {streakInfo.streakStatusMessage}
              </p>
            </div>
          </div>

          {/* Modal Scrollable Content */}
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            {/* Weekly Days Tracker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-slate-500 uppercase tracking-wider text-[10px] sm:text-xs">
                  Current week:
                </span>
                <span className="font-bold text-amber-600 text-[11px] sm:text-xs">
                  {streakInfo.isLoggedToday ? 'Logged today ✅' : 'Still to log today'}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-1.5 bg-slate-50 p-2 sm:p-2.5 rounded-2xl border border-slate-200/80">
                {streakInfo.weeklyDays.map((d, i) => (
                  <div
                    key={i}
                    className={`flex flex-col items-center p-1 sm:p-1.5 rounded-xl text-center transition-all ${
                      d.isToday
                        ? 'bg-amber-100/80 border-2 border-amber-400 shadow-2xs'
                        : d.isLogged
                        ? 'bg-emerald-50 border border-emerald-200'
                        : 'bg-white border border-slate-200/60'
                    }`}
                  >
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">{d.dayLabel}</span>
                    <span className="text-[11px] sm:text-xs font-black text-slate-700 my-0.5">{d.dayNumber}</span>
                    <div className="h-4 sm:h-5 flex items-center justify-center">
                      {d.isLogged ? (
                        <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
                      ) : d.isToday ? (
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      ) : d.isFuture ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Streak Milestone Progress */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold">
                <div className="flex items-center space-x-1.5 text-amber-900 text-[11px] sm:text-xs">
                  <Trophy className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Next goal: {streakInfo.nextMilestone} days</span>
                </div>
                <span className="text-amber-700 text-[11px] sm:text-xs">{streakInfo.milestoneProgressPercent}%</span>
              </div>
              <div className="h-2 w-full bg-amber-200/60 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${streakInfo.milestoneProgressPercent}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                />
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200 text-center">
                <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Best streak
                </span>
                <div className="flex items-center justify-center space-x-1 text-slate-800 font-black text-base sm:text-lg mt-0.5">
                  <Award className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>{streakInfo.longestStreak} d.</span>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200 text-center">
                <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Total logged days
                </span>
                <div className="flex items-center justify-center space-x-1 text-slate-800 font-black text-base sm:text-lg mt-0.5">
                  <Calendar className="w-4 h-4 text-[#0AB68B] shrink-0" />
                  <span>{streakInfo.totalLoggedDays} d.</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1 pb-1">
              {!streakInfo.isLoggedToday && onOpenScanner && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenScanner();
                  }}
                  className="w-full py-3 sm:py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-orange-500/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Flame className="w-4 h-4 fill-white" />
                  <span>Log food and ignite your streak</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 sm:py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-2xl transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
