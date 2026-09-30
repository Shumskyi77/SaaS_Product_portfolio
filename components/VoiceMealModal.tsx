'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getLocalDateString } from '../lib/store';
import { hasDishQuota } from '../lib/dishQuota';
import { AiLimitPopup } from './AiLimitPopup';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Sparkles,
  X,
  Check,
  Flame,
  Egg,
  Wheat,
  Leaf,
  Plus,
  Trash2,
  Coffee,
  Sun,
  Moon,
  Cookie,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sliders,
  Scale,
  Volume2,
} from 'lucide-react';
import { MealLog, MealType } from '../types/meal';
import { parseVoiceMealsWithAI } from '../lib/gemini';

interface ParsedVoiceDish {
  id: string;
  title: string;
  mealType: MealType;
  portionGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  ingredients: string[];
  aiComment?: string;
  selected: boolean;
}

interface VoiceMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveMeals: (meals: MealLog[]) => void;
  defaultMealType?: MealType;
  targetDate?: string;
}

export const VoiceMealModal: React.FC<VoiceMealModalProps> = ({
  isOpen,
  onClose,
  onSaveMeals,
  defaultMealType = 'lunch',
  targetDate,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedDishes, setParsedDishes] = useState<ParsedVoiceDish[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccessSaved, setIsSuccessSaved] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isAiLimitOpen, setIsAiLimitOpen] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      stopRecording();
      setTranscript('');
      setInterimTranscript('');
      setParsedDishes([]);
      setErrorMessage(null);
      setIsAnalyzing(false);
      setIsSuccessSaved(false);
      setIsAiLimitOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    setErrorMessage(null);
    setTranscript('');
    setInterimTranscript('');
    setParsedDishes([]);

    // 1. Initialize Speech Recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage(
        'Voice input is not supported in this browser. You can enter dish text manually.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let finalStr = '';
        let interimStr = '';
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalStr += res[0].transcript + ' ';
          } else {
            interimStr += res[0].transcript;
          }
        }
        if (finalStr) {
          setTranscript((prev) => (prev ? `${prev} ${finalStr}`.trim() : finalStr.trim()));
        }
        setInterimTranscript(interimStr);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition event error:', event.error);
        if (event.error !== 'no-speech') {
          setErrorMessage(`Voice recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (isHoldingRef.current) {
          try {
            recognition.start();
          } catch (e) {}
        } else {
          setIsRecording(false);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

      // 2. Audio Level Visualizer
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyserRef.current = analyser;
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          const updateVolume = () => {
            if (!analyserRef.current) return;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round(avg * 1.5)));
            animationFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch (audioErr) {
        console.warn('Audio analyser visualizer access error:', audioErr);
      }
    } catch (err: any) {
      setErrorMessage('Could not start the microphone. Check browser permissions.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    isHoldingRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
  };

  const handleHoldStart = () => {
    isHoldingRef.current = true;
    startRecording();
  };

  const handleHoldEnd = () => {
    isHoldingRef.current = false;
    stopRecording();
    // If transcript collected, auto-analyze after slight pause
    setTimeout(() => {
      const fullText = (transcript + ' ' + interimTranscript).trim();
      if (fullText.length > 2) {
        handleAnalyzeSpeech(fullText);
      }
    }, 400);
  };

  const handleToggleClickRecord = () => {
    if (isRecording) {
      stopRecording();
      const fullText = (transcript + ' ' + interimTranscript).trim();
      if (fullText.length > 2) {
        handleAnalyzeSpeech(fullText);
      }
    } else {
      startRecording();
    }
  };

  const handleAnalyzeSpeech = async (customText?: string) => {
    const textToAnalyze = customText || (transcript + ' ' + interimTranscript).trim();
    if (!textToAnalyze || textToAnalyze.length < 2) {
      setErrorMessage('Please say or write what you ate.');
      return;
    }

    // Demo limit: a new parse only with free quota.
    // Re-parsing already received dishes is always allowed.
    // Quota is consumed in App.handleSaveMultipleMeals on save.
    const isRefinement = parsedDishes.length > 0;
    if (!isRefinement && !hasDishQuota()) {
      setIsAiLimitOpen(true);
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      // Goes direct Gemini REST from the browser first, then the server endpoint,
      // then a local estimate — so voice logging works on a static host too.
      const data = await parseVoiceMealsWithAI(textToAnalyze, defaultMealType);

      if (data && Array.isArray(data.dishes) && data.dishes.length > 0) {
        const mapped: ParsedVoiceDish[] = data.dishes.map((d: any, idx: number) => ({
          id: `voice_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          title: d.title || 'Dish',
          mealType: (d.mealType as MealType) || defaultMealType,
          portionGrams: Number(d.portionGrams) || 150,
          calories: Number(d.calories) || 200,
          protein: Number(d.protein) || 10,
          fat: Number(d.fat) || 8,
          carbs: Number(d.carbs) || 15,
          fiber: Number(d.fiber) || 2,
          ingredients: Array.isArray(d.ingredients) ? d.ingredients : [d.title],
          aiComment: d.aiComment || undefined,
          selected: true,
        }));
        setParsedDishes(mapped);
      } else {
        throw new Error('AI found no dishes in your phrase');
      }
    } catch (err: any) {
      console.error('Error parsing voice meals:', err);
      setErrorMessage(err?.message || 'Speech processing error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleDishSelected = (id: string) => {
    setParsedDishes((prev) =>
      prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d))
    );
  };

  const handleDishTypeChange = (id: string, newType: MealType) => {
    setParsedDishes((prev) =>
      prev.map((d) => (d.id === id ? { ...d, mealType: newType } : d))
    );
  };

  const handleDishPortionAdjust = (id: string, delta: number) => {
    setParsedDishes((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const newGrams = Math.max(10, d.portionGrams + delta);
        const ratio = newGrams / Math.max(1, d.portionGrams);
        return {
          ...d,
          portionGrams: newGrams,
          calories: Math.round(d.calories * ratio),
          protein: Math.round(d.protein * ratio * 10) / 10,
          fat: Math.round(d.fat * ratio * 10) / 10,
          carbs: Math.round(d.carbs * ratio * 10) / 10,
          fiber: Math.round(d.fiber * ratio * 10) / 10,
        };
      })
    );
  };

  const handleDeleteDish = (id: string) => {
    setParsedDishes((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSaveAllSelected = () => {
    const selected = parsedDishes.filter((d) => d.selected);
    if (selected.length === 0) return;

    const dateToUse = targetDate || getLocalDateString();

    const mealLogsToSave: MealLog[] = selected.map((d) => ({
      id: d.id,
      userId: 'u1',
      title: d.title,
      type: d.mealType,
      portionGrams: d.portionGrams,
      calories: d.calories,
      protein: d.protein,
      fat: d.fat,
      carbs: d.carbs,
      fiber: d.fiber,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      ingredients: d.ingredients,
      aiAnalysis: d.aiComment || 'Recognized and calculated by the AI voice recorder',
      confidence: 96,
      date: dateToUse,
    }));

    onSaveMeals(mealLogsToSave);
    setIsSuccessSaved(true);
    setTimeout(() => {
      onClose();
    }, 700);
  };

  const totalSelectedCalories = parsedDishes
    .filter((d) => d.selected)
    .reduce((acc, d) => acc + d.calories, 0);

  const selectedCount = parsedDishes.filter((d) => d.selected).length;

  const mealTypeLabels: Record<MealType, { label: string; icon: React.ReactNode }> = {
    breakfast: { label: 'Breakfast', icon: <Coffee className="w-3 h-3" /> },
    lunch: { label: 'Lunch', icon: <Sun className="w-3 h-3" /> },
    dinner: { label: 'Dinner', icon: <Moon className="w-3 h-3" /> },
    snack: { label: 'Snack', icon: <Cookie className="w-3 h-3" /> },
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col my-auto"
        >
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-20">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 via-red-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-rose-500/20 shrink-0">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">
                  Voice meal recorder
                </h3>
                <span className="text-[11px] font-extrabold text-[#0AB68B] block">
                  AI will split speech into dishes and calculate macros
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            {/* 1. Voice Record Button & Audio Wave Animation */}
            {parsedDishes.length === 0 && (
              <div className="space-y-4 text-center">
                {/* Hold to record giant button */}
                <div className="relative py-6 flex flex-col items-center justify-center">
                  {/* Outer Pulsing Wave Rings */}
                  {isRecording && (
                    <>
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                        className="absolute w-36 h-36 rounded-full bg-rose-500/20 pointer-events-none"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.7, 1], opacity: [0.4, 0, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
                        className="absolute w-36 h-36 rounded-full bg-rose-500/15 pointer-events-none"
                      />
                    </>
                  )}

                  {/* Main Record Button */}
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onMouseDown={handleHoldStart}
                    onMouseUp={handleHoldEnd}
                    onTouchStart={handleHoldStart}
                    onTouchEnd={handleHoldEnd}
                    onClick={handleToggleClickRecord}
                    className={`relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center text-white shadow-xl transition-all select-none cursor-pointer ${
                      isRecording
                        ? 'bg-gradient-to-tr from-rose-600 to-red-500 shadow-rose-500/40 ring-4 ring-rose-200'
                        : 'bg-gradient-to-tr from-[#0AB68B] to-teal-500 shadow-emerald-500/30 hover:scale-105'
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <Mic className="w-10 h-10 animate-bounce" />
                        <span className="text-[10px] font-black uppercase mt-1">
                          Recording...
                        </span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-10 h-10" />
                        <span className="text-[10px] font-extrabold uppercase mt-1">
                          Hold
                        </span>
                      </>
                    )}
                  </motion.button>
                </div>

                {/* Instructions / Status */}
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm">
                    {isRecording
                      ? '🎙️ Speak: list everything you ate'
                      : 'Hold the button or tap to start'}
                  </h4>
                  <p className="text-xs text-slate-400 font-medium mt-1 max-w-xs mx-auto">
                    E.g.: “For breakfast I had 2 fried eggs, cheese toast and coffee with milk, no sugar”
                  </p>
                </div>

                {/* Live Speech Recognition Box */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-left space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                    <div className="flex items-center space-x-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Recognized text:</span>
                    </div>
                    {isRecording && (
                      <span className="flex items-center space-x-1 text-rose-500 font-extrabold">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span>Listening...</span>
                      </span>
                    )}
                  </div>

                  <div className="min-h-[50px] text-xs font-semibold text-slate-800 leading-relaxed">
                    {transcript || interimTranscript ? (
                      <>
                        <span>{transcript}</span>
                        <span className="text-slate-400 italic"> {interimTranscript}</span>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">
                        Your speech will appear here in real time...
                      </span>
                    )}
                  </div>
                </div>

                {/* Analyze Button */}
                {(transcript || interimTranscript) && !isRecording && (
                  <button
                    onClick={() => handleAnalyzeSpeech()}
                    disabled={isAnalyzing}
                    className="w-full py-3.5 bg-[#0AB68B] hover:bg-[#089e78] disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-[#0AB68B]/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI is analyzing and splitting into dishes...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Split into dishes and calculate macros</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Error Alert */}
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 2. Parsed Multi-Dishes Review List */}
            {parsedDishes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">
                      Recognized dishes ({selectedCount} of {parsedDishes.length}):
                    </h4>
                    <span className="text-xs text-slate-400 font-semibold">
                      Select the ones you need, adjust portions and add to your diary
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setParsedDishes([]);
                      setTranscript('');
                      setInterimTranscript('');
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    title="Say again"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Dishes Cards */}
                <div className="space-y-3">
                  {parsedDishes.map((dish, idx) => (
                    <div
                      key={`${dish.id}-${idx}`}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        dish.selected
                          ? 'bg-slate-50 border-[#0AB68B]/40 shadow-xs'
                          : 'bg-slate-50/50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Checkbox + Title */}
                        <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={dish.selected}
                            onChange={() => handleToggleDishSelected(dish.id)}
                            className="mt-1 w-4 h-4 text-[#0AB68B] rounded border-slate-300 focus:ring-[#0AB68B] cursor-pointer"
                          />
                          <div className="min-w-0">
                            <h5 className="font-extrabold text-xs sm:text-sm text-slate-900 leading-snug">
                              {dish.title}
                            </h5>
                            {dish.aiComment && (
                              <p className="text-[10px] text-slate-500 italic mt-0.5">
                                {dish.aiComment}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Calories & Delete */}
                        <div className="flex items-center space-x-2 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-black text-[#0AB68B] block">
                              {dish.calories} kcal
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold">
                              {dish.portionGrams}g
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteDish(dish.id)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Macros row */}
                      <div className="grid grid-cols-4 gap-1.5 mt-2.5 pt-2 border-t border-slate-200/60 text-center">
                        <div className="bg-white rounded-lg p-1 text-[10px] font-bold text-slate-600 border border-slate-100">
                          P: <span className="font-extrabold text-blue-600">{dish.protein}g</span>
                        </div>
                        <div className="bg-white rounded-lg p-1 text-[10px] font-bold text-slate-600 border border-slate-100">
                          F: <span className="font-extrabold text-amber-600">{dish.fat}g</span>
                        </div>
                        <div className="bg-white rounded-lg p-1 text-[10px] font-bold text-slate-600 border border-slate-100">
                          C: <span className="font-extrabold text-orange-600">{dish.carbs}g</span>
                        </div>
                        <div className="bg-white rounded-lg p-1 text-[10px] font-bold text-slate-600 border border-slate-100">
                          Fiber: <span className="font-extrabold text-emerald-600">{dish.fiber}g</span>
                        </div>
                      </div>

                      {/* Meal Category & Portion Stepper */}
                      <div className="flex items-center justify-between gap-2 mt-2.5">
                        {/* Category Selector */}
                        <div className="flex gap-1">
                          {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((t) => (
                            <button
                              key={t}
                              onClick={() => handleDishTypeChange(dish.id, t)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center space-x-1 border transition-all ${
                                dish.mealType === t
                                  ? 'bg-[#0AB68B] text-white border-[#0AB68B]'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {mealTypeLabels[t].icon}
                              <span>{mealTypeLabels[t].label}</span>
                            </button>
                          ))}
                        </div>

                        {/* Portion +/- */}
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleDishPortionAdjust(dish.id, -20)}
                            className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-black text-slate-700 flex items-center justify-center hover:bg-slate-100"
                          >
                            -
                          </button>
                          <span className="text-[11px] font-extrabold text-slate-700 w-10 text-center">
                            {dish.portionGrams}g
                          </span>
                          <button
                            onClick={() => handleDishPortionAdjust(dish.id, 20)}
                            className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-black text-slate-700 flex items-center justify-center hover:bg-slate-100"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary & Import Button */}
                <button
                  onClick={handleSaveAllSelected}
                  disabled={selectedCount === 0}
                  className="w-full py-3.5 bg-[#0AB68B] hover:bg-[#089e78] disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-[#0AB68B]/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSuccessSaved
                      ? 'All dishes saved to diary! ✅'
                      : `Save selected dishes (${totalSelectedCalories} kcal)`}
                  </span>
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Demo dish limit */}
      <AiLimitPopup
        isOpen={isAiLimitOpen}
        onClose={() => setIsAiLimitOpen(false)}
      />
    </AnimatePresence>
  );
};
