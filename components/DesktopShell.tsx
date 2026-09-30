'use client';

import React from 'react';

interface DesktopShellProps {
  children: React.ReactNode;
}

/**
 * DesktopShell — a minimal desktop wrapper that shows only the phone.
 *
 * Mobile (<xl): the phone fills the screen with no extra chrome.
 * Desktop (xl+): an atmospheric dark background (gradient, grid, soft glow) with the
 * phone frame centered. There is deliberately no marketing copy, feature lists,
 * tip cards or floating labels — the phone alone is the whole presentation.
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
        {/* Only the phone frame is shown — no side panels, copy or floating labels. */}
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
        </div>
      </div>
    </div>
  );
};
