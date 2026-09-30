'use client';

import React from 'react';
import {
  Sparkles,
  Camera,
  Flame,
  Users,
  ShieldCheck,
  ScanLine,
  TrendingUp,
  MousePointerClick,
} from 'lucide-react';

interface DesktopShellProps {
  children: React.ReactNode;
}

/**
 * DesktopShell — a polished desktop wrapper.
 *
 * Mobile (<xl): the phone fills the screen with no extra chrome — same behavior as before.
 * Desktop (xl+): an atmospheric dark background with blobs and a grid, a brand panel on the left,
 * the phone frame with the app in the center, and glass tip cards on the right.
 */
export const DesktopShell: React.FC<DesktopShellProps> = ({ children }) => {
  return (
    <div className="desktop-stage h-dvh-fallback w-full font-sans text-slate-800 antialiased overflow-hidden overflow-clip relative bg-[#FAF8F5] xl:bg-[#060D0B]">
      {/* NOTE: the app content below always lives inside a max-w-[430px] phone frame,
          so nothing inside it may use viewport breakpoints (sm:/md:/lg:/vh) — it would
          squeeze phone UI into a 430px box. Keep that invariant. */}
      {/* ── Desktop background: visible on xl+ only ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
        {/* base gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(16,185,129,0.22),transparent_60%),radial-gradient(900px_500px_at_90%_10%,rgba(45,212,191,0.14),transparent_60%),radial-gradient(1000px_700px_at_50%_110%,rgba(245,158,11,0.10),transparent_60%),linear-gradient(180deg,#071210_0%,#060D0B_55%,#040807_100%)]" />
        {/* grid */}
        <div className="desktop-grid absolute inset-0 opacity-[0.5]" />
        {/* drifting blobs */}
        <div className="animate-drift-slow absolute -left-40 top-[-120px] h-[480px] w-[480px] rounded-full bg-emerald-500/20 blur-[130px]" />
        <div className="animate-drift-slower absolute right-[-160px] top-[30%] h-[520px] w-[520px] rounded-full bg-teal-400/15 blur-[140px]" />
        <div className="animate-drift-slow absolute bottom-[-180px] left-[35%] h-[420px] w-[420px] rounded-full bg-amber-400/10 blur-[130px]" />
        {/* vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
      </div>

      {/* ── Stage ── */}
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1600px] items-stretch justify-center gap-10 px-0 xl:items-center xl:px-10 py-0 xl:py-6">
        {/* Left brand panel */}
        {/* max-h-full + internal scroll keeps the stage non-scrollable on short screens;
            auto margins on the first/last child center the panel only when it fits. */}
        <aside className="no-scrollbar hidden max-h-full min-h-0 w-[340px] shrink-0 flex-col space-y-7 overflow-y-auto xl:flex *:first:mt-auto *:last:mb-auto">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0AB68B] to-emerald-400 shadow-lg shadow-emerald-500/30">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-white">Foodvisor AI</p>
              <p className="text-xs font-bold text-emerald-300/80">AI nutrition and macros diary</p>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white">
              Eat tasty.
              <br />
              <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
                Track smart.
              </span>
            </h1>
            <p className="max-w-[300px] text-sm font-medium leading-relaxed text-slate-300/90">
              Snap a photo of your dish — AI will calculate calories and macros, and your Tamagotchi pet will keep your streak going.
            </p>
          </div>

          <ul className="space-y-2.5">
            {[
              { icon: Camera, title: 'Photo food scanner', sub: 'calories and macros in seconds' },
              { icon: Flame, title: 'Streaks and streak days', sub: 'motivation every day' },
              { icon: Users, title: 'Friends and reactions', sub: 'losing weight together is more fun' },
              { icon: TrendingUp, title: 'Progress analytics', sub: 'weight, water, workouts' },
            ].map((f) => (
              <li
                key={f.title}
                className="flex items-center space-x-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-md transition-colors hover:border-emerald-400/30 hover:bg-white/[0.07]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                  <f.icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-extrabold text-white">{f.title}</p>
                  <p className="truncate text-xs font-medium text-slate-400">{f.sub}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Data in Supabase cloud · no secrets in Git</span>
          </div>
        </aside>

        {/* Phone frame */}
        <div className="relative flex h-full w-full max-w-[430px] flex-1 justify-center xl:flex-none">
          {/* glow under the phone */}
          <div aria-hidden className="absolute inset-x-8 top-1/2 hidden h-3/4 -translate-y-1/2 rounded-full bg-emerald-500/20 blur-[90px] xl:block" />
          <div className="phone-frame relative flex h-full max-h-full w-full flex-col overflow-hidden bg-[#FAF8F5] shadow-2xl xl:h-[860px] xl:max-h-[92vh] xl:rounded-[46px] xl:border-[10px] xl:border-[#0C1512] xl:shadow-[0_50px_140px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.09),0_0_90px_-18px_rgba(16,185,129,0.45)]">
            {/* speaker notch on desktop only */}
            <div aria-hidden className="absolute left-1/2 top-2.5 z-50 hidden h-[22px] w-[110px] -translate-x-1/2 items-center justify-center rounded-full bg-[#0C1512] xl:flex">
              <div className="h-[5px] w-10 rounded-full bg-white/15" />
            </div>
            {children}
          </div>

          {/* floating chips around the phone (2xl only) */}
          <div aria-hidden className="pointer-events-none absolute -left-24 top-24 hidden 2xl:block">
            <div className="animate-float rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
              <p className="text-xl">📸</p>
              <p className="mt-1 text-[11px] font-extrabold text-white">−320 kcal</p>
              <p className="text-[10px] font-medium text-slate-400">lunch recognized</p>
            </div>
          </div>
          <div aria-hidden className="pointer-events-none absolute -right-24 top-1/3 hidden 2xl:block">
            <div className="animate-float-delayed rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
              <p className="text-xl">🔥</p>
              <p className="mt-1 text-[11px] font-extrabold text-white">19 days in a row</p>
              <p className="text-[10px] font-medium text-slate-400">streak is growing</p>
            </div>
          </div>
          <div aria-hidden className="pointer-events-none absolute -right-20 bottom-28 hidden 2xl:block">
            <div className="animate-float rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
              <p className="text-xl">🥑</p>
              <p className="mt-1 text-[11px] font-extrabold text-white">P 32 · F 14 · C 26</p>
              <p className="text-[10px] font-medium text-slate-400">daily balance</p>
            </div>
          </div>
        </div>

        {/* Right tips panel */}
        <aside className="no-scrollbar hidden max-h-full min-h-0 w-[300px] shrink-0 flex-col space-y-4 overflow-y-auto xl:flex *:first:mt-auto *:last:mb-auto">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
            <div className="flex items-center space-x-2">
              <MousePointerClick className="h-4 w-4 text-emerald-300" />
              <p className="text-[13px] font-black text-white">How to use</p>
            </div>
            <ol className="mt-3 space-y-2.5 text-xs font-medium leading-relaxed text-slate-300">
              <li className="flex gap-2"><span className="font-black text-emerald-300">1.</span> Tap “Scanner” and take a photo of your plate</li>
              <li className="flex gap-2"><span className="font-black text-emerald-300">2.</span> Check macros and save to your diary</li>
              <li className="flex gap-2"><span className="font-black text-emerald-300">3.</span> Ask the AI coach what to eat in the evening</li>
            </ol>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-400/10 px-3 py-2.5 text-[11px] font-bold text-emerald-200">
              <ScanLine className="h-4 w-4 shrink-0" />
              The central camera button is the main entry
            </div>
          </div>

          <div className="rounded-3xl border border-amber-300/15 bg-gradient-to-br from-amber-400/15 to-orange-500/10 p-5 backdrop-blur-xl">
            <div className="flex items-center space-x-2">
              <Flame className="h-4 w-4 fill-amber-300 text-amber-300" />
              <p className="text-[13px] font-black text-white">Tip of the day</p>
            </div>
            <p className="mt-2 text-xs font-medium leading-relaxed text-amber-100/90">
              Hit your protein goal (1.8 g per kg of weight) — this keeps your streak longer and hunger away.
            </p>
          </div>

          <p className="px-1 text-center text-[11px] font-semibold text-slate-600">
            Opens full-screen on phones
          </p>
        </aside>
      </div>
    </div>
  );
};
