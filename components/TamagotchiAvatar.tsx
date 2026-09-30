'use client';

import React from 'react';
import { motion, TargetAndTransition, Transition } from 'motion/react';
import { TamagotchiBreed, TamagotchiMood } from '../types/tamagotchi';
import { getTamagotchiImage } from '../lib/tamagotchiAssets';

interface TamagotchiAvatarProps {
  breed: TamagotchiBreed;
  mood?: TamagotchiMood;
  customSrc?: string;
  className?: string;
  animate?: TargetAndTransition;
  transition?: Transition;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export const TamagotchiAvatar: React.FC<TamagotchiAvatarProps> = ({
  breed,
  mood = 'happy',
  customSrc,
  className = 'w-full h-full',
  animate,
  transition,
  alt = 'Tamagotchi Pet',
}) => {
  const imageSource = customSrc || getTamagotchiImage(breed, mood);

  return (
    <motion.img
      src={imageSource}
      alt={alt}
      className={`object-contain filter drop-shadow-md select-none ${className}`}
      animate={animate}
      transition={transition}
      referrerPolicy="no-referrer"
    />
  );
};
