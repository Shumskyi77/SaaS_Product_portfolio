/**
 * Fast client-side image feature analyzer for intelligent fallback & context enrichment.
 * Analyzes dominant colors, brightness, and warmth to estimate food category.
 */

export interface ImageVisualContext {
  dominantTone: 'green' | 'yellow' | 'red_brown' | 'orange' | 'white_beige' | 'dark' | 'neutral';
  estimatedCategoryHint: string;
}

export function extractImageVisualContext(imgElementOrDataUrl: string | HTMLImageElement): Promise<ImageVisualContext> {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val: ImageVisualContext) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    // 1.5s watchdog timeout
    const timeout = setTimeout(() => {
      safeResolve({ dominantTone: 'neutral', estimatedCategoryHint: '' });
    }, 1500);

    try {
      if (typeof window === 'undefined') {
        clearTimeout(timeout);
        return safeResolve({ dominantTone: 'neutral', estimatedCategoryHint: '' });
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          const size = 64; // Downscale to 64x64 for instant pixel sampling
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return safeResolve({ dominantTone: 'neutral', estimatedCategoryHint: '' });
          }

          ctx.drawImage(img, 0, 0, size, size);
          const imgData = ctx.getImageData(0, 0, size, size).data;

          let rTotal = 0;
          let gTotal = 0;
          let bTotal = 0;
          let pixelCount = 0;

          let greenCount = 0;
          let yellowCount = 0;
          let redBrownCount = 0;
          let orangeCount = 0;
          let whiteBeigeCount = 0;

          // Sample center region (food is usually centered)
          const startX = 12;
          const endX = 52;
          const startY = 12;
          const endY = 52;

          for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
              const idx = (y * size + x) * 4;
              const r = imgData[idx];
              const g = imgData[idx + 1];
              const b = imgData[idx + 2];

              rTotal += r;
              gTotal += g;
              bTotal += b;
              pixelCount++;

              // Color classification in RGB space
              if (g > r + 15 && g > b + 15 && g > 60) {
                greenCount++; // Green salad, vegetables, herbs
              } else if (r > 160 && g > 140 && b < 110) {
                yellowCount++; // Eggs, cheese, pasta, fries, corn, omelet
              } else if (r > 180 && g > 90 && b < 70) {
                orangeCount++; // Salmon, carrots, soup, curry
              } else if (r > 120 && r > g + 20 && r > b + 20) {
                redBrownCount++; // Meat, steak, burger, tomato sauce
              } else if (r > 180 && g > 175 && b > 160) {
                whiteBeigeCount++; // Rice, porridge, chicken breast, bread, yogurt
              }
            }
          }

          let dominantTone: ImageVisualContext['dominantTone'] = 'neutral';
          let estimatedCategoryHint = '';

          const maxVotes = Math.max(greenCount, yellowCount, redBrownCount, orangeCount, whiteBeigeCount);

          if (maxVotes > pixelCount * 0.18) {
            if (maxVotes === greenCount) {
              dominantTone = 'green';
              estimatedCategoryHint = 'Fresh vegetable and greens salad';
            } else if (maxVotes === yellowCount) {
              dominantTone = 'yellow';
              estimatedCategoryHint = 'Omelet with cheese and toast';
            } else if (maxVotes === orangeCount) {
              dominantTone = 'orange';
              estimatedCategoryHint = 'Grilled salmon steak';
            } else if (maxVotes === redBrownCount) {
              dominantTone = 'red_brown';
              estimatedCategoryHint = 'Juicy beef steak with sides';
            } else if (maxVotes === whiteBeigeCount) {
              dominantTone = 'white_beige';
              estimatedCategoryHint = 'Oatmeal with fruit';
            }
          }

          safeResolve({ dominantTone, estimatedCategoryHint });
        } catch {
          safeResolve({ dominantTone: 'neutral', estimatedCategoryHint: '' });
        }
      };

      img.onerror = () => {
        clearTimeout(timeout);
        safeResolve({ dominantTone: 'neutral', estimatedCategoryHint: '' });
      };

      if (typeof imgElementOrDataUrl === 'string') {
        img.src = imgElementOrDataUrl;
      }
    } catch {
      clearTimeout(timeout);
      safeResolve({ dominantTone: 'neutral', estimatedCategoryHint: '' });
    }
  });
}
