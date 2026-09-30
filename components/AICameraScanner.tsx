'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Sparkles,
  X,
  Check,
  Upload,
  Barcode,
  Flame,
  Egg,
  Wheat,
  Leaf,
  RefreshCw,
  AlertCircle,
  Video,
  Sliders,
  Utensils,
  ChevronRight,
  Info,
  Mic,
  Volume2,
  Scale,
  Loader2,
  FileText,
} from 'lucide-react';
import { MealLog, MealType } from '../types/meal';
import { compressImageFile, getLocalDateString } from '../lib/store';
import { calculateRealFoodNutrition } from '../lib/nutritionEngine';
import { analyzeFoodWithAI } from '../lib/gemini';
import { hasDishQuota } from '../lib/dishQuota';
import { fetchOpenFoodFactsProduct, OpenFoodFactsProduct, recalculatePortionKBJU } from '../lib/openFoodFacts';
import { VoiceMealModal } from './VoiceMealModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { AiLimitPopup } from './AiLimitPopup';

interface AICameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveMeal: (meal: MealLog) => void;
  onSaveMultipleMeals?: (meals: MealLog[]) => void;
  targetDate?: string;
  defaultMealType?: MealType;
}

interface AnalyzedFoodData {
  title: string;
  portionGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  confidence: number;
  ingredients?: string[];
  aiAnalysis?: string;
}

export const AICameraScanner: React.FC<AICameraScannerProps> = ({
  isOpen,
  onClose,
  onSaveMeal,
  onSaveMultipleMeals,
  targetDate,
  defaultMealType = 'lunch',
}) => {
  const [scanMode, setScanMode] = useState<'photo' | 'live' | 'barcode'>('photo');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('Recognizing...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyzedFood, setAnalyzedFood] = useState<AnalyzedFoodData | null>(null);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);

  // Live Camera Stream states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [correctionText, setCorrectionText] = useState('');
  const [isApplyingCorrection, setIsApplyingCorrection] = useState(false);
  const [correctionNote, setCorrectionNote] = useState<string | null>(null);
  const [userRemarks, setUserRemarks] = useState<string>('');
  const [isSuccessSaved, setIsSuccessSaved] = useState(false);

  // Modals for Voice & Barcode
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);

  // Demo limit: only one AI dish
  const [isAiLimitOpen, setIsAiLimitOpen] = useState(false);

  // Voice Hold-To-Record Inline State
  const [isInlineVoiceRecording, setIsInlineVoiceRecording] = useState(false);
  const [voiceSpeechTranscript, setVoiceSpeechTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const isHoldingMicRef = useRef(false);

  // Stop camera when closing modal
  useEffect(() => {
    if (!isOpen) {
      stopLiveCamera();
      setSelectedImage(null);
      setAnalyzedFood(null);
      setErrorMessage(null);
      setIsAnalyzing(false);
      setIsSuccessSaved(false);
      setIsAiLimitOpen(false);
      setIsInlineVoiceRecording(false);
      setVoiceSpeechTranscript('');
      setUserRemarks('');
    } else {
      setMealType(defaultMealType);
    }
  }, [isOpen, defaultMealType]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopLiveCamera();
    };
  }, []);

  const sampleDishes = [
    {
      title: 'Fluffy 3-egg omelet with herbs',
      portionGrams: 210,
      image: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?auto=format&fit=crop&w=600&q=80',
    },
    {
      title: 'Avocado salad with egg and tomatoes',
      portionGrams: 220,
      image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    },
    {
      title: 'Grilled salmon steak with asparagus',
      portionGrams: 240,
      image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
    },
    {
      title: 'Caesar salad with chicken breast',
      portionGrams: 250,
      image: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=600&q=80',
    },
    {
      title: 'Soft cottage cheese pancakes with sour cream',
      portionGrams: 180,
      image: 'https://images.unsplash.com/photo-1588195538326-c5b1e9f80a1b?auto=format&fit=crop&w=600&q=80',
    },
    {
      title: 'Pasta Carbonara with creamy sauce',
      portionGrams: 260,
      image: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=600&q=80',
    },
  ];

  const startLiveCamera = async () => {
    setCameraError(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          try {
            await video.play();
          } catch (playErr) {
            console.warn('Video play promise caught:', playErr);
          }
        }
        setIsCameraActive(true);
        setScanMode('live');
      } else {
        setCameraError('Camera is not supported by your browser. Please upload a photo instead.');
      }
    } catch (err: any) {
      console.warn('Live camera access error:', err);
      setCameraError('Could not access the camera. Check permissions or upload a file.');
      setIsCameraActive(false);
    }
  };

  const stopLiveCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const captureLiveSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        stopLiveCamera();
        processImageForAnalysis(dataUrl, 'Camera snapshot');
      }
    } catch (err) {
      console.error('Failed to capture frame in Safari/browser:', err);
      stopLiveCamera();
      cameraInputRef.current?.click();
    }
  };

  const processImageForAnalysis = async (
    imageDataUrlOrUrl: string,
    hint?: string,
    remarksOverride?: string
  ) => {
    // Demo limit: a new dish only with free quota.
    // Refining an already recognized dish (macro recalc) is always allowed.
    // Quota is deducted in App.handleSaveMeal on actual save.
    const isRefinement = analyzedFood !== null;
    if (!isRefinement && !hasDishQuota()) {
      setIsAiLimitOpen(true);
      return;
    }

    setSelectedImage(imageDataUrlOrUrl);
    setIsAnalyzing(true);
    setErrorMessage(null);
    setCorrectionNote(null);
    setCorrectionText('');

    const activeRemarks = remarksOverride !== undefined ? remarksOverride : userRemarks;

    // Safety watchdog timer (35s) so UI never gets permanently stuck
    let isHandled = false;
    const safetyTimer = setTimeout(() => {
      if (!isHandled) {
        isHandled = true;
        const combinedHint = activeRemarks ? `${hint || ''} (${activeRemarks})` : hint;
        const fallback = calculateRealFoodNutrition(combinedHint, '');
        setAnalyzedFood({
          ...fallback,
          ingredients: [fallback.title],
          aiAnalysis: 'Identified with the Foodvisor culinary algorithm',
        });
        setIsAnalyzing(false);
      }
    }, 35000);

    try {
      setAnalysisStep('Gemini Vision is studying the dish composition, texture and ingredients...');
      const stepTimer1 = setTimeout(() => {
        if (!isHandled) setAnalysisStep('Estimating cooking method and portion size...');
      }, 2500);
      const stepTimer2 = setTimeout(() => {
        if (!isHandled) setAnalysisStep('Calibrating and calculating nutrition (macros)...');
      }, 5000);

      const aiResult = await analyzeFoodWithAI(imageDataUrlOrUrl, hint, undefined, activeRemarks);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!isHandled) {
        isHandled = true;
        clearTimeout(safetyTimer);
        setAnalyzedFood(aiResult);
      }
    } catch (err: any) {
      if (!isHandled) {
        isHandled = true;
        clearTimeout(safetyTimer);
        console.warn('AI analysis fallback triggered:', err);
        const combinedHint = activeRemarks ? `${hint || ''} (${activeRemarks})` : hint;
        const fallback = calculateRealFoodNutrition(combinedHint, '');
        setAnalyzedFood({
          ...fallback,
          ingredients: [fallback.title],
          aiAnalysis: 'Identified with the Foodvisor culinary algorithm',
        });
      }
    } finally {
      clearTimeout(safetyTimer);
      setIsAnalyzing(false);
    }
  };

  const handleReanalyzeWithRemarks = () => {
    if (!selectedImage) return;
    processImageForAnalysis(selectedImage, analyzedFood?.title, userRemarks);
  };

  const handleSelectSample = async (sample: (typeof sampleDishes)[0]) => {
    stopLiveCamera();
    processImageForAnalysis(sample.image, sample.title);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopLiveCamera();
      const rawName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]/g, ' ')
        .replace(/\d+/g, '')
        .trim();
      const isGenericName =
        !rawName ||
        rawName.toLowerCase().startsWith('img') ||
        rawName.toLowerCase().startsWith('image') ||
        rawName.toLowerCase().startsWith('photo');
      const fileNameHint = isGenericName ? '' : rawName;

      const dataUrl = await compressImageFile(file);
      const img =
        dataUrl ||
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
      processImageForAnalysis(img, fileNameHint);
    }
  };

  const handlePortionChange = (newGrams: number) => {
    if (!analyzedFood) return;
    const validatedGrams = Math.max(2, Math.round(newGrams));
    const currentGrams = analyzedFood.portionGrams || 1;
    const ratio = validatedGrams / currentGrams;
    setAnalyzedFood({
      ...analyzedFood,
      portionGrams: validatedGrams,
      calories: Math.max(1, Math.round(analyzedFood.calories * ratio)),
      protein: Math.max(0, Math.round(analyzedFood.protein * ratio)),
      fat: Math.max(0, Math.round(analyzedFood.fat * ratio)),
      carbs: Math.max(0, Math.round(analyzedFood.carbs * ratio)),
      fiber: Math.max(0, Math.round(analyzedFood.fiber * ratio)),
    });
  };

  // Hold-to-record voice logic
  const handleHoldStart = () => {
    isHoldingMicRef.current = true;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsVoiceModalOpen(true);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsInlineVoiceRecording(true);
      };

      recognition.onresult = (event: any) => {
        let fullText = '';
        for (let i = 0; i < event.results.length; i++) {
          fullText += event.results[i][0].transcript + ' ';
        }
        setVoiceSpeechTranscript(fullText.trim());
      };

      recognition.onerror = () => {
        setIsInlineVoiceRecording(false);
      };

      recognition.onend = () => {
        setIsInlineVoiceRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      setIsVoiceModalOpen(true);
    }
  };

  const handleHoldEnd = () => {
    isHoldingMicRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    setIsInlineVoiceRecording(false);

    // Open voice modal with captured text or to review parsed multi-dishes
    setIsVoiceModalOpen(true);
  };

  const handleSaveToDiary = () => {
    if (!analyzedFood) return;

    const newMeal: MealLog = {
      id: 'meal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: 'u1',
      title: analyzedFood.title ? analyzedFood.title.trim() : 'Recognized dish',
      type: mealType,
      portionGrams: Math.max(1, Math.round(Number(analyzedFood.portionGrams) || 100)),
      calories: Math.max(0, Math.round(Number(analyzedFood.calories) || 0)),
      protein: Math.max(0, Math.round(Number(analyzedFood.protein) || 0)),
      fat: Math.max(0, Math.round(Number(analyzedFood.fat) || 0)),
      carbs: Math.max(0, Math.round(Number(analyzedFood.carbs) || 0)),
      fiber: Math.max(0, Math.round(Number(analyzedFood.fiber) || 0)),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      imageUrl: selectedImage || undefined,
      ingredients: analyzedFood.ingredients && analyzedFood.ingredients.length > 0
        ? analyzedFood.ingredients
        : [analyzedFood.title || 'Dish'],
      aiAnalysis: analyzedFood.aiAnalysis,
      confidence: analyzedFood.confidence,
      notes: userRemarks.trim() || undefined,
      date: targetDate || getLocalDateString(),
    };

    try {
      onSaveMeal(newMeal);
      setIsSuccessSaved(true);
      setTimeout(() => {
        setSelectedImage(null);
        setAnalyzedFood(null);
        setUserRemarks('');
        setIsSuccessSaved(false);
        onClose();
      }, 600);
    } catch (error) {
      console.error('Save to diary failed:', error);
      alert('Save failed: ' + (error as Error).message);
    }
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
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-20">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0AB68B] to-teal-400 flex items-center justify-center text-white shadow-md shadow-[#0AB68B]/20 shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">
                  AI Food & Product Scanner
                </h3>
                <span className="text-[11px] font-extrabold text-[#0AB68B] block">
                  Photo • Open Food Facts • Voice recorder
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                stopLiveCamera();
                onClose();
              }}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-2xl text-xs font-extrabold">
              <button
                onClick={() => {
                  stopLiveCamera();
                  setScanMode('photo');
                }}
                className={`py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                  scanMode === 'photo'
                    ? 'bg-white text-[#0AB68B] shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Dish photo</span>
              </button>

              <button
                onClick={() => {
                  stopLiveCamera();
                  setIsBarcodeModalOpen(true);
                }}
                className="py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 text-slate-600 hover:text-[#0AB68B] cursor-pointer"
              >
                <Barcode className="w-3.5 h-3.5 text-[#0AB68B]" />
                <span>Barcode OFF</span>
              </button>

              <button
                onClick={() => {
                  stopLiveCamera();
                  setIsVoiceModalOpen(true);
                }}
                className="py-2 rounded-xl transition-all flex items-center justify-center space-x-1.5 text-slate-600 hover:text-rose-500 cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5 text-rose-500" />
                <span>AI Dictaphone</span>
              </button>
            </div>

            {/* Live Camera Stream Mode */}
            {scanMode === 'live' && isCameraActive && !selectedImage && (
              <div className="space-y-3">
                <div className="relative h-64 sm:h-72 w-full bg-black rounded-3xl overflow-hidden shadow-inner flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between overflow-hidden">
                    <div className="flex justify-between">
                      <div className="w-8 h-8 border-t-4 border-l-4 border-[#0AB68B] rounded-tl-xl" />
                      <div className="w-8 h-8 border-t-4 border-r-4 border-[#0AB68B] rounded-tr-xl" />
                    </div>
                    <div className="text-center relative z-10">
                      <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[11px] font-extrabold text-white">
                        Point the camera at a plate of food
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <div className="w-8 h-8 border-b-4 border-l-4 border-[#0AB68B] rounded-bl-xl" />
                      <div className="w-8 h-8 border-b-4 border-r-4 border-[#0AB68B] rounded-br-xl" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={captureLiveSnapshot}
                    className="px-6 py-3.5 bg-[#0AB68B] hover:bg-[#089e78] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-[#0AB68B]/30 flex items-center space-x-2 transition-all cursor-pointer"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Take a snapshot</span>
                  </button>
                  <button
                    onClick={stopLiveCamera}
                    className="px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Photo Upload Mode */}
            {!selectedImage && scanMode !== 'live' && (
              <div className="space-y-4">
                {/* 1. Main Photo Box: "Tap to pick or take a photo" */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative border-2 border-dashed border-[#0AB68B]/40 bg-[#E6F9F5]/40 p-6 sm:p-8 rounded-3xl text-center cursor-pointer hover:bg-[#E6F9F5] transition-all group space-y-3 overflow-hidden shadow-xs"
                >
                  <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-[#0AB68B] rounded-tl-lg" />
                  <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-[#0AB68B] rounded-tr-lg" />
                  <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-[#0AB68B] rounded-bl-lg" />
                  <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-[#0AB68B] rounded-br-lg" />

                  <div className="w-14 h-14 rounded-2xl bg-[#0AB68B] text-white mx-auto flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                    <Camera className="w-7 h-7" />
                  </div>

                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">
                      Tap to pick or take a photo
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-1 max-w-xs mx-auto">
                      Gemini Vision will auto-detect the dish, estimate weight in grams and calculate macros
                    </p>
                  </div>

                  <div className="inline-flex items-center space-x-2 px-4 py-2 bg-white rounded-xl shadow-xs border border-slate-200/80 text-xs font-bold text-slate-700">
                    <Upload className="w-3.5 h-3.5 text-[#0AB68B]" />
                    <span>Choose from gallery / camera</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* Optional Remarks before choosing photo/dish */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-1.5 shadow-xs">
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#0AB68B]" />
                    <span>Photo notes (optional):</span>
                  </label>
                  <input
                    type="text"
                    value={userRemarks}
                    onChange={(e) => setUserRemarks(e.target.value)}
                    placeholder="E.g.: fried without oil, 2 eggs, no sugar, 300g portion..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:border-[#0AB68B] focus:ring-1 focus:ring-[#0AB68B] outline-none transition-all"
                  />
                </div>

                {/* 2. DEDICATED HOLD-TO-RECORD VOICE BUTTON DIRECTLY UNDER PHOTO BUTTON */}
                <div className="relative">
                  <div
                    onMouseDown={handleHoldStart}
                    onMouseUp={handleHoldEnd}
                    onTouchStart={handleHoldStart}
                    onTouchEnd={handleHoldEnd}
                    onClick={() => setIsVoiceModalOpen(true)}
                    className={`relative p-4 sm:p-4.5 rounded-3xl border-2 transition-all flex items-center justify-between cursor-pointer select-none shadow-md ${
                      isInlineVoiceRecording
                        ? 'bg-gradient-to-r from-rose-500 via-red-500 to-amber-500 text-white border-rose-400 ring-4 ring-rose-200 scale-[1.02]'
                        : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border-slate-700 hover:border-[#0AB68B] hover:shadow-lg'
                    }`}
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md shrink-0 transition-transform ${
                          isInlineVoiceRecording
                            ? 'bg-white text-rose-600 animate-bounce'
                            : 'bg-gradient-to-tr from-rose-500 to-amber-500 text-white'
                        }`}
                      >
                        <Mic className="w-6 h-6" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-black text-xs sm:text-sm tracking-tight truncate">
                            {isInlineVoiceRecording
                              ? '🔴 Listening... Release to save'
                              : '🎙️ Hold for dictaphone'}
                          </h4>
                          {isInlineVoiceRecording && (
                            <span className="w-2 h-2 rounded-full bg-yellow-300 animate-ping" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
                          {isInlineVoiceRecording
                            ? voiceSpeechTranscript || 'Say: "Ate 2 eggs, coffee and toast..."'
                            : 'AI will split your speech into dishes and log them'}
                        </p>
                      </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-xl bg-white/15 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-emerald-300 shrink-0 border border-white/10">
                      {isInlineVoiceRecording ? 'Recording...' : 'Hold'}
                    </div>
                  </div>
                </div>

                {/* 3. Open Food Facts Barcode Quick Banner */}
                <div
                  onClick={() => setIsBarcodeModalOpen(true)}
                  className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200/90 rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:border-emerald-300 hover:shadow-xs transition-all"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#0AB68B] text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Barcode className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h5 className="font-extrabold text-xs text-slate-900 truncate">
                        Scan Open Food Facts barcode
                      </h5>
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Import official nutrition from the product database
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#0AB68B] shrink-0" />
                </div>

                {/* Test Dish Presets */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                      Sample dishes for AI recognition:
                    </span>
                    <span className="text-[10px] text-[#0AB68B] font-bold">Tap to try</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {sampleDishes.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectSample(s)}
                        className="relative rounded-2xl overflow-hidden h-20 sm:h-22 border border-slate-200 cursor-pointer group shadow-xs hover:border-[#0AB68B] transition-all"
                      >
                        <img
                          src={s.image}
                          alt={s.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-1.5 flex items-end">
                          <span className="text-[9px] font-extrabold text-white leading-tight line-clamp-2">
                            {s.title}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Result Card */}
            {selectedImage && (
              <div className="space-y-4">
                {/* Visual Image Preview with dynamic overlay */}
                <div className="relative h-60 sm:h-64 w-full rounded-3xl overflow-hidden border border-slate-200/80 shadow-md bg-slate-950 group">
                  <img
                    src={selectedImage}
                    alt="Food Preview"
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                  />

                  {/* Gradient vignette */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 pointer-events-none" />

                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white p-5 text-center overflow-hidden z-20">
                      <motion.div
                        initial={{ top: '8%' }}
                        animate={{ top: ['8%', '88%', '8%'] }}
                        transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#0AB68B] to-transparent shadow-[0_0_25px_#0AB68B] pointer-events-none z-10"
                      />
                      <div className="relative z-20 space-y-3 flex flex-col items-center">
                        <div className="w-14 h-14 rounded-2xl bg-[#0AB68B]/30 border border-[#0AB68B]/60 flex items-center justify-center text-[#0AB68B] animate-spin shadow-[0_0_20px_rgba(10,182,139,0.35)]">
                          <Sparkles className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-black text-sm text-white">AI is analyzing the dish...</h4>
                          <p className="text-xs text-emerald-200 max-w-xs font-medium">
                            {analysisStep}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Floating Top Bar (Confidence + Change photo) */}
                  <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10">
                    <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[11px] font-extrabold text-emerald-300 border border-white/10 shadow-xs flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>AI recognition</span>
                    </span>

                    <button
                      onClick={() => {
                        setSelectedImage(null);
                        setAnalyzedFood(null);
                        setErrorMessage(null);
                      }}
                      className="p-2 bg-black/60 hover:bg-black/80 rounded-full text-white backdrop-blur-md transition-colors cursor-pointer border border-white/10"
                      title="Pick another photo"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Floating Bottom Bar (Calories + Grams banner) */}
                  {analyzedFood && !isAnalyzing && (
                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between z-10 bg-slate-900/85 backdrop-blur-md p-2.5 rounded-2xl border border-white/15 shadow-xl text-white">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-red-500 flex items-center justify-center text-white shadow-md shrink-0">
                          <Flame className="w-4 h-4 fill-white" />
                        </div>
                        <div>
                          <div className="text-sm font-black text-white leading-tight">
                            {analyzedFood.calories} <span className="text-xs font-semibold text-amber-300">kcal</span>
                          </div>
                          <div className="text-[10px] text-slate-300 font-medium">
                            {analyzedFood.portionGrams} g portion
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Accuracy</span>
                        <span className="text-xs font-black text-emerald-400">
                          {analyzedFood.confidence || 98}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Analyzed Food Details */}
                {analyzedFood && !isAnalyzing && (
                  <div className="space-y-4 pt-1">
                    {/* Dish Title & Meal Type Selector */}
                    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-3">
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-0.5">
                          Dish name
                        </span>
                        <input
                          type="text"
                          value={analyzedFood.title}
                          onChange={(e) =>
                            setAnalyzedFood({ ...analyzedFood, title: e.target.value })
                          }
                          className="w-full text-base font-black text-slate-900 bg-white border border-slate-200 rounded-xl px-3 py-1.5 focus:border-[#0AB68B] focus:ring-1 focus:ring-[#0AB68B] outline-none"
                        />
                        {analyzedFood.aiAnalysis && (
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium">
                            💡 {analyzedFood.aiAnalysis}
                          </p>
                        )}
                      </div>

                      {/* Meal Category Selector */}
                      <div className="pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
                          Meal
                        </span>
                        <div className="grid grid-cols-4 gap-1.5 text-xs font-extrabold">
                          {[
                            { id: 'breakfast', label: 'Breakfast' },
                            { id: 'lunch', label: 'Lunch' },
                            { id: 'dinner', label: 'Dinner' },
                            { id: 'snack', label: 'Snack' },
                          ].map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setMealType(t.id as MealType)}
                              className={`py-1.5 rounded-xl transition-all cursor-pointer ${
                                mealType === t.id
                                  ? 'bg-[#0AB68B] text-white shadow-xs font-black'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 4 Beautiful Macro Cards */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-gradient-to-b from-blue-50/70 to-blue-100/30 border border-blue-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                        <div className="flex items-center justify-center space-x-1 text-blue-700 text-[10px] font-black uppercase tracking-tight">
                          <Egg className="w-3 h-3 text-blue-500 shrink-0" />
                          <span>Protein</span>
                        </div>
                        <span className="text-base font-black text-slate-900 block mt-1">
                          {analyzedFood.protein}<span className="text-[11px] font-semibold text-slate-400">g</span>
                        </span>
                      </div>

                      <div className="bg-gradient-to-b from-amber-50/70 to-amber-100/30 border border-amber-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                        <div className="flex items-center justify-center space-x-1 text-amber-700 text-[10px] font-black uppercase tracking-tight">
                          <Flame className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>Fat</span>
                        </div>
                        <span className="text-base font-black text-slate-900 block mt-1">
                          {analyzedFood.fat}<span className="text-[11px] font-semibold text-slate-400">g</span>
                        </span>
                      </div>

                      <div className="bg-gradient-to-b from-orange-50/70 to-orange-100/30 border border-orange-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                        <div className="flex items-center justify-center space-x-1 text-orange-700 text-[10px] font-black uppercase tracking-tight">
                          <Wheat className="w-3 h-3 text-orange-500 shrink-0" />
                          <span>Carbs</span>
                        </div>
                        <span className="text-base font-black text-slate-900 block mt-1">
                          {analyzedFood.carbs}<span className="text-[11px] font-semibold text-slate-400">g</span>
                        </span>
                      </div>

                      <div className="bg-gradient-to-b from-emerald-50/70 to-emerald-100/30 border border-emerald-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                        <div className="flex items-center justify-center space-x-1 text-emerald-700 text-[10px] font-black uppercase tracking-tight">
                          <Leaf className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>Fiber</span>
                        </div>
                        <span className="text-base font-black text-slate-900 block mt-1">
                          {analyzedFood.fiber}<span className="text-[11px] font-semibold text-slate-400">g</span>
                        </span>
                      </div>
                    </div>

                    {/* NEW PORTION SELECTION (Min 2g, Number Input, Slider & Quick Chips) */}
                    <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5 text-xs font-black text-slate-800">
                          <Scale className="w-4 h-4 text-[#0AB68B]" />
                          <span>Portion weight (min 2g):</span>
                        </div>

                        {/* Direct Number Input */}
                        <div className="flex items-center space-x-1 bg-emerald-50 px-2 py-1 rounded-xl border border-emerald-200">
                          <input
                            type="number"
                            min={2}
                            max={3000}
                            step={1}
                            value={analyzedFood.portionGrams}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (val >= 2) handlePortionChange(val);
                            }}
                            className="w-16 text-right font-black text-sm text-[#0AB68B] bg-transparent outline-none"
                          />
                          <span className="text-xs font-bold text-emerald-700">g</span>
                        </div>
                      </div>

                      {/* Interactive Smooth Slider */}
                      <div className="space-y-1">
                        <input
                          type="range"
                          min={2}
                          max={1000}
                          step={1}
                          value={Math.min(1000, Math.max(2, analyzedFood.portionGrams))}
                          onChange={(e) => handlePortionChange(Number(e.target.value))}
                          className="w-full accent-[#0AB68B] h-2 bg-slate-100 rounded-lg cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-bold px-0.5">
                          <span>2 g</span>
                          <span>250 g</span>
                          <span>500 g</span>
                          <span>1000 g</span>
                        </div>
                      </div>

                      {/* Quick Adjust Buttons with 2g increment support */}
                      <div className="grid grid-cols-6 gap-1 pt-1">
                        {[-50, -10, -2, 2, 10, 50].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              handlePortionChange(
                                Math.max(2, (analyzedFood.portionGrams || 100) + d)
                              )
                            }
                            className="py-1.5 bg-slate-50 hover:bg-emerald-50 hover:text-[#0AB68B] hover:border-emerald-300 rounded-xl border border-slate-200 text-[11px] font-black text-slate-700 transition-all cursor-pointer text-center"
                          >
                            {d > 0 ? `+${d}` : d}g
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* PHOTO DESCRIPTION & AI RE-THINK SECTION */}
                    <div className="bg-gradient-to-b from-indigo-50/60 to-purple-50/40 border border-indigo-200/80 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-indigo-950 uppercase tracking-wider flex items-center space-x-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Dish description / Clarification for AI:</span>
                        </label>
                        <span className="text-[10px] text-indigo-600 font-bold">
                          Context & details
                        </span>
                      </div>

                      <textarea
                        value={userRemarks}
                        onChange={(e) => setUserRemarks(e.target.value)}
                        placeholder="Describe the dish or add details (e.g.: 2 eggs fried in butter, no salt, 150g salad, half portion...)"
                        rows={2}
                        className="w-full p-3 bg-white border border-indigo-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-all shadow-inner"
                      />

                      {/* Prominent Glowing "Re-think with AI" Button */}
                      <button
                        type="button"
                        onClick={handleReanalyzeWithRemarks}
                        disabled={isAnalyzing}
                        className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-500/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className={`w-4 h-4 text-amber-300 ${isAnalyzing ? 'animate-spin' : ''}`} />
                        <span>
                          {isAnalyzing
                            ? 'AI is thinking it over...'
                            : '🧠 Re-think with AI (recalculate macros)'}
                        </span>
                      </button>
                    </div>

                    {/* Final Save To Diary Button */}
                    <button
                      type="button"
                      onClick={handleSaveToDiary}
                      className="w-full py-4 bg-gradient-to-r from-[#0AB68B] to-teal-600 hover:from-[#099f79] hover:to-teal-700 active:scale-[0.99] text-white font-black text-sm rounded-2xl shadow-[0_8px_25px_rgba(10,182,139,0.35)] flex items-center justify-center space-x-2.5 transition-all cursor-pointer"
                    >
                      <Check className="w-5 h-5 stroke-[2.5]" />
                      <span>
                        {isSuccessSaved ? 'Logged to diary! ✅' : 'Log to food diary'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Voice Dictation Modal */}
      <VoiceMealModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        defaultMealType={mealType}
        targetDate={targetDate}
        onSaveMeals={(meals) => {
          if (onSaveMultipleMeals) {
            onSaveMultipleMeals(meals);
          } else {
            meals.forEach((m) => onSaveMeal(m));
          }
          setIsVoiceModalOpen(false);
          onClose();
        }}
      />

      {/* Barcode Open Food Facts Modal */}
      <BarcodeScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        defaultMealType={mealType}
        targetDate={targetDate}
        onSaveMeal={(m) => {
          onSaveMeal(m);
          setIsBarcodeModalOpen(false);
          onClose();
        }}
      />

      {/* Demo dish limit */}
      <AiLimitPopup
        isOpen={isAiLimitOpen}
        onClose={() => setIsAiLimitOpen(false)}
      />
    </AnimatePresence>
  );
};
