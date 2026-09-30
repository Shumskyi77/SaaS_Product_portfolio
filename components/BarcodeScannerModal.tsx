'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getLocalDateString } from '../lib/store';
import { motion, AnimatePresence } from 'motion/react';
import {
  Barcode,
  X,
  Camera,
  Search,
  Check,
  Flame,
  Egg,
  Wheat,
  Leaf,
  Scale,
  Sparkles,
  AlertCircle,
  Loader2,
  RefreshCw,
  Upload,
  Coffee,
  Sun,
  Moon,
  Cookie,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  Zap,
} from 'lucide-react';
import { MealLog, MealType } from '../types/meal';
import {
  OpenFoodFactsProduct,
  fetchOpenFoodFactsProduct,
  recalculatePortionKBJU,
} from '../lib/openFoodFacts';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveMeal?: (meal: MealLog) => void;
  onProductDetected?: (food: any) => void;
  defaultMealType?: MealType;
  targetDate?: string;
}

// Popular test barcode samples for instant one-click testing
const DEMO_BARCODES = [
  { label: '🍫 Snickers', code: '5000159461122' },
  { label: '🥤 Coca-Cola', code: '5449000000996' },
  { label: '🍝 Barilla', code: '8076809513753' },
  { label: '🥛 Cottage cheese 5%', code: '4600605001258' },
  { label: '🌰 Nutella', code: '8000500179864' },
  { label: '⚡ Red Bull', code: '9002490100070' },
];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onSaveMeal,
  onProductDetected,
  defaultMealType = 'lunch',
  targetDate,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [product, setProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [portionGrams, setPortionGrams] = useState<number>(100);
  const [isSuccessSaved, setIsSuccessSaved] = useState(false);

  // Scanner state
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isDetectedSuccess, setIsDetectedSuccess] = useState(false);
  const [detectedCodeDisplay, setDetectedCodeDisplay] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const isScanningLockedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zxingControlsRef = useRef<any>(null);

  // Sound & Vibration Feedback
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.setValueAtTime(1760, ctx.currentTime + 0.08); // A6
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {
      // AudioContext might be blocked until user gesture
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([60, 40, 100]);
      }
    } catch (e) {}
  }, []);

  // Cleanup on close or unmount
  const stopScanner = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch (e) {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScannerActive(false);
    setIsTorchOn(false);
  }, []);

  // Look up barcode in Open Food Facts / Offline DB / AI
  const handleLookupBarcode = useCallback(
    async (code: string) => {
      const clean = code.trim().replace(/\D/g, '');
      if (!clean || clean.length < 4) {
        setSearchError('Please enter a valid barcode (4 to 14 digits)');
        isScanningLockedRef.current = false;
        return;
      }

      setBarcodeInput(clean);
      setDetectedCodeDisplay(clean);
      setIsSearching(true);
      setSearchError(null);

      try {
        const prod = await fetchOpenFoodFactsProduct(clean);
        if (prod) {
          setProduct(prod);
          setPortionGrams(prod.portionGrams || 100);
          stopScanner();
        } else {
          setSearchError(`Product #${clean} not found in the database. You can enter the details manually.`);
          isScanningLockedRef.current = false;
        }
      } catch (err: any) {
        setSearchError(err?.message || 'Error searching the product database');
        isScanningLockedRef.current = false;
      } finally {
        setIsSearching(false);
      }
    },
    [stopScanner]
  );

  // Trigger when code is detected in video
  const onBarcodeFound = useCallback(
    (code: string) => {
      if (isScanningLockedRef.current) return;
      isScanningLockedRef.current = true;

      setIsDetectedSuccess(true);
      setDetectedCodeDisplay(code);
      playBeep();

      setTimeout(() => {
        handleLookupBarcode(code);
      }, 200);
    },
    [playBeep, handleLookupBarcode]
  );

  // Start hardware/ZXing video camera stream with multi-level fallback
  const startCamera = useCallback(async (cameraDeviceId?: string) => {
    stopScanner();
    setScannerError(null);
    setIsDetectedSuccess(false);
    isScanningLockedRef.current = false;

    try {
      // 1. Enumerate video devices
      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = devices.filter((d) => d.kind === 'videoinput');
          setCameras(videoDevs);
        } catch (e) {}
      }

      // 2. Request camera stream with fallback constraints
      let stream: MediaStream | null = null;
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: cameraDeviceId
            ? { deviceId: { exact: cameraDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
              },
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        console.warn('High-res camera constraints failed, trying basic constraints...', firstErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'environment' },
          });
        } catch (secondErr) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
      }

      if (!stream) {
        throw new Error('Could not start the video stream');
      }

      streamRef.current = stream;

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = (track.getCapabilities && track.getCapabilities()) as any;
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          }
        } catch (e) {}
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScannerActive(true);

        // 3. Initiate ZXing Scanner continuous stream with proper callback
        try {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
          
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.ITF,
            BarcodeFormat.QR_CODE,
            BarcodeFormat.DATA_MATRIX,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const zxingReader = new BrowserMultiFormatReader(hints);
          const controls = await zxingReader.decodeFromVideoElement(
            videoRef.current,
            (result, error) => {
              if (result && !isScanningLockedRef.current) {
                const text = result.getText()?.trim();
                if (text && text.length >= 4) {
                  onBarcodeFound(text);
                }
              }
            }
          );
          zxingControlsRef.current = controls;
        } catch (zxingErr) {
          console.warn('ZXing live scanner start note:', zxingErr);
        }

        // 4. Parallel hardware BarcodeDetector if supported by Chrome/Android/Safari
        if ('BarcodeDetector' in window) {
          try {
            const formats = [
              'ean_13',
              'ean_8',
              'upc_a',
              'upc_e',
              'code_128',
              'code_39',
              'code_93',
              'itf',
              'qr_code',
              'data_matrix',
            ];
            const nativeDetector = new (window as any).BarcodeDetector({ formats });

            let isChecking = false;
            const checkNative = async () => {
              if (!videoRef.current || isScanningLockedRef.current || !streamRef.current) return;
              if (videoRef.current.readyState >= 2 && !isChecking) {
                isChecking = true;
                try {
                  const barcodes = await nativeDetector.detect(videoRef.current);
                  if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    const raw = barcodes[0].rawValue.trim();
                    if (raw.length >= 4) {
                      onBarcodeFound(raw);
                      isChecking = false;
                      return;
                    }
                  }
                } catch (e) {}
                isChecking = false;
              }

              if (!isScanningLockedRef.current && streamRef.current) {
                animFrameIdRef.current = requestAnimationFrame(checkNative);
              }
            };

            animFrameIdRef.current = requestAnimationFrame(checkNative);
          } catch (e) {}
        }

        // 5. Center-crop contrast booster loop for difficult/glossy surfaces
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || isScanningLockedRef.current || videoRef.current.readyState < 2) return;
          try {
            const video = videoRef.current;
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;

            const cropCanvas = document.createElement('canvas');
            const cropW = Math.round(vw * 0.7);
            const cropH = Math.round(vh * 0.5);
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;

            const ctx = cropCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            const sx = (vw - cropW) / 2;
            const sy = (vh - cropH) / 2;
            ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

            if ('BarcodeDetector' in window) {
              try {
                const nativeDetector = new (window as any).BarcodeDetector({
                  formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
                });
                const barcodes = await nativeDetector.detect(cropCanvas);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  onBarcodeFound(barcodes[0].rawValue.trim());
                  return;
                }
              } catch (e) {}
            }
          } catch (e) {}
        }, 300);
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setScannerError('Could not turn on the camera. Check permissions or enter the barcode manually.');
      setIsScannerActive(false);
    }
  }, [onBarcodeFound, stopScanner]);

  // Instant Snapshot Decoder (for instant scan on tap)
  const handleCaptureSnapshotScan = async () => {
    if (!videoRef.current) return;
    try {
      setIsSearching(true);
      const video = videoRef.current;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, vw, vh);

      // 1. Try native detector
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
          });
          const barcodes = await detector.detect(canvas);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            playBeep();
            handleLookupBarcode(barcodes[0].rawValue.trim());
            return;
          }
        } catch (e) {}
      }

      // 2. Try ZXing on canvas
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromCanvas(canvas);
        if (result && result.getText()) {
          playBeep();
          handleLookupBarcode(result.getText().trim());
          return;
        }
      } catch (e) {}

      setSearchError('Barcode in the snapshot was not recognized. Try moving closer or using the flashlight.');
    } catch (e) {
      setSearchError('Snapshot error. Try entering the code manually.');
    } finally {
      setIsSearching(false);
    }
  };

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle note:', e);
    }
  };

  // Switch to next available camera (e.g. back ultra-wide/main)
  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const nextIndex = (selectedCameraIndex + 1) % cameras.length;
    setSelectedCameraIndex(nextIndex);
    startCamera(cameras[nextIndex].deviceId);
  };

  // Lifecycle when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setProduct(null);
      setBarcodeInput('');
      setSearchError(null);
      setIsSearching(false);
      setIsSuccessSaved(false);
      setIsDetectedSuccess(false);
      setDetectedCodeDisplay(null);
    } else {
      setMealType(defaultMealType);
      const t = setTimeout(() => {
        startCamera();
      }, 200);
      return () => clearTimeout(t);
    }
  }, [isOpen, defaultMealType, startCamera, stopScanner]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Handle Photo File Upload
  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSearching(true);
      setSearchError(null);

      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // 1. Try Native BarcodeDetector on image
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
          });
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            playBeep();
            handleLookupBarcode(barcodes[0].rawValue);
            return;
          }
        } catch (e) {}
      }

      // 2. Try ZXing on image
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromImageElement(img);
        if (result && result.getText()) {
          playBeep();
          handleLookupBarcode(result.getText());
          return;
        }
      } catch (e) {}

      // 3. Try cropped canvas
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 800;
        c.height = img.naturalHeight || 800;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const result = await reader.decodeFromCanvas(c);
          if (result && result.getText()) {
            playBeep();
            handleLookupBarcode(result.getText());
            return;
          }
        }
      } catch (e) {}

      setSearchError('Could not recognize the barcode in this photo. Try entering the digits manually or taking a clearer picture.');
    } catch (err: any) {
      setSearchError('File read error. Try entering the barcode digits manually.');
    } finally {
      setIsSearching(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Adjust Portion Size
  const handleAdjustPortion = (delta: number) => {
    if (!product) return;
    const newGrams = Math.max(10, portionGrams + delta);
    setPortionGrams(newGrams);
    setProduct(recalculatePortionKBJU(product, newGrams));
  };

  const handlePortionInput = (grams: number) => {
    if (!product) return;
    const safeGrams = Math.max(10, grams);
    setPortionGrams(safeGrams);
    setProduct(recalculatePortionKBJU(product, safeGrams));
  };

  // Save to Diary
  const handleSaveToDiary = () => {
    if (!product) return;

    if (onProductDetected) {
      onProductDetected({
        id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: product.brand ? `${product.title} (${product.brand})` : product.title,
        calories: product.calories,
        protein: product.protein,
        fat: product.fat,
        carbs: product.carbs,
        fiber: product.fiber,
        servingSizeGrams: product.portionGrams,
        barcode: product.barcode,
      });
      onClose();
      return;
    }

    const newMeal: MealLog = {
      id: `off_${Date.now()}`,
      userId: 'u1',
      title: product.brand ? `${product.title} (${product.brand})` : product.title,
      type: mealType,
      portionGrams: product.portionGrams,
      calories: product.calories,
      protein: product.protein,
      fat: product.fat,
      carbs: product.carbs,
      fiber: product.fiber,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      imageUrl: product.imageUrl,
      ingredients: product.ingredients || [product.title],
      aiAnalysis: `Imported from Open Food Facts (Barcode: ${product.barcode})${
        product.nutriscore ? ` • Nutri-Score: ${product.nutriscore}` : ''
      }`,
      confidence: 100,
      barcode: product.barcode,
      date: targetDate || getLocalDateString(),
    };

    if (onSaveMeal) {
      onSaveMeal(newMeal);
    }
    setIsSuccessSaved(true);
    setTimeout(() => {
      onClose();
    }, 600);
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
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-[#0AB68B] flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
                <Barcode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
                  <span>Barcode scanner</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                    Live 100%
                  </span>
                </h3>
                <span className="text-[11px] font-bold text-[#0AB68B] block">
                  Instant recognition & Open Food Facts
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

          <div className="p-4 sm:p-6 space-y-4">
            {/* Live Camera Scanner Box */}
            {!product && (
              <div className="space-y-3">
                <div className="relative rounded-3xl overflow-hidden bg-black min-h-[240px] sm:min-h-[280px] flex items-center justify-center border-2 border-slate-200 shadow-inner">
                  {/* High-speed Hardware Video Stream */}
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-[240px] sm:h-[280px] object-cover"
                  />

                  {/* Scanning Guide Reticle Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                    <div
                      className={`w-72 sm:w-80 h-40 border-2 rounded-2xl relative flex items-center justify-center transition-all duration-200 ${
                        isDetectedSuccess
                          ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.8)] scale-105'
                          : 'border-white/80 border-dashed shadow-[0_0_20px_rgba(0,0,0,0.6)]'
                      }`}
                    >
                      {/* Corner Accents */}
                      <div
                        className={`absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg transition-colors ${
                          isDetectedSuccess ? 'border-emerald-400' : 'border-[#0AB68B]'
                        }`}
                      />
                      <div
                        className={`absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg transition-colors ${
                          isDetectedSuccess ? 'border-emerald-400' : 'border-[#0AB68B]'
                        }`}
                      />
                      <div
                        className={`absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg transition-colors ${
                          isDetectedSuccess ? 'border-emerald-400' : 'border-[#0AB68B]'
                        }`}
                      />
                      <div
                        className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 rounded-br-lg transition-colors ${
                          isDetectedSuccess ? 'border-emerald-400' : 'border-[#0AB68B]'
                        }`}
                      />

                      {/* Sweeping Laser Line with Neon Glow */}
                      {!isDetectedSuccess ? (
                        <motion.div
                          initial={{ top: '10%' }}
                          animate={{ top: ['10%', '85%', '10%'] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                          className="absolute inset-x-2 h-1 bg-gradient-to-r from-transparent via-[#0AB68B] to-transparent shadow-[0_0_12px_#0AB68B]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/30">
                          <Check className="w-12 h-12 text-white animate-bounce" />
                        </div>
                      )}

                      <span className="px-3 py-1 bg-black/70 backdrop-blur-md rounded-full text-[11px] font-extrabold text-white shadow-md border border-white/10">
                        {isDetectedSuccess ? 'BARCODE RECOGNIZED! ⚡' : 'Point at the product barcode'}
                      </span>
                    </div>
                  </div>

                  {/* Top-Right In-Camera Controls (Torch & Camera Switch) */}
                  <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
                    {hasTorch && (
                      <button
                        onClick={toggleTorch}
                        className={`p-2.5 rounded-full backdrop-blur-md transition-all shadow-md cursor-pointer ${
                          isTorchOn
                            ? 'bg-amber-400 text-slate-950 font-black'
                            : 'bg-black/50 text-white hover:bg-black/70'
                        }`}
                        title="Flashlight"
                      >
                        {isTorchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                      </button>
                    )}

                    {cameras.length > 1 && (
                      <button
                        onClick={switchCamera}
                        className="p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md transition-all shadow-md cursor-pointer"
                        title="Switch camera"
                      >
                        <SwitchCamera className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Searching Overlay */}
                  {isSearching && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-white z-20 space-y-2">
                      <Loader2 className="w-8 h-8 animate-spin text-[#0AB68B]" />
                      <span className="text-xs font-black">
                        Looking up product #{detectedCodeDisplay || barcodeInput}...
                      </span>
                    </div>
                  )}
                </div>

                {/* Camera controls & snapshot scan & file upload button */}
                <div className="flex items-center gap-2">
                  {isScannerActive ? (
                    <button
                      onClick={handleCaptureSnapshotScan}
                      className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-[#0AB68B] hover:from-emerald-700 hover:to-[#089e78] text-white text-xs font-black rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-md shadow-[#0AB68B]/25"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Capture barcode</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => startCamera()}
                      className="flex-1 py-2.5 bg-[#0AB68B] hover:bg-[#089e78] text-white text-xs font-black rounded-xl flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Enable camera</span>
                    </button>
                  )}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-[#0AB68B]" />
                    <span>From gallery</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleScanImageFile}
                    className="hidden"
                  />
                </div>

                {/* Quick Test Demo Barcodes for instant testing */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    ⚡ Quick test with popular barcodes:
                  </span>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {DEMO_BARCODES.map((item) => (
                      <button
                        key={item.code}
                        onClick={() => {
                          playBeep();
                          handleLookupBarcode(item.code);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-[#E6F9F5] hover:text-[#0AB68B] hover:border-[#0AB68B]/40 text-slate-700 rounded-lg text-xs font-bold border border-slate-200/80 transition-all cursor-pointer flex items-center space-x-1"
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Manual Barcode Input Search */}
            {!product && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block">
                  Or enter the barcode digits manually:
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="E.g.: 5000159461122..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLookupBarcode(barcodeInput)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#0AB68B] focus:ring-1 focus:ring-[#0AB68B] outline-none transition-all"
                    />
                  </div>
                  <button
                    onClick={() => handleLookupBarcode(barcodeInput)}
                    disabled={isSearching || !barcodeInput.trim()}
                    className="px-5 py-2.5 bg-[#0AB68B] hover:bg-[#089e78] disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span>Find</span>
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {searchError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">{searchError}</span>
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        setSearchError(null);
                        startCamera();
                      }}
                      className="underline font-black text-rose-900 cursor-pointer"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Found Product Result Card */}
            {product && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                {/* Product Banner */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start space-x-3.5">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-200 p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                      <Barcode className="w-8 h-8 text-slate-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {product.brand && (
                      <span className="text-[10px] font-extrabold text-[#0AB68B] uppercase tracking-wider block">
                        {product.brand}
                      </span>
                    )}
                    <h4 className="font-black text-slate-900 text-sm leading-snug">
                      {product.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-slate-400 font-bold">
                        Barcode: {product.barcode}
                      </span>
                      {product.nutriscore && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                          Nutri-Score {product.nutriscore}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setProduct(null);
                      setBarcodeInput('');
                      startCamera();
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
                    title="Scan another product"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Big Calorie Metric Card */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl p-4 flex items-center justify-between shadow-xs">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                      <Flame className="w-7 h-7 fill-white" />
                    </div>
                    <div>
                      <span className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider block">
                        Portion calories
                      </span>
                      <div className="flex items-baseline space-x-1.5">
                        <span className="text-2xl sm:text-3xl font-black text-slate-900">
                          {product.calories}
                        </span>
                        <span className="text-xs font-bold text-amber-800">kcal</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                      Per 100 grams
                    </span>
                    <span className="text-sm font-black text-amber-700">
                      {product.caloriesPer100g} kcal
                    </span>
                  </div>
                </div>

                {/* 4 Macros */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                    <div className="flex items-center justify-center space-x-1 text-slate-500 text-[10px] font-bold">
                      <Egg className="w-3 h-3 text-blue-500" />
                      <span>Protein</span>
                    </div>
                    <span className="text-sm font-black text-slate-900 block mt-0.5">
                      {product.protein}g
                    </span>
                    <span className="text-[9px] text-slate-400 block">100g: {product.proteinPer100g}g</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                    <div className="flex items-center justify-center space-x-1 text-slate-500 text-[10px] font-bold">
                      <Flame className="w-3 h-3 text-amber-500" />
                      <span>Fat</span>
                    </div>
                    <span className="text-sm font-black text-slate-900 block mt-0.5">
                      {product.fat}g
                    </span>
                    <span className="text-[9px] text-slate-400 block">100g: {product.fatPer100g}g</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                    <div className="flex items-center justify-center space-x-1 text-slate-500 text-[10px] font-bold">
                      <Wheat className="w-3 h-3 text-orange-500" />
                      <span>Carbs</span>
                    </div>
                    <span className="text-sm font-black text-slate-900 block mt-0.5">
                      {product.carbs}g
                    </span>
                    <span className="text-[9px] text-slate-400 block">100g: {product.carbsPer100g}g</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                    <div className="flex items-center justify-center space-x-1 text-slate-500 text-[10px] font-bold">
                      <Leaf className="w-3 h-3 text-emerald-500" />
                      <span>Fiber</span>
                    </div>
                    <span className="text-sm font-black text-slate-900 block mt-0.5">
                      {product.fiber}g
                    </span>
                    <span className="text-[9px] text-slate-400 block">100g: {product.fiberPer100g}g</span>
                  </div>
                </div>

                {/* Portion Adjuster */}
                <div className="bg-[#E6F9F5]/70 border border-[#0AB68B]/30 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
                    <div className="flex items-center space-x-1.5">
                      <Scale className="w-4 h-4 text-[#0AB68B]" />
                      <span>Portion size:</span>
                    </div>
                    <span className="text-sm font-black text-[#0AB68B]">
                      {portionGrams} g
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {[-50, -10, 10, 50, 100].map((d) => (
                      <button
                        key={d}
                        onClick={() => handleAdjustPortion(d)}
                        className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        {d > 0 ? `+${d}` : d}g
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      max="3000"
                      value={portionGrams}
                      onChange={(e) => handlePortionInput(parseInt(e.target.value, 10) || 100)}
                      className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-center text-xs font-black text-slate-800 ml-auto outline-none"
                    />
                  </div>
                </div>

                {/* Meal Type Switcher */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Meal category:
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { type: 'breakfast' as MealType, label: 'Breakfast', icon: <Coffee className="w-3.5 h-3.5" /> },
                      { type: 'lunch' as MealType, label: 'Lunch', icon: <Sun className="w-3.5 h-3.5" /> },
                      { type: 'dinner' as MealType, label: 'Dinner', icon: <Moon className="w-3.5 h-3.5" /> },
                      { type: 'snack' as MealType, label: 'Snack', icon: <Cookie className="w-3.5 h-3.5" /> },
                    ].map((item) => (
                      <button
                        key={item.type}
                        onClick={() => setMealType(item.type)}
                        className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 transition-all border ${
                          mealType === item.type
                            ? 'bg-[#0AB68B] text-white border-[#0AB68B] shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ingredients list */}
                {product.ingredients && product.ingredients.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Product ingredients:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {product.ingredients.map((ing, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200/80"
                        >
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={handleSaveToDiary}
                  className="w-full py-3.5 bg-[#0AB68B] hover:bg-[#089e78] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-[#0AB68B]/25 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSuccessSaved ? 'Saved to diary! ✅' : 'Save to diary'}</span>
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
