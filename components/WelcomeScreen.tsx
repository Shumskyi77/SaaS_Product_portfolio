import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Camera } from 'lucide-react';
import { DesktopShell } from './DesktopShell';

interface WelcomeScreenProps {
  onStartOnboarding: () => void;
}

export function WelcomeScreen({ onStartOnboarding }: WelcomeScreenProps) {

  return (
    <DesktopShell>
    <div
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)',
      }}
      className="h-full w-full bg-[#FAF8F5] flex flex-col justify-between p-6 overflow-y-auto"
    >
      {/* Header / Brand */}
      <div className="pt-6 sm:pt-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#0AB68B] text-white flex items-center justify-center mx-auto shadow-xl shadow-[#0AB68B]/20">
          <Sparkles className="w-8 h-8 text-amber-200" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Nutrition Diary <span className="text-[#0AB68B]">AI</span>
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Smart AI nutrition diary and calorie scanner
          </p>
        </div>
      </div>

      {/* Hero Visual Card */}
      <div className="my-8 bg-white p-6 rounded-3xl border border-[#F0EEEA] shadow-sm space-y-4 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-[#E6F9F5] flex items-center justify-center p-2">
          <Camera className="w-10 h-10 text-[#0AB68B]" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">Photo food recognition</h2>
          <p className="text-xs text-slate-500 mt-1">
            Take a photo of your dish — AI will instantly calculate calories, protein, fat and carbs.
          </p>
        </div>
      </div>

      {/* Actions — guest-only: single entry point, no sign-in */}
      <div className="space-y-3 pb-6">
        <button
          onClick={() => onStartOnboarding()}
          className="w-full py-4 bg-[#0AB68B] hover:bg-[#089e78] text-white font-extrabold rounded-2xl shadow-lg shadow-[#0AB68B]/30 transition-all flex items-center justify-center space-x-2 group"
        >
          <span>Continue as guest</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        <div className="flex items-center justify-center space-x-1.5 text-[11px] text-slate-400 pt-2 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0AB68B]" />
          <span>Your data stays on this device</span>
        </div>
      </div>
    </div>
    </DesktopShell>
  );
}
