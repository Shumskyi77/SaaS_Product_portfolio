'use client';

import React from 'react';
import { Home, Camera, MessageSquare, TrendingUp } from 'lucide-react';

interface BottomNavProps {
  // Guest-only build: no 'friends' tab (social needs accounts/cloud).
  activeTab: 'dashboard' | 'camera' | 'chat' | 'progress';
  setActiveTab: (tab: 'dashboard' | 'camera' | 'chat' | 'progress') => void;
  onOpenScanner: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenScanner,
}) => {
  return (
    <div className="absolute bottom-4 left-3 right-3 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-center justify-between z-40">
      {/* 1. Dashboard */}
      <button
        onClick={() => setActiveTab('dashboard')}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
          activeTab === 'dashboard' ? 'text-[#0AB68B] font-extrabold' : 'text-slate-400 font-medium hover:text-slate-600'
        }`}
      >
        <Home className="w-5 h-5" />
        <span className="text-[9px] mt-0.5 truncate">Diary</span>
      </button>

      {/* Central AI Camera Button */}
      <button
        onClick={onOpenScanner}
        className="w-12 h-12 -mt-5 rounded-full bg-gradient-to-tr from-[#0AB68B] to-emerald-400 text-white flex items-center justify-center shadow-[0_8px_20px_rgba(10,182,139,0.45)] hover:scale-105 active:scale-95 transition-all border-4 border-slate-50 shrink-0 cursor-pointer"
      >
        <Camera className="w-5 h-5" />
      </button>

      {/* 3. AI Coach Chat */}
      <button
        onClick={() => setActiveTab('chat')}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
          activeTab === 'chat' ? 'text-[#0AB68B] font-extrabold' : 'text-slate-400 font-medium hover:text-slate-600'
        }`}
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-[9px] mt-0.5 truncate">AI Coach</span>
      </button>

      {/* 4. Analytics & Google Fit (Progress) */}
      <button
        onClick={() => setActiveTab('progress')}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
          activeTab === 'progress' ? 'text-[#0AB68B] font-extrabold' : 'text-slate-400 font-medium hover:text-slate-600'
        }`}
      >
        <TrendingUp className="w-5 h-5" />
        <span className="text-[9px] mt-0.5 truncate">Analytics</span>
      </button>
    </div>
  );
};
