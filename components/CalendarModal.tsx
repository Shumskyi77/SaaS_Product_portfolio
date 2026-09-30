import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, RotateCcw, Utensils, Flame, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getStoredMealLogs, getStoredProfile, getLocalDateString, parseLocalDateString } from '../lib/store';

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  onSelectDate,
}) => {
  if (!isOpen) return null;

  // Selected date as local Date object
  const initialDate = parseLocalDateString(selectedDate || getLocalDateString());
  
  // Active highlighted date in the calendar modal preview
  const [highlightedDate, setHighlightedDate] = useState<string>(selectedDate || getLocalDateString());

  // View month state (year & month index 0-11)
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const todayStr = getLocalDateString();
  const userProfile = getStoredProfile();
  const targetCals = userProfile?.targetCalories || 2000;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleGoToday = () => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setHighlightedDate(todayStr);
    onSelectDate(todayStr);
    onClose();
  };

  const handleConfirmDate = (dStr: string) => {
    onSelectDate(dStr);
    onClose();
  };

  // Generate days for grid
  const getDaysForMonth = () => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    
    let startingDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startingDayOfWeek === -1) startingDayOfWeek = 6;

    const totalDays = lastDayOfMonth.getDate();

    const days: { dayNumber: number; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Previous month padding days
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const pDay = prevMonthLastDay - i;
      const prevDate = new Date(viewYear, viewMonth - 1, pDay, 12);
      days.push({
        dayNumber: pDay,
        dateStr: getLocalDateString(prevDate),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(viewMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${viewYear}-${mStr}-${dStr}`;
      days.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
      });
    }

    // Next month padding days
    const remainingCells = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remainingCells; i++) {
      const nextDate = new Date(viewYear, viewMonth + 1, i, 12);
      days.push({
        dayNumber: i,
        dateStr: getLocalDateString(nextDate),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const daysGrid = getDaysForMonth();

  // Get details for currently highlighted date in modal
  const highlightedMeals = getStoredMealLogs(highlightedDate);
  const totalCals = highlightedMeals.reduce((acc, m) => acc + (m.calories || 0), 0);
  const totalProtein = highlightedMeals.reduce((acc, m) => acc + (m.protein || 0), 0);
  const totalFat = highlightedMeals.reduce((acc, m) => acc + (m.fat || 0), 0);
  const totalCarbs = highlightedMeals.reduce((acc, m) => acc + (m.carbs || 0), 0);

  const calorieDiff = targetCals - totalCals;

  const hDateObj = new Date(highlightedDate);
  const formattedHDate = hDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-4 sm:p-5 w-full max-w-md shadow-2xl border border-slate-100 space-y-3.5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto my-auto">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-2 text-slate-900 font-extrabold">
            <div className="w-8 h-8 rounded-xl bg-[#E6F9F5] text-[#0AB68B] flex items-center justify-center">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm sm:text-base block font-black leading-tight">Diary calendar</span>
              <span className="text-[10px] text-slate-400 font-normal">Select a day for a detailed view</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month Selector Header */}
        <div className="flex items-center justify-between bg-slate-50 p-2 rounded-2xl border border-slate-200/60">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-xl hover:bg-white text-slate-700 hover:text-[#0AB68B] transition-colors shadow-2xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <span className="font-extrabold text-xs sm:text-sm text-slate-900">
            {monthNames[viewMonth]} {viewYear}
          </span>

          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-xl hover:bg-white text-slate-700 hover:text-[#0AB68B] transition-colors shadow-2xs cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Week Days Header */}
        <div className="grid grid-cols-7 text-center text-[10px] sm:text-[11px] font-extrabold text-slate-400">
          {weekDays.map((wd) => (
            <div key={wd} className="py-1">{wd}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {daysGrid.map((item, idx) => {
            const isHighlighted = item.dateStr === highlightedDate;
            const isSelected = item.dateStr === selectedDate;
            const isToday = item.dateStr === todayStr;

            // Check if day has logs
            const dayMeals = getStoredMealLogs(item.dateStr);
            const dayCals = dayMeals.reduce((a, b) => a + (b.calories || 0), 0);
            const hasLogs = dayMeals.length > 0;

            return (
              <button
                key={idx}
                onClick={() => setHighlightedDate(item.dateStr)}
                onDoubleClick={() => handleConfirmDate(item.dateStr)}
                className={`py-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                  isHighlighted
                    ? 'bg-[#0AB68B] text-white shadow-md shadow-[#0AB68B]/30 font-black scale-105'
                    : isSelected
                    ? 'bg-[#E6F9F5] text-[#0AB68B] border-2 border-[#0AB68B] font-black'
                    : isToday
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 font-black'
                    : item.isCurrentMonth
                    ? 'text-slate-800 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>{item.dayNumber}</span>

                {/* Day status indicator */}
                {hasLogs && !isHighlighted && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${
                      dayCals > targetCals ? 'bg-rose-500' : 'bg-[#0AB68B]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Highlighted Day Detailed Preview Card */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-2.5">
          <div className="flex justify-between items-center text-xs font-extrabold text-slate-900 border-b border-slate-200 pb-2">
            <span className="capitalize">{formattedHDate}</span>
            <span className="text-[#0AB68B] font-black text-sm">{totalCals} / {targetCals} kcal</span>
          </div>

          {/* Status Message */}
          <div className="flex items-center space-x-2 text-xs font-bold">
            {totalCals === 0 ? (
              <span className="text-slate-400 font-medium">No logged entries for this day.</span>
            ) : calorieDiff > 100 ? (
              <div className="flex items-center space-x-1.5 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 w-full">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Short by <strong className="font-extrabold">{calorieDiff} kcal</strong> to reach your goal</span>
              </div>
            ) : calorieDiff < -100 ? (
              <div className="flex items-center space-x-1.5 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200 w-full">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span>Over by <strong className="font-extrabold">{Math.abs(calorieDiff)} kcal</strong></span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 w-full">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                <span>Perfectly within your goal!</span>
              </div>
            )}
          </div>

          {/* Macros Summary Grid */}
          {totalCals > 0 && (
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-extrabold text-center pt-1">
              <div className="bg-rose-50 text-rose-800 p-1.5 rounded-xl border border-rose-200/60">
                Protein: {totalProtein}g
              </div>
              <div className="bg-amber-50 text-amber-800 p-1.5 rounded-xl border border-amber-200/60">
                Fat: {totalFat}g
              </div>
              <div className="bg-teal-50 text-teal-800 p-1.5 rounded-xl border border-teal-200/60">
                Carbs: {totalCarbs}g
              </div>
            </div>
          )}

          {/* Eaten Dishes List */}
          {highlightedMeals.length > 0 && (
            <div className="space-y-1.5 pt-1 max-h-32 overflow-y-auto no-scrollbar">
              <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                Logged dishes ({highlightedMeals.length}):
              </span>
              <div className="space-y-1">
                {highlightedMeals.map((m, idx) => (
                  <div
                    key={`${m.id || 'meal'}-${idx}`}
                    className="flex items-center justify-between p-1.5 rounded-xl bg-white border border-slate-200/80 text-[10px] font-bold text-slate-700"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {m.imageUrl ? (
                        <img
                          src={m.imageUrl}
                          alt={m.title}
                          className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-200"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-[#E6F9F5] text-[#0AB68B] flex items-center justify-center shrink-0">
                          <Utensils className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className="truncate text-left">
                        <span className="block truncate font-extrabold text-slate-800">
                          {m.title || (m.items && m.items.length > 0 ? m.items[0].name : 'Meal')}
                        </span>
                        {m.portionGrams ? (
                          <span className="text-[9px] text-slate-400 font-semibold block">
                            {m.portionGrams} g
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="text-[#0AB68B] font-black shrink-0 ml-2">
                      +{m.calories} kcal
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => handleConfirmDate(highlightedDate)}
            className="w-full mt-2 py-2.5 bg-[#0AB68B] text-white font-black text-xs rounded-xl shadow-md shadow-[#0AB68B]/20 hover:bg-[#08a27b] transition-all cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <span>Open this day in the diary</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleGoToday}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-[#E6F9F5] text-slate-700 hover:text-[#0AB68B] text-xs font-extrabold transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Go to Today</span>
          </button>

          <span className="text-[10px] font-bold text-slate-400">
            Selected: {selectedDate}
          </span>
        </div>

      </div>
    </div>
  );
};
