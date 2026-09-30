'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Heart,
  Flame,
  Volume2,
  ChevronRight,
} from 'lucide-react';
import { TamagotchiState, TAMAGOTCHI_BREEDS } from '../types/tamagotchi';
import { saveStoredTamagotchi } from '../lib/store';
import { getTamagotchiImage } from '../lib/tamagotchiAssets';
import { TamagotchiAvatar } from './TamagotchiAvatar';

interface TamagotchiPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  tamagotchi: TamagotchiState | null;
  setTamagotchi: (pet: TamagotchiState | null) => void;
}

interface FallingItem {
  id: number;
  x: number; // 5 to 90%
  y: number; // 0 to 100%
  emoji: string;
  type: 'good' | 'bad' | 'super';
  points: number;
  speed: number;
  caught?: boolean;
}

const TREAT_POOL = [
  { emoji: '🍎', type: 'good' as const, points: 10 },
  { emoji: '🥕', type: 'good' as const, points: 10 },
  { emoji: '🥦', type: 'good' as const, points: 15 },
  { emoji: '🦴', type: 'super' as const, points: 20 },
  { emoji: '🎾', type: 'super' as const, points: 25 },
  { emoji: '🍗', type: 'good' as const, points: 15 },
  { emoji: '🍩', type: 'bad' as const, points: -10 },
  { emoji: '🍔', type: 'bad' as const, points: -10 },
];

export const TamagotchiPlayModal: React.FC<TamagotchiPlayModalProps> = ({
  isOpen,
  onClose,
  tamagotchi,
  setTamagotchi,
}) => {
  const [activeTab, setActiveTab] = useState<'fetch' | 'catcher'>('fetch');

  // Fetch Game State
  const [ballState, setBallState] = useState<'idle' | 'flying' | 'caught' | 'returning'>('idle');
  const [fetchScore, setFetchScore] = useState(0);
  const [fetchMessage, setFetchMessage] = useState('Tap the ball or the button to throw it!');
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number }[]>([]);

  // Treat Catcher Game State
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [catcherScore, setCatcherScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [catcherItems, setCatcherItems] = useState<FallingItem[]>([]);
  const [dogX, setDogX] = useState(50); // percentage 10 to 90
  const gameAreaRef = useRef<HTMLDivElement>(null);

  // Timer countdown
  useEffect(() => {
    if (!isOpen || gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, gameState]);

  // Spawner loop
  useEffect(() => {
    if (!isOpen || gameState !== 'playing') return;

    const spawner = setInterval(() => {
      const randomTemplate = TREAT_POOL[Math.floor(Math.random() * TREAT_POOL.length)];
      const newItem: FallingItem = {
        id: Date.now() + Math.random(),
        x: 10 + Math.random() * 80,
        y: 0,
        emoji: randomTemplate.emoji,
        type: randomTemplate.type,
        points: randomTemplate.points,
        speed: 2.2 + Math.random() * 1.5,
      };
      setCatcherItems((prev) => [...prev.slice(-10), newItem]);
    }, 600);

    return () => clearInterval(spawner);
  }, [isOpen, gameState]);

  // Physics animation loop
  useEffect(() => {
    if (!isOpen || gameState !== 'playing') return;

    const loop = setInterval(() => {
      setCatcherItems((prev) => {
        return prev
          .map((item) => {
            const nextY = item.y + item.speed;

            // Check collision with dog at bottom (y >= 75 && y <= 95)
            if (!item.caught && nextY >= 75 && nextY <= 95) {
              const distance = Math.abs(item.x - dogX);
              if (distance < 16) {
                // Collision caught!
                setCatcherScore((s) => Math.max(0, s + item.points));
                return { ...item, y: nextY, caught: true };
              }
            }
            return { ...item, y: nextY };
          })
          .filter((item) => item.y < 105 && !item.caught);
      });
    }, 40);

    return () => clearInterval(loop);
  }, [isOpen, gameState, dogX]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setGameState('idle');
      setBallState('idle');
      setCatcherItems([]);
    }
  }, [isOpen]);

  if (!isOpen || !tamagotchi || !tamagotchi.isAlive) return null;

  const breedObj = TAMAGOTCHI_BREEDS.find((b) => b.id === tamagotchi.breed) || TAMAGOTCHI_BREEDS[0];

  // ================= FETCH GAME LOGIC =================
  const handleThrowBall = () => {
    if (ballState !== 'idle') return;

    setBallState('flying');
    setFetchMessage('The ball is flying! 🎾🐾');

    setTimeout(() => {
      setBallState('caught');
      setFetchMessage(`${tamagotchi.name} caught the ball mid-jump! Woof-woof! 🎉`);
      setFetchScore((prev) => prev + 1);

      // Add happiness and update stats
      const updated: TamagotchiState = {
        ...tamagotchi,
        happiness: Math.min(100, (tamagotchi.happiness || 80) + 5),
        ballsFetched: (tamagotchi.ballsFetched || 0) + 1,
        lastPlayedAt: new Date().toISOString(),
      };
      setTamagotchi(updated);
      saveStoredTamagotchi(updated);

      // Sparkles
      const newSparkles = Array.from({ length: 6 }).map((_, i) => ({
        id: Date.now() + i,
        x: 40 + Math.random() * 40,
        y: 30 + Math.random() * 30,
      }));
      setSparkles(newSparkles);

      setTimeout(() => {
        setBallState('returning');
        setFetchMessage(`${tamagotchi.name} proudly brings the ball back! 🐕💨`);

        setTimeout(() => {
          setBallState('idle');
          setFetchMessage('Great throw! Throw it again 🎾');
          setSparkles([]);
        }, 1200);
      }, 1200);
    }, 900);
  };

  // ================= CATCHER MINI-GAME LOGIC =================
  const startGame = () => {
    setGameState('playing');
    setCatcherScore(0);
    setTimeLeft(15);
    setCatcherItems([]);
    setDogX(50);
  };

  const endGame = () => {
    setGameState('gameover');
    if (tamagotchi) {
      const updated: TamagotchiState = {
        ...tamagotchi,
        happiness: Math.min(100, (tamagotchi.happiness || 80) + 15),
        gamesPlayed: (tamagotchi.gamesPlayed || 0) + 1,
        lastPlayedAt: new Date().toISOString(),
      };
      setTamagotchi(updated);
      saveStoredTamagotchi(updated);
    }
  };

  const handleAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameState !== 'playing' || !gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    setDogX(Math.max(10, Math.min(90, clickX)));
  };

  const handleAreaTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (gameState !== 'playing' || !gameAreaRef.current || !e.touches[0]) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const touchX = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
    setDogX(Math.max(10, Math.min(90, touchX)));
  };

  return (
    <div
      id="tamagotchi-play-modal-backdrop"
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        id="tamagotchi-play-modal-card"
        className="bg-white rounded-[32px] max-w-md w-full shadow-2xl overflow-hidden flex flex-col border border-emerald-100 max-h-[90vh] my-auto"
      >
        {/* Header */}
        <div className="p-4 sm:px-6 bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-teal-500/10 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white shadow-xs flex items-center justify-center text-xl border border-emerald-200">
              🎾
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Playground 🐾
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                Playing with {tamagotchi.name} ({breedObj.name})
              </p>
            </div>
          </div>

          <button
            id="close-play-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-4 pt-3 flex space-x-2 bg-slate-50/70 border-b border-slate-100">
          <button
            id="tab-fetch-btn"
            onClick={() => {
              setActiveTab('fetch');
              setGameState('idle');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'fetch'
                ? 'bg-white text-[#0AB68B] shadow-xs border border-emerald-200'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span>🎾 Fetch! (Ball throw)</span>
          </button>

          <button
            id="tab-catcher-btn"
            onClick={() => {
              setActiveTab('catcher');
              setBallState('idle');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition flex items-center justify-center space-x-1.5 ${
              activeTab === 'catcher'
                ? 'bg-white text-amber-600 shadow-xs border border-amber-200'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span>🍎 Catch treats</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-5 overflow-y-auto">
          {/* TAB 1: FETCH GAME */}
          {activeTab === 'fetch' && (
            <div className="space-y-4">
              {/* Lawn Stage */}
              <div
                id="fetch-stage"
                onClick={handleThrowBall}
                className="relative h-64 sm:h-72 w-full rounded-3xl bg-gradient-to-b from-sky-100 via-emerald-100 to-emerald-200 border-2 border-emerald-300/60 overflow-hidden shadow-inner cursor-pointer select-none"
              >
                {/* Sun & Cloud Background Decor */}
                <div className="absolute top-3 left-4 text-2xl animate-pulse">☀️</div>
                <div className="absolute top-4 right-6 text-xl opacity-80">☁️</div>

                {/* Sparkles on catch */}
                {sparkles.map((sp) => (
                  <motion.div
                    key={sp.id}
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: [0.5, 1.4, 0], y: -30, opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute text-xl pointer-events-none"
                    style={{ left: `${sp.x}%`, top: `${sp.y}%` }}
                  >
                    ✨
                  </motion.div>
                ))}

                {/* Tennis Ball */}
                <AnimatePresence>
                  {ballState === 'flying' && (
                    <motion.div
                      key="flying-ball"
                      initial={{ x: 30, y: 180, scale: 0.8, rotate: 0 }}
                      animate={{
                        x: [30, 160, 240],
                        y: [180, 50, 120],
                        scale: [0.8, 1.2, 0.9],
                        rotate: 720,
                      }}
                      transition={{ duration: 0.9, ease: 'easeInOut' }}
                      className="absolute text-3xl pointer-events-none z-20"
                    >
                      🎾
                    </motion.div>
                  )}
                  {ballState === 'idle' && (
                    <motion.div
                      key="idle-ball"
                      className="absolute bottom-4 left-6 text-3xl cursor-pointer hover:scale-125 transition active:scale-95 z-20"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      🎾
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Dog Character on Lawn */}
                <motion.div
                  className="absolute bottom-3 w-28 h-28 sm:w-32 sm:h-32 pointer-events-none z-10"
                  animate={
                    ballState === 'flying'
                      ? { x: [40, 140, 210], y: [0, -40, -10], scaleX: [1, 1, 1] }
                      : ballState === 'caught'
                      ? { x: 210, y: [-10, -25, -10], scale: [1, 1.15, 1] }
                      : ballState === 'returning'
                      ? { x: [210, 100, 30], y: 0, scaleX: [-1, -1, 1] }
                      : { x: 30, y: [0, -4, 0], scaleX: 1 }
                  }
                  transition={{ duration: ballState === 'flying' ? 0.9 : 1.2 }}
                >
                  <TamagotchiAvatar
                    breed={tamagotchi.breed}
                    mood={ballState === 'caught' || ballState === 'returning' ? 'playful' : 'happy'}
                    alt={tamagotchi.name}
                    className="w-full h-full object-contain filter drop-shadow-md"
                  />
                  {(ballState === 'caught' || ballState === 'returning') && (
                    <span className="absolute top-2 right-2 text-xl">🎾</span>
                  )}
                </motion.div>

                {/* Bottom Grass Overlay */}
                <div className="absolute bottom-0 inset-x-0 h-4 bg-emerald-400/40 rounded-b-3xl" />
              </div>

              {/* Message & Status */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-xs font-bold text-slate-800 leading-snug">{fetchMessage}</p>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100/80 px-2 py-1 rounded-xl">
                    Caught: {fetchScore + (tamagotchi.ballsFetched || 0)} 🎾
                  </span>
                </div>
              </div>

              {/* Throw Button */}
              <button
                id="throw-ball-action-btn"
                onClick={handleThrowBall}
                disabled={ballState !== 'idle'}
                className={`w-full py-3.5 rounded-2xl font-black text-sm shadow-md transition flex items-center justify-center space-x-2 ${
                  ballState === 'idle'
                    ? 'bg-[#0AB68B] hover:bg-[#099f79] text-white active:scale-98 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Throw the ball! 🎾</span>
              </button>
            </div>
          )}

          {/* TAB 2: TREAT CATCHER MINI-GAME */}
          {activeTab === 'catcher' && (
            <div className="space-y-3">
              {gameState === 'idle' && (
                <div className="p-6 text-center space-y-4 bg-amber-50/60 rounded-3xl border border-amber-200/70">
                  <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-100 flex items-center justify-center text-3xl shadow-xs">
                    🍎
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-900">
                      Catch healthy treats!
                    </h4>
                    <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed max-w-xs mx-auto">
                      Catch 🍎, 🥕, 🥦, 🦴 and 🎾 to score points! Avoid fast food 🍩 and 🍔 to
                      keep your pet healthy!
                    </p>
                  </div>

                  <button
                    id="start-catcher-game-btn"
                    onClick={startGame}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm shadow-md active:scale-95 transition"
                  >
                    Start game (15 sec) 🚀
                  </button>
                </div>
              )}

              {gameState === 'playing' && (
                <div className="space-y-2">
                  {/* Top Stats */}
                  <div className="flex items-center justify-between px-2 text-xs font-black">
                    <span className="text-slate-700 bg-slate-100 px-2.5 py-1 rounded-xl">
                      ⏱ Time: {timeLeft}s
                    </span>
                    <span className="text-amber-700 bg-amber-100 px-2.5 py-1 rounded-xl">
                      🏆 Score: {catcherScore}
                    </span>
                  </div>

                  {/* Play Interactive Area */}
                  <div
                    id="catcher-game-area"
                    ref={gameAreaRef}
                    onClick={handleAreaClick}
                    onTouchMove={handleAreaTouch}
                    className="relative h-64 w-full rounded-3xl bg-gradient-to-b from-sky-50 via-amber-50/50 to-emerald-100 border-2 border-amber-300 overflow-hidden shadow-inner select-none cursor-crosshair"
                  >
                    {/* Falling Items */}
                    {catcherItems.map((item) => (
                      <div
                        key={item.id}
                        className="absolute text-2xl transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform"
                        style={{ left: `${item.x}%`, top: `${item.y}%` }}
                      >
                        {item.emoji}
                      </div>
                    ))}

                    {/* Dog Character Controlled by X */}
                    <div
                      className="absolute bottom-2 w-20 h-20 transform -translate-x-1/2 pointer-events-none transition-all duration-75"
                      style={{ left: `${dogX}%` }}
                    >
                      <TamagotchiAvatar
                        breed={tamagotchi.breed}
                        mood="playful"
                        alt={tamagotchi.name}
                        className="w-full h-full object-contain filter drop-shadow"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-center font-bold text-slate-500">
                    Tap or swipe left/right so your dog catches the treats!
                  </p>
                </div>
              )}

              {gameState === 'gameover' && (
                <div className="p-6 text-center space-y-4 bg-emerald-50/90 rounded-3xl border border-emerald-200">
                  <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-100 flex items-center justify-center text-3xl shadow-xs">
                    🏆
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-emerald-900">
                      Great game! Score: {catcherScore} points!
                    </h4>
                    <p className="text-xs text-emerald-700 font-bold mt-1">
                      {tamagotchi.name} is happy and recharged (+15% mood) 💖✨
                    </p>
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <button
                      id="retry-catcher-game-btn"
                      onClick={startGame}
                      className="flex-1 py-3 bg-[#0AB68B] hover:bg-[#099f79] text-white rounded-2xl font-black text-xs shadow-md transition"
                    >
                      Play again 🔄
                    </button>
                    <button
                      onClick={onClose}
                      className="py-3 px-4 bg-white text-slate-700 hover:bg-slate-100 rounded-2xl font-bold text-xs border border-slate-200 transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
