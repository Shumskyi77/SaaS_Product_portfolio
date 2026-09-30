'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, X, Sparkles, Plus, Dumbbell, Activity, Check, Mic } from 'lucide-react';
import { WorkoutLog } from '../lib/store';
import { calculateWorkoutCaloriesWithAI } from '../lib/gemini';

interface WorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  userWeightKg: number;
  onSaveWorkout: (workout: WorkoutLog) => void;
}

export const WorkoutModal: React.FC<WorkoutModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  userWeightKg,
  onSaveWorkout,
}) => {
  const [workoutInput, setWorkoutInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedResult, setAnalyzedResult] = useState<{
    title: string;
    durationMinutes: number;
    caloriesBurned: number;
    summary: string;
  } | null>(null);

  if (!isOpen) return null;

  const quickTemplates = [
    'Running 30 minutes (10 km/h)',
    'Strength workout 45 minutes',
    'Pool swimming 30 minutes',
    'Brisk walking 45 minutes',
    'Cycling 40 minutes',
  ];

  const handleAnalyzeWorkout = async (queryToAnalyze?: string) => {
    const text = queryToAnalyze || workoutInput;
    if (!text.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      const res = await calculateWorkoutCaloriesWithAI(text, userWeightKg);
      setAnalyzedResult(res);
    } catch (err) {
      console.warn('Error analyzing workout:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmSave = () => {
    if (!analyzedResult) return;

    const newWorkout: WorkoutLog = {
      id: 'w_' + Date.now(),
      userId: 'u1',
      date: selectedDate,
      title: analyzedResult.title,
      durationMinutes: analyzedResult.durationMinutes,
      caloriesBurned: analyzedResult.caloriesBurned,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    onSaveWorkout(newWorkout);
    setWorkoutInput('');
    setAnalyzedResult(null);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md bg-white rounded-[32px] p-6 text-slate-800 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl"
        >
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Add workout</h3>
                <p className="text-xs text-slate-400 font-medium">AI calculation of burned calories</p>
              </div>
            </div>

            <button
              onClick={() => {
                setAnalyzedResult(null);
                onClose();
              }}
              className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!analyzedResult ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  Describe your workout or activity
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    placeholder="E.g.: 'I ran 35 minutes outside at 10 km/h' or '45-minute gym strength workout'"
                    value={workoutInput}
                    onChange={(e) => setWorkoutInput(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-[#0AB68B] outline-none transition-all resize-none"
                  />
                  <div className="absolute right-3 bottom-3 flex items-center space-x-1 text-slate-400 text-[10px] font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-[#0AB68B]" />
                    <span>AI Calculator</span>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-400 block mb-2">
                  Quick templates:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {quickTemplates.map((tpl, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setWorkoutInput(tpl);
                        handleAnalyzeWorkout(tpl);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-[#0AB68B] hover:border-[#0AB68B]/40 text-xs font-bold transition-all border border-slate-200/60 flex items-center space-x-1"
                    >
                      <Dumbbell className="w-3 h-3 text-slate-400" />
                      <span>{tpl}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleAnalyzeWorkout()}
                disabled={!workoutInput.trim() || isAnalyzing}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-amber-500/25 hover:opacity-95 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    <span>AI is calculating calories...</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4 fill-white" />
                    <span>Calculate burned kcal</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Result Card */
            <div className="space-y-4 pt-1">
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto shadow-md">
                  <Flame className="w-6 h-6 fill-white animate-bounce" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">{analyzedResult.title}</h4>
                  <p className="text-xs text-amber-800 font-bold mt-0.5">{analyzedResult.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-200/60 text-xs font-extrabold">
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                    <span className="text-[10px] text-slate-400 block font-normal">Duration</span>
                    <span className="text-slate-900 font-black">{analyzedResult.durationMinutes} min</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                    <span className="text-[10px] text-slate-400 block font-normal">Calories burned</span>
                    <span className="text-amber-600 font-black">+{analyzedResult.caloriesBurned} kcal</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-emerald-600 font-extrabold text-center bg-emerald-50 py-2 px-3 rounded-xl border border-emerald-100">
                ✨ Your daily calorie limit will automatically increase by +{analyzedResult.caloriesBurned} kcal!
              </p>

              <div className="flex space-x-2">
                <button
                  onClick={() => setAnalyzedResult(null)}
                  className="w-1/3 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={handleConfirmSave}
                  className="w-2/3 py-3 rounded-2xl bg-[#0AB68B] text-white font-extrabold text-xs shadow-md shadow-[#0AB68B]/30 hover:bg-[#089e78] transition-colors flex items-center justify-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save to diary</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
