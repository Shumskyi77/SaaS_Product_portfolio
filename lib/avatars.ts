// Preset avatars collection & avatar helpers for Foodvisor

export interface AvatarPreset {
  id: string;
  name: string;
  category: 'fitness' | 'characters' | 'lifestyle' | 'fun';
  url: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // Fitness & Sport
  {
    id: 'fit-runner',
    name: 'Runner',
    category: 'fitness',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'fit-athlete-m',
    name: 'Athlete',
    category: 'fitness',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'fit-yoga',
    name: 'Yoga',
    category: 'fitness',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'fit-crossfit',
    name: 'Crossfit',
    category: 'fitness',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'fit-cyclist',
    name: 'Cyclist',
    category: 'fitness',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'fit-trainer',
    name: 'Trainer',
    category: 'fitness',
    url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=240&auto=format&fit=crop&q=80',
  },

  // Lifestyle & Food
  {
    id: 'life-chef',
    name: 'Chef',
    category: 'lifestyle',
    url: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'life-nutritionist',
    name: 'Nutritionist',
    category: 'lifestyle',
    url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'life-smoothie',
    name: 'Smoothie master',
    category: 'lifestyle',
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'life-meditation',
    name: 'Zen',
    category: 'lifestyle',
    url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=240&auto=format&fit=crop&q=80',
  },

  // Expressive 3D & Characters
  {
    id: 'char-shiba',
    name: 'Shiba Inu',
    category: 'characters',
    url: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'char-cat',
    name: 'Gourmet cat',
    category: 'characters',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'char-panda',
    name: 'Fit panda',
    category: 'characters',
    url: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef6?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'char-champion',
    name: 'Champion',
    category: 'characters',
    url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'char-energy',
    name: 'Energy',
    category: 'characters',
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80',
  },
  {
    id: 'char-future',
    name: 'AI Biohacker',
    category: 'characters',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=240&auto=format&fit=crop&q=80',
  },
];

export const DEFAULT_AVATAR = AVATAR_PRESETS[0].url;

/**
 * Compresses an image file client-side via HTML5 canvas to a lightweight base64 data URL
 * so it fits easily in Firestore / localStorage without quota or payload size issues.
 */
export async function compressImageFile(file: File, maxDim = 320, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
