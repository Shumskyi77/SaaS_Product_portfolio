'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X } from 'lucide-react';
import { DISH_LIMIT } from '../lib/dishQuota';

interface AiLimitPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Dish limit reached" popup: in the open demo build
 * only DISH_LIMIT dishes can be added (by any method).
 */
export const AiLimitPopup: React.FC<AiLimitPopupProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="relative bg-gradient-to-br from-[#0AB68B] to-teal-600 px-6 pb-6 pt-6 text-center">
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 text-white transition-colors hover:bg-white/30 cursor-pointer"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/20 shadow-inner backdrop-blur-sm">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <h3 className="mt-3 text-lg font-black tracking-tight text-white">
              Limit reached
            </h3>
            <p className="mt-1 text-xs font-bold text-emerald-100">
              Demo version · free: {DISH_LIMIT} dish
            </p>
          </div>

          {/* Body */}
          <div className="space-y-4 px-6 py-5 text-center">
            <p className="text-sm font-medium leading-relaxed text-slate-600">
              You have already added your free dish.
              You cannot add more dishes in the demo version.
            </p>

            <button
              onClick={onClose}
              className="w-full rounded-2xl bg-[#0AB68B] py-3.5 text-sm font-black text-white shadow-lg shadow-[#0AB68B]/30 transition-all hover:bg-[#089e78] active:scale-[0.99] cursor-pointer"
            >
              Got it
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
