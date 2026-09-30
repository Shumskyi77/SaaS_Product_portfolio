import express from 'express';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import dotenv from 'dotenv';
// dotenv/config reads only `.env`; the project stores keys in `.env.local`
// (Vite picks it up automatically, Express does not). Load it without overwriting
// already-set environment variables.
dotenv.config({ path: '.env.local' });
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { calculateRealFoodNutrition } from './lib/nutritionEngine';
// The single cloud data store is Supabase (the client talks to it directly).
// This express server keeps the local db.json file as a dev fallback for /api.
// Auth for backend requests: compare uid from the Supabase access token (Authorization: Bearer)
// with the uid in the body/query. Without this anyone could write/read other people's diaries (IDOR).
import { getRequestUid } from './lib/serverAuth';

// Local disk persistence for reliable friend & calorie tracking across sessions
const DATA_FILE = path.join(process.cwd(), 'data', 'db.json');

interface StoredDb {
  users: Record<string, any>;
  friendships: Record<string, { id: string; userA: string; userB: string; users: string[]; createdAt: string }>;
  meals: Record<string, any>;
  reactions: Record<string, { id: string; mealId: string; fromUserId: string; emoji: string; createdAt: string }>;
  diaries?: Record<string, { userId: string; calendarMeals: Record<string, any>; updatedAt: string }>;
  weights?: Record<string, { id: string; userId: string; date: string; weight: number; updatedAt: string }>;
  workouts?: Record<string, any>;
}

function loadDb(): StoredDb {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const cleanUsers: Record<string, any> = {};
      Object.entries(data.users || {}).forEach(([uid, u]: [string, any]) => {
        if (!['user_anna', 'user_maxim', 'user_elena'].includes(uid)) {
          cleanUsers[uid] = u;
        }
      });
      const cleanFriendships: Record<string, any> = {};
      Object.entries(data.friendships || {}).forEach(([fId, f]: [string, any]) => {
        if (!['user_anna', 'user_maxim', 'user_elena'].some((m) => fId.includes(m))) {
          cleanFriendships[fId] = f;
        }
      });
      const cleanMeals: Record<string, any> = {};
      Object.entries(data.meals || {}).forEach(([mId, m]: [string, any]) => {
        if (!['user_anna', 'user_maxim', 'user_elena'].includes(m.userId) && !mId.startsWith('m_anna_') && !mId.startsWith('m_maxim_') && !mId.startsWith('m_elena_')) {
          cleanMeals[mId] = m;
        }
      });
      return {
        users: cleanUsers,
        friendships: cleanFriendships,
        meals: cleanMeals,
        reactions: data.reactions || {},
        diaries: data.diaries || {},
        weights: data.weights || {},
        workouts: data.workouts || {},
      };
    }
  } catch (e) {
    console.warn('Error reading data file, initializing fresh:', e);
  }
  return { users: {}, friendships: {}, meals: {}, reactions: {}, diaries: {}, weights: {}, workouts: {} };
}

function saveDb(db: StoredDb) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error saving data file:', e);
  }
}

const inMemoryDb = loadDb();


async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS middleware for flexible hosting setups
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ==========================================
  // USER PROFILES & FRIEND CODE SYNC ENDPOINTS
  // ==========================================

  // Deployment diagnostics: which backend is responding.
  // Open in browser: https://<host>/api/health
  app.get('/api/health', async (_req, res) => {
    try {
      return res.json({
        ok: true,
        backend: 'nutrigem-express',
        version: 'supabase-direct-1',
        store: 'supabase-direct',
        time: new Date().toISOString(),
      });
    } catch (e: any) {
      return res.status(200).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post('/api/users/profile', async (req, res) => {
    try {
      const profile = req.body;
      if (!profile || !profile.uid) {
        return res.status(400).json({ error: 'User UID is required' });
      }

      const uid = String(profile.uid);
      // Owner-check: writing someone else's profile under someone else's uid is forbidden (IDOR).
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== uid) return res.status(403).json({ error: 'Forbidden' });
      const existing = inMemoryDb.users[uid] || {};
      const cleanUid = uid.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const derivedCode = `NM-${cleanUid.length >= 6 ? cleanUid.slice(0, 6) : (cleanUid + 'ABCDEF').slice(0, 6)}`;
      const friendCode = profile.friendCode || existing.friendCode || derivedCode;

      const updated = {
        ...existing,
        ...profile,
        uid,
        friendCode,
        updatedAt: new Date().toISOString(),
      };

      inMemoryDb.users[uid] = updated;

      // If a placeholder was created when a friend added this friendCode before this user synced:
      // Migrate ONLY `uid_*` placeholders (real Supabase uids never
      // start like that): otherwise any logged-in user could send someone else's friendCode
      // and wipe someone else's profile, pulling friendships over to themselves.
      Object.entries(inMemoryDb.users).forEach(([otherUid, otherUser]) => {
        if (otherUid !== uid && otherUid.startsWith('uid_') && (otherUser.friendCode === friendCode || otherUser.uid === `uid_${cleanUid.slice(0, 6).toLowerCase()}`)) {
          // Migrate all friendships from otherUid to real uid
          Object.values(inMemoryDb.friendships).forEach((f) => {
            if (f.users && f.users.includes(otherUid)) {
              f.users = f.users.map((u) => (u === otherUid ? uid : u));
              if (f.userA === otherUid) f.userA = uid;
              if (f.userB === otherUid) f.userB = uid;
            }
          });
          delete inMemoryDb.users[otherUid];
        }
      });

      saveDb(inMemoryDb);

      return res.json({ success: true, profile: updated, friendCode });
    } catch (e: any) {
      console.error('Save user profile error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Helper to aggregate all calendar meals for a user across all data sources
  const getUserCalendarMeals = (userId: string): Record<string, any[]> => {
    const calendar: Record<string, any[]> = {};
    if (!userId) return calendar;

    const ingestMeal = (m: any, defaultDate?: string) => {
      if (!m || !m.id) return;
      const cleanDate = (m.date || defaultDate || new Date().toISOString().split('T')[0]).slice(0, 10);
      if (!calendar[cleanDate]) {
        calendar[cleanDate] = [];
      }
      const existingIdx = calendar[cleanDate].findIndex((x) => x.id === m.id);
      const cleanItem = {
        ...m,
        id: String(m.id),
        userId: String(m.userId || userId),
        date: cleanDate,
        time: m.time || '12:00',
        title: String(m.title || 'Dish'),
        type: m.type || m.mealType || 'lunch',
        calories: Math.max(0, Math.round(Number(m.calories) || 0)),
        protein: Math.max(0, Math.round(Number(m.protein) || 0)),
        fat: Math.max(0, Math.round(Number(m.fat) || 0)),
        carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
        portionGrams: Number(m.portionGrams) || 100,
        notes: m.notes || m.remarks || undefined,
        imageUrl: m.imageUrl || undefined,
      };

      if (existingIdx >= 0) {
        calendar[cleanDate][existingIdx] = cleanItem;
      } else {
        calendar[cleanDate].push(cleanItem);
      }
    };

    // 1. From diaries[userId].calendarMeals
    const diaryCal = inMemoryDb.diaries?.[userId]?.calendarMeals;
    if (diaryCal && typeof diaryCal === 'object') {
      Object.entries(diaryCal).forEach(([dKey, list]) => {
        if (Array.isArray(list)) {
          list.forEach((m) => ingestMeal(m, dKey));
        }
      });
    }

    // 2. From users[userId].calendarMeals or dailyLogs
    const uCal = inMemoryDb.users?.[userId]?.calendarMeals || inMemoryDb.users?.[userId]?.dailyLogs;
    if (uCal && typeof uCal === 'object') {
      Object.entries(uCal).forEach(([dKey, list]) => {
        if (Array.isArray(list)) {
          list.forEach((m) => ingestMeal(m, dKey));
        } else if (list && typeof list === 'object' && Array.isArray((list as any).meals)) {
          (list as any).meals.forEach((m: any) => ingestMeal(m, dKey));
        }
      });
    }

    // 3. From individual inMemoryDb.meals table
    if (inMemoryDb.meals && typeof inMemoryDb.meals === 'object') {
      Object.values(inMemoryDb.meals).forEach((m) => {
        if (m && m.userId === userId) {
          ingestMeal(m);
        }
      });
    }

    // Sort meals within each date chronologically
    Object.keys(calendar).forEach((dKey) => {
      calendar[dKey].sort((a, b) => (b.time || '00:00').localeCompare(a.time || '00:00'));
    });

    return calendar;
  };

  // Helper to get flat meals list for a user
  const getUserMeals = (userId: string, dateStr?: string): any[] => {
    const calendar = getUserCalendarMeals(userId);
    let allMeals: any[] = [];
    Object.entries(calendar).forEach(([dKey, list]) => {
      if (dateStr) {
        if (dKey === dateStr.slice(0, 10)) {
          allMeals.push(...list);
        }
      } else {
        allMeals.push(...list);
      }
    });

    // Sort descending by date, then time
    allMeals.sort((a, b) => {
      const dateA = a.date ? a.date.slice(0, 10) : '';
      const dateB = b.date ? b.date.slice(0, 10) : '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return (b.time || '00:00').localeCompare(a.time || '00:00');
    });

    return allMeals;
  };

  app.get('/api/users/profile/:userId', async (req, res) => {
    try {
      const uid = req.params.userId;
      // Reading requires login (mirrors RLS: read if auth).
      // Friends read each other's calendars, so no owner-check here.
      if (!(await getRequestUid(req))) return res.status(401).json({ error: 'Unauthorized' });
      let user = inMemoryDb.users[uid];
      if (!user) {
        // Exact matches only: prefix search on uid allowed enumerating
        // other people's uids by brute-forcing prefixes.
        user = Object.values(inMemoryDb.users).find(
          (u) => u.friendCode === uid || u.friendCode === `NM-${uid}` || u.uid === uid
        );
      }
      if (user) {
        const calendarMeals = getUserCalendarMeals(user.uid);
        return res.json({ ...user, calendarMeals, dailyLogs: calendarMeals });
      }
      return res.status(404).json({ error: 'User not found' });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Diary sync endpoints: stores full calendar meal logs for friends
  app.post('/api/users/diary', async (req, res) => {
    try {
      const { userId, calendarMeals } = req.body;
      if (!userId || !calendarMeals || typeof calendarMeals !== 'object') {
        return res.status(400).json({ error: 'Missing userId or calendarMeals' });
      }
      // Owner-check (IDOR): overwriting someone else's diary is forbidden.
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

      if (!inMemoryDb.diaries) inMemoryDb.diaries = {};
      inMemoryDb.diaries[userId] = {
        userId,
        calendarMeals,
        updatedAt: new Date().toISOString(),
      };

      if (inMemoryDb.users[userId]) {
        inMemoryDb.users[userId].calendarMeals = calendarMeals;
        inMemoryDb.users[userId].dailyLogs = calendarMeals;
      }

      // Ingest all individual meals into inMemoryDb.meals for cross-compatibility
      Object.entries(calendarMeals).forEach(([dateStr, meals]) => {
        if (Array.isArray(meals)) {
          meals.forEach((m: any) => {
            if (m && m.id) {
              const cleanDate = (m.date || dateStr).slice(0, 10);
              inMemoryDb.meals[m.id] = {
                ...m,
                id: String(m.id),
                userId: String(userId),
                date: cleanDate,
                portionGrams: Number(m.portionGrams) || 100,
                calories: Math.max(0, Math.round(Number(m.calories) || 0)),
                protein: Math.max(0, Math.round(Number(m.protein) || 0)),
                fat: Math.max(0, Math.round(Number(m.fat) || 0)),
                carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
                updatedAt: new Date().toISOString(),
              };
            }
          });
        }
      });

      saveDb(inMemoryDb);
      return res.json({ success: true, count: Object.keys(calendarMeals).length });
    } catch (e: any) {
      console.error('Save diary error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/users/diary/:userId', async (req, res) => {
    try {
      const uid = req.params.userId;
      if (!(await getRequestUid(req))) return res.status(401).json({ error: 'Unauthorized' });
      // Aggregating all in-memory sources (diaries + users.calendarMeals + meals).
      const calendarMeals = getUserCalendarMeals(uid);
      const diary = {
        userId: uid,
        calendarMeals,
        updatedAt: new Date().toISOString(),
      };
      return res.json(diary);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Search users by code, UID, partial name, or email
  app.get('/api/users/search', async (req, res) => {
    try {
      if (!(await getRequestUid(req))) return res.status(401).json({ error: 'Unauthorized' });
      const q = String(req.query.q || '').trim();
      const currentUserId = String(req.query.currentUserId || '').trim();

      if (!q) {
        return res.json([]);
      }

      // Cyrillic to Latin mapping for code input
      let rawInput = q.toUpperCase().trim();
      // Replace Cyrillic "НМ-" or Latin "HM-" with "NM-"
      rawInput = rawInput
        .replace(/^НМ-/, 'NM-')
        .replace(/^HM-/, 'NM-')
        .replace(/^[#@]/, '')
        .replace(/Н/g, 'N')
        .replace(/М/g, 'M')
        .replace(/Т/g, 'T')
        .replace(/О/g, 'O')
        .replace(/Р/g, 'P')
        .replace(/А/g, 'A')
        .replace(/В/g, 'B')
        .replace(/С/g, 'C')
        .replace(/Е/g, 'E')
        .replace(/Х/g, 'X')
        .replace(/К/g, 'K');

      const term = rawInput.replace(/^[#@]/, '');
      const cleanNoPrefix = term.replace(/^NM-/, '');
      const qLower = q.toLowerCase();

      const exactMatches: any[] = [];
      const partialMatches: any[] = [];
      const addedUids = new Set<string>();

      const allUsers = Object.values(inMemoryDb.users);

      for (const u of allUsers) {
        if (!u.uid || (currentUserId && u.uid === currentUserId)) continue;

        const uCode = (u.friendCode || '').toUpperCase().replace(/^[#@]/, '');
        const uCodeNoPrefix = uCode.replace(/^NM-/, '');
        const uUidUpper = u.uid.toUpperCase();
        const uName = (u.name || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();

        const isExact =
          uCode === term ||
          uCode === `NM-${cleanNoPrefix}` ||
          uCode === cleanNoPrefix ||
          uCodeNoPrefix === cleanNoPrefix ||
          uUidUpper === term ||
          uUidUpper === cleanNoPrefix ||
          u.uid === q ||
          u.friendCode === q;

        const isPartial =
          uCode.includes(term) ||
          uCode.includes(cleanNoPrefix) ||
          uUidUpper.includes(term) ||
          uName.includes(qLower) ||
          uEmail.includes(qLower);

        if (isExact) {
          if (!addedUids.has(u.uid)) {
            addedUids.add(u.uid);
            exactMatches.push(u);
          }
        } else if (isPartial) {
          if (!addedUids.has(u.uid)) {
            addedUids.add(u.uid);
            partialMatches.push(u);
          }
        }
      }

      const results = [...exactMatches, ...partialMatches];

      return res.json(results);
    } catch (e: any) {
      console.error('Search users error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Get community friend suggestions
  app.get('/api/friends/suggestions', async (req, res) => {
    try {
      if (!(await getRequestUid(req))) return res.status(401).json({ error: 'Unauthorized' });
      const currentUserId = String(req.query.currentUserId || '').trim();
      const suggestions = Object.values(inMemoryDb.users)
        .filter((u) => u.uid && u.uid !== currentUserId)
        .slice(0, 10);
      return res.json(suggestions);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // FRIENDSHIP ENDPOINTS
  // ==========================================

  app.get('/api/friends', async (req, res) => {
    try {
      const currentUserId = String(req.query.userId || '').trim();
      if (!currentUserId) {
        return res.json([]);
      }
      // Own friend list — only for yourself (otherwise enumerating userId leaks the graph).
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== currentUserId) return res.status(403).json({ error: 'Forbidden' });

      const friendUids: string[] = [];
      Object.values(inMemoryDb.friendships).forEach((f: any) => {
        const usersArr: string[] =
          Array.isArray(f.users) && f.users.length > 0 ? f.users : [f.userA, f.userB].filter(Boolean);
        if (usersArr.includes(currentUserId)) {
          const other = usersArr.find((u) => u !== currentUserId);
          if (other && !friendUids.includes(other)) friendUids.push(other);
        } else if (typeof f.id === 'string' && f.id.includes(currentUserId)) {
          const parts = String(f.id).split('_');
          const cand = parts.find((p) => p && p !== currentUserId);
          if (cand && !friendUids.includes(cand)) friendUids.push(cand);
        }
      });

      const friends = friendUids.map((fUid) => {
        const u = inMemoryDb.users[fUid];
        const calendarMeals = getUserCalendarMeals(fUid);
        if (u) {
          const av = u.avatarUrl || u.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80';
          return {
            ...u,
            uid: u.uid || fUid,
            targetCalories: Number(u.targetCalories) || 2000,
            avatar: av,
            avatarUrl: av,
            goal: u.goal || 'Lose weight',
            currentWeight: Number(u.currentWeight) || 60,
            startWeight: Number(u.startWeight || u.currentWeight || 60),
            targetWeight: Number(u.targetWeight || 55),
            streakDays: Number(u.streakDays) || 1,
            calendarMeals,
            dailyLogs: calendarMeals,
          };
        }
        return {
          uid: fUid,
          name: 'Friend',
          friendCode: `NM-${String(fUid).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`,
          targetCalories: 2000,
          streakDays: 1,
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          goal: 'Lose weight',
          currentWeight: 60,
          startWeight: 60,
          targetWeight: 55,
          calendarMeals,
          dailyLogs: calendarMeals,
        };
      });

      return res.json(friends);
    } catch (e: any) {
      console.error('Fetch friends error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Dedicated Friends Activity Feed endpoint (aggregation from memory).
  // Reading requires login, own graph only for yourself (like /api/friends).
  app.get('/api/friends/feed', async (req, res) => {
    try {
      const currentUserId = String(req.query.userId || '').trim();
      if (!currentUserId) {
        return res.json([]);
      }
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== currentUserId) return res.status(403).json({ error: 'Forbidden' });

      const friendUids: string[] = [];
      Object.values(inMemoryDb.friendships).forEach((f) => {
        if (f.users && f.users.includes(currentUserId)) {
          const other = f.users.find((u) => u !== currentUserId);
          if (other && !friendUids.includes(other)) {
            friendUids.push(other);
          }
        }
      });

      const feedItems: any[] = [];
      friendUids.forEach((fUid) => {
        const u = inMemoryDb.users[fUid];
        const friendName = u?.name || 'Friend';
        const friendAvatar = u?.avatarUrl || u?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
        const friendTag = u?.friendCode || `NM-${fUid.slice(0, 6).toUpperCase()}`;

        const meals = getUserMeals(fUid);
        meals.forEach((m) => {
          feedItems.push({
            friendId: fUid,
            friendName,
            friendAvatar,
            friendTag,
            date: m.date,
            meal: {
              id: m.id,
              mealType: m.type || m.mealType || 'lunch',
              title: m.title || 'Meal',
              time: m.time || '12:00',
              calories: Math.max(0, Math.round(Number(m.calories) || 0)),
              protein: Math.max(0, Math.round(Number(m.protein) || 0)),
              fat: Math.max(0, Math.round(Number(m.fat) || 0)),
              carbs: Math.max(0, Math.round(Number(m.carbs) || 0)),
              portionGrams: Number(m.portionGrams) || 100,
              remarks: m.notes || m.remarks || undefined,
              imageUrl: m.imageUrl || undefined,
              date: m.date,
            },
          });
        });
      });

      // Sort feed items by date desc, then time desc
      feedItems.sort((a, b) => {
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date);
        }
        return (b.meal.time || '00:00').localeCompare(a.meal.time || '00:00');
      });

      return res.json(feedItems);
    } catch (e: any) {
      console.error('Fetch friends feed error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/friends/add', async (req, res) => {
    try {
      const { currentUserId, friendUid } = req.body;
      if (!currentUserId || !friendUid || currentUserId === friendUid) {
        return res.status(400).json({ error: 'Invalid user IDs' });
      }
      // Only a friendship participant can create it under their own name.
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== String(currentUserId)) return res.status(403).json({ error: 'Forbidden' });

      const friendshipId = [currentUserId, friendUid].sort().join('_');
      inMemoryDb.friendships[friendshipId] = {
        id: friendshipId,
        userA: currentUserId,
        userB: friendUid,
        users: [currentUserId, friendUid],
        createdAt: new Date().toISOString(),
      };

      saveDb(inMemoryDb);
      return res.json({ success: true, friendshipId });
    } catch (e: any) {
      console.error('Add friend error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/friends/delete', async (req, res) => {
    try {
      const { currentUserId, friendUid } = req.body;
      if (!currentUserId || !friendUid) {
        return res.status(400).json({ error: 'Missing user ID' });
      }
      // Only a friendship participant can delete.
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== String(currentUserId)) return res.status(403).json({ error: 'Forbidden' });

      const friendshipId = [currentUserId, friendUid].sort().join('_');
      delete inMemoryDb.friendships[friendshipId];

      saveDb(inMemoryDb);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('Delete friend error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // MEALS & NUTRITION TRACKING ENDPOINTS
  // ==========================================

  app.get('/api/meals', async (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      const date = String(req.query.date || '').trim();

      if (!userId) {
        return res.json([]);
      }
      // Reading requires login (friends pull each other's feeds; mirrors RLS).
      if (!(await getRequestUid(req))) return res.status(401).json({ error: 'Unauthorized' });

      // Memory is aggregated (diaries + users.calendarMeals/dailyLogs + meals).
      const byId = new Map<string, any>();
      getUserMeals(userId).forEach((m: any) => {
        if (m?.id) byId.set(String(m.id), m);
      });
      let userMeals = Array.from(byId.values());

      if (date) {
        const cleanDate = date.slice(0, 10);
        userMeals = userMeals.filter((m) => (m.date ? m.date.slice(0, 10) === cleanDate : false));
      }

      return res.json(userMeals);
    } catch (e: any) {
      console.error('Fetch meals error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/meals', async (req, res) => {
    try {
      const meal = req.body;
      if (!meal || !meal.id || !meal.userId) {
        return res.status(400).json({ error: 'Invalid meal payload' });
      }
      // Only your own dishes can be written (IDOR).
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== String(meal.userId)) return res.status(403).json({ error: 'Forbidden' });

      const cleanDate = meal.date ? meal.date.slice(0, 10) : new Date().toISOString().split('T')[0];
      const cleanMeal = {
        id: String(meal.id),
        userId: String(meal.userId),
        title: String(meal.title || 'Dish'),
        type: meal.type || meal.mealType || 'lunch',
        portionGrams: Math.max(1, Math.round(Number(meal.portionGrams) || 100)),
        calories: Math.max(0, Math.round(Number(meal.calories) || 0)),
        protein: Math.max(0, Math.round(Number(meal.protein) || 0)),
        fat: Math.max(0, Math.round(Number(meal.fat) || 0)),
        carbs: Math.max(0, Math.round(Number(meal.carbs) || 0)),
        fiber: Math.max(0, Math.round(Number(meal.fiber) || 0)),
        time: meal.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        date: cleanDate,
        imageUrl: meal.imageUrl || undefined,
        ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : undefined,
        aiAnalysis: meal.aiAnalysis || undefined,
        notes: meal.notes || meal.remarks || undefined,
        updatedAt: new Date().toISOString(),
      };

      if (!inMemoryDb.meals) inMemoryDb.meals = {};
      inMemoryDb.meals[cleanMeal.id] = cleanMeal;

      // Also ensure it is synced into inMemoryDb.diaries[userId].calendarMeals
      if (!inMemoryDb.diaries) inMemoryDb.diaries = {};
      if (!inMemoryDb.diaries[cleanMeal.userId]) {
        inMemoryDb.diaries[cleanMeal.userId] = {
          userId: cleanMeal.userId,
          calendarMeals: {},
          updatedAt: new Date().toISOString(),
        };
      }
      if (!inMemoryDb.diaries[cleanMeal.userId].calendarMeals[cleanDate]) {
        inMemoryDb.diaries[cleanMeal.userId].calendarMeals[cleanDate] = [];
      }
      const existingIdx = inMemoryDb.diaries[cleanMeal.userId].calendarMeals[cleanDate].findIndex(
        (m: any) => m.id === cleanMeal.id
      );
      if (existingIdx >= 0) {
        inMemoryDb.diaries[cleanMeal.userId].calendarMeals[cleanDate][existingIdx] = cleanMeal;
      } else {
        inMemoryDb.diaries[cleanMeal.userId].calendarMeals[cleanDate].push(cleanMeal);
      }

      saveDb(inMemoryDb);

      return res.json({ success: true, meal: cleanMeal });
    } catch (e: any) {
      console.error('Save meal error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/meals/:mealId', async (req, res) => {
    try {
      const mealId = req.params.mealId;
      // Delete only your own: compare the in-memory owner.
      // Not found is an idempotent success (retry of an already-deleted item).
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      const memMeal: any = inMemoryDb.meals[mealId];
      const ownerId = memMeal?.userId && String(memMeal.userId);
      if (ownerId && String(ownerId) !== authUid) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      delete inMemoryDb.meals[mealId];
      // Also scrub calendar copies, otherwise GET /api/meals resurrects the deleted item
      // from the diary (same resurrection bug as in the Firestore branch — clean everywhere).
      const scrubCalendar = (dict: any) => {
        if (!dict || typeof dict !== 'object') return false;
        let changed = false;
        Object.entries(dict).forEach(([dKey, val]: [string, any]) => {
          if (Array.isArray(val)) {
            const f = val.filter((m: any) => m?.id !== mealId);
            if (f.length !== val.length) {
              changed = true;
              dict[dKey] = f;
            }
          } else if (val && typeof val === 'object' && Array.isArray(val.meals)) {
            const f = val.meals.filter((m: any) => m?.id !== mealId);
            if (f.length !== val.meals.length) {
              changed = true;
              dict[dKey] = { ...val, meals: f };
            }
          }
        });
        return changed;
      };
      Object.values(inMemoryDb.diaries || {}).forEach((d: any) => {
        if (d?.calendarMeals) scrubCalendar(d.calendarMeals);
      });
      Object.values(inMemoryDb.users || {}).forEach((u: any) => {
        if (u?.calendarMeals) scrubCalendar(u.calendarMeals);
        if (u?.dailyLogs) scrubCalendar(u.dailyLogs);
      });
      saveDb(inMemoryDb);
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // REACTIONS ENDPOINTS
  // ==========================================

  const canonicalMealId = (raw: string): string => {
    const m = String(raw || '').match(/^\d{4}-\d{2}-\d{2}_(.+)$/);
    return m ? m[1] : String(raw || '');
  };

  app.post('/api/reactions', async (req, res) => {
    try {
      const { mealId, fromUserId, emoji } = req.body;
      if (!mealId || !fromUserId || !emoji) {
        return res.status(400).json({ error: 'Missing reaction fields' });
      }
      // Reactions only under your own name.
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== String(fromUserId)) return res.status(403).json({ error: 'Forbidden' });

      const reactionId = `${mealId}_${fromUserId}_${emoji}`;
      inMemoryDb.reactions[reactionId] = {
        id: reactionId,
        mealId: String(mealId),
        fromUserId,
        emoji,
        createdAt: new Date().toISOString(),
      };

      saveDb(inMemoryDb);
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/reactions', async (req, res) => {
    try {
      const mealId = String(req.query.mealId || (req.body as any)?.mealId || '');
      const fromUserId = String(req.query.fromUserId || (req.body as any)?.fromUserId || '');
      const emoji = String(req.query.emoji || (req.body as any)?.emoji || '');
      if (!mealId || !fromUserId || !emoji) {
        return res.status(400).json({ error: 'Missing reaction fields' });
      }
      // Only your own reaction can be removed.
      const authUid = await getRequestUid(req);
      if (!authUid) return res.status(401).json({ error: 'Unauthorized' });
      if (authUid !== fromUserId) return res.status(403).json({ error: 'Forbidden' });
      delete inMemoryDb.reactions[`${mealId}_${fromUserId}_${emoji}`];
      const legacy = (inMemoryDb.reactions as any)[`${mealId}_${fromUserId}`];
      if (legacy && (legacy.emoji === emoji || legacy.mealId === mealId)) {
        delete (inMemoryDb.reactions as any)[`${mealId}_${fromUserId}`];
      }
      saveDb(inMemoryDb);
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/reactions', async (req, res) => {
    try {
      if (!(await getRequestUid(req))) return res.status(401).json({ error: 'Unauthorized' });
      const mealIdsParam = String(req.query.mealIds || '');
      const mealIds = mealIdsParam ? mealIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

      const map: Record<string, string[]> = {};
      const push = (storedMealId: string, emoji: string) => {
        const canon = canonicalMealId(storedMealId);
        let target: string | null = null;
        for (const q of mealIds) {
          if (canonicalMealId(q) === canon) { target = q; break; }
        }
        if (!target) {
          if (mealIds.length === 0) target = storedMealId;
          else return;
        }
        if (!map[target]) map[target] = [];
        if (!map[target].includes(emoji)) map[target].push(emoji);
      };
      Object.values(inMemoryDb.reactions).forEach((r) => {
        if (r && r.mealId && r.emoji) push(String(r.mealId), String(r.emoji));
      });

      return res.json(map);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // WEIGHT TRACKING ENDPOINTS
  // ==========================================

  app.get('/api/weights', (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.json([]);
      const logs = Object.values(inMemoryDb.weights || {})
        .filter((w) => w && w.userId === userId)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return res.json(logs);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/weights', (req, res) => {
    try {
      const { userId, date, weight } = req.body;
      if (!userId || !date) return res.status(400).json({ error: 'Missing userId or date' });
      if (!inMemoryDb.weights) inMemoryDb.weights = {};
      const id = `${userId}_${date}`;
      const entry = { id, userId, date, weight: Number(weight) || 0, updatedAt: new Date().toISOString() };
      inMemoryDb.weights[id] = entry;
      if (inMemoryDb.users[userId]) {
        inMemoryDb.users[userId].currentWeight = Number(weight) || 0;
      }
      saveDb(inMemoryDb);
      return res.json({ success: true, entry });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/weights', (req, res) => {
    try {
      const userId = String(req.query.userId || req.body?.userId || '').trim();
      const date = String(req.query.date || req.body?.date || '').trim();
      if (!userId || !date) return res.status(400).json({ error: 'Missing userId or date' });
      const id = `${userId}_${date}`;
      if (inMemoryDb.weights) {
        delete inMemoryDb.weights[id];
        saveDb(inMemoryDb);
      }
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ==========================================
  // WORKOUT TRACKING ENDPOINTS
  // ==========================================

  app.get('/api/workouts', (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      const date = String(req.query.date || '').trim();
      if (!userId) return res.json([]);
      let list = Object.values(inMemoryDb.workouts || {}).filter((w) => w && w.userId === userId);
      if (date) {
        const cleanDate = date.slice(0, 10);
        list = list.filter((w) => w && (w.date === cleanDate || (w.date && w.date.slice(0, 10) === cleanDate)));
      }
      return res.json(list);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/workouts', (req, res) => {
    try {
      const workout = req.body;
      if (!workout || !workout.id || !workout.userId) {
        return res.status(400).json({ error: 'Missing workout id or userId' });
      }
      if (!inMemoryDb.workouts) inMemoryDb.workouts = {};
      inMemoryDb.workouts[workout.id] = { ...workout, updatedAt: new Date().toISOString() };
      saveDb(inMemoryDb);
      return res.json({ success: true, workout });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/workouts/:id', (req, res) => {
    try {
      const id = req.params.id;
      if (inMemoryDb.workouts) {
        delete inMemoryDb.workouts[id];
        saveDb(inMemoryDb);
      }
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Helper to initialize backend Gemini client safely
  function getGeminiClient() {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Primary model sequence with highest availability and multi-model fallback
  async function generateGeminiContentWithFallback(contents: any, timeoutMs = 15000, config?: any) {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('GEMINI_API_KEY environment variable is not configured');
    }

    // Ensure contents has correct parts structure for multimodal requests
    let formattedContents: any = contents;
    if (Array.isArray(contents)) {
      formattedContents = {
        parts: contents.map((item) => {
          if (typeof item === 'string') {
            return { text: item };
          }
          return item;
        }),
      };
    }

    const candidateModels = [
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
    ];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const geminiPromise = ai.models.generateContent({
          model,
          contents: formattedContents,
          ...(config ? { config } : {}),
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout on model ${model}`)), timeoutMs)
        );

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);
        if (response && response.text !== undefined) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} issue (${err?.message || err}), trying next candidate...`);
      }
    }
    throw lastError || new Error('All Gemini model candidates failed');
  }

  // 0. Open Food Facts Barcode Lookup Endpoint (/api/openfoodfacts/barcode/:barcode)
  app.get('/api/openfoodfacts/barcode/:barcode', async (req, res) => {
    try {
      const barcode = req.params.barcode.trim().replace(/\D/g, '');
      if (!barcode || barcode.length < 4) {
        return res.status(400).json({ error: 'Invalid barcode' });
      }

      const userAgent = 'NutriGem - Web - Version 1.0 - dania.szumski@gmail.com';
      const offUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
      
      try {
        const response = await fetch(offUrl, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          if (data.status === 1 && data.product) {
            return res.json(data.product);
          }
        }
      } catch (e) {
        console.warn('OFF v2 fetch error in server:', e);
      }

      // Try v0 fallback
      try {
        const v0Res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, {
          headers: { 'User-Agent': userAgent },
        });
        if (v0Res.ok) {
          const v0Data = (await v0Res.json()) as any;
          if (v0Data.status === 1 && v0Data.product) {
            return res.json(v0Data.product);
          }
        }
      } catch (e) {
        console.warn('OFF v0 fetch error in server:', e);
      }

      return res.status(404).json({ error: 'Product not found in Open Food Facts' });
    } catch (err: any) {
      console.error('Open Food Facts API Proxy Error:', err);
      return res.status(500).json({ error: 'Failed to query Open Food Facts' });
    }
  });

  // 0.2 AI Barcode Fallback Estimator (/api/gemini/estimate-barcode)
  app.post('/api/gemini/estimate-barcode', async (req, res) => {
    try {
      const { barcode } = req.body;
      const clean = String(barcode || '').trim().replace(/\D/g, '');
      if (!clean) {
        return res.status(400).json({ error: 'Barcode required' });
      }

      const prompt = `You are a food product database and nutritionist.
The user scanned a product barcode: "${clean}".
If this EAN/UPC barcode matches a known popular brand or product (e.g. chocolate, soda, cottage cheese, cheese, milk, snack, cookies, yogurt, sports nutrition), identify the exact name and realistic nutrition per 100 g.
If the barcode is unknown, guess the most likely food product from the code format and return quality nutrition data.

Return STRICTLY valid JSON without markdown:
{
  "barcode": "${clean}",
  "title": "Product name in English",
  "brand": "Brand (if known)",
  "portionGrams": 100,
  "caloriesPer100g": 150,
  "proteinPer100g": 5,
  "fatPer100g": 3,
  "carbsPer100g": 20,
  "fiberPer100g": 2,
  "calories": 150,
  "protein": 5,
  "fat": 3,
  "carbs": 20,
  "fiber": 2,
  "nutriscore": "B",
  "ingredients": ["Ingredient 1", "Ingredient 2"]
}`;

      const aiResponse = await generateGeminiContentWithFallback(prompt, 8000);
      const text = aiResponse.text || '';
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return res.json(parsed);
    } catch (err: any) {
      console.warn('Gemini barcode estimate error:', err);
      return res.status(500).json({ error: 'Failed to estimate barcode product' });
    }
  });

  // 0.5 AI Voice Speech-to-Dishes Parser Endpoint (/api/gemini/parse-voice)
  app.post('/api/gemini/parse-voice', async (req, res) => {
    try {
      const { speechText, preferredMealType } = req.body;
      if (!speechText || typeof speechText !== 'string' || speechText.trim().length === 0) {
        return res.status(400).json({ error: 'Speech text is required' });
      }

      const prompt = `You are a highly accurate AI nutritionist and dietitian.
The user dictated by voice what they ate:
"${speechText}"

Current default meal: "${preferredMealType || 'lunch'}".

Your task:
1. Extract every separate dish/product and drink the user mentioned.
2. For each dish determine:
   - "title": exact and clear name in English (e.g.: "Oatmeal with milk and banana", "Sugar-free latte", "2-egg omelette with bacon").
   - "mealType": meal category ("breakfast", "lunch", "dinner", or "snack"), detect from the user's speech context or use the default "${preferredMealType || 'lunch'}".
   - "portionGrams": realistic portion weight in grams (number).
   - "calories": calories for this portion (kcal, number).
   - "protein": protein in grams (g, number).
   - "fat": fat in grams (g, number).
   - "carbs": carbs in grams (g, number).
   - "fiber": fiber in grams (g, number).
   - "ingredients": array of main ingredients (2-4 lines in English).
   - "aiComment": brief health comment (1 sentence).

Return STRICTLY valid JSON (no markdown wrappers):
{
  "dishes": [
    {
      "title": "Dish name",
      "mealType": "breakfast",
      "portionGrams": 200,
      "calories": 250,
      "protein": 12,
      "fat": 8,
      "carbs": 30,
      "fiber": 3,
      "ingredients": ["Ingredient 1", "Ingredient 2"],
      "aiComment": "Balanced source of energy"
    }
  ],
  "speechSummary": "Brief recap of the recognized diet"
}`;

      const response = await generateGeminiContentWithFallback(prompt);
      const raw = response.text || '';
      const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (parsed && Array.isArray(parsed.dishes) && parsed.dishes.length > 0) {
        return res.json(parsed);
      }
      throw new Error('No dishes extracted');
    } catch (error) {
      console.warn('API Gemini Parse Voice error or fallback:', error);
      const text = String(req.body?.speechText || '');
      
      // Fallback local smart sentence segmentation
      const items = text
        .split(/,|\.|\n| and | as well as | with | plus /i)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);

      const fallbackDishes = (items.length > 0 ? items : [text]).map((item, idx) => {
        const nut = calculateRealFoodNutrition(item);
        return {
          title: nut.title,
          mealType: req.body?.preferredMealType || 'lunch',
          portionGrams: nut.portionGrams,
          calories: nut.calories,
          protein: nut.protein,
          fat: nut.fat,
          carbs: nut.carbs,
          fiber: nut.fiber,
          ingredients: [nut.title],
          aiComment: 'Calculated from product composition',
        };
      });

      return res.json({
        dishes: fallbackDishes,
        speechSummary: `Recognized entries: ${fallbackDishes.length}`,
      });
    }
  });

  // 1. Analyze Fridge API Endpoint (/api/gemini/analyze-fridge)
  app.post('/api/gemini/analyze-fridge', async (req, res) => {
    try {
      const { base64Image } = req.body;
      const mimeType = base64Image?.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const cleanBase64 = (base64Image || '').replace(/^data:image\/\w+;base64,/, '');

      const response = await generateGeminiContentWithFallback([
        { inlineData: { mimeType, data: cleanBase64 } },
        'Carefully study this photo of fridge contents or groceries. List the recognized food ingredients in English, comma-separated. Reply with ONLY the ingredient list.',
      ]);

      const text = response.text || '';
      const ingredients = text.split(/,|\n/).map((i: string) => i.trim()).filter((i: string) => i.length > 1);
      return res.json({
        ingredients: ingredients.length > 0 ? ingredients : [],
      });
    } catch (error) {
      console.error('API Gemini Analyze Fridge Error:', error);
      return res.status(500).json({ error: 'Failed to analyze fridge photo. Make sure GEMINI_API_KEY is configured.' });
    }
  });

  // 2. Generate Recipe API Endpoint (/api/gemini/generate-recipe)
  app.post('/api/gemini/generate-recipe', async (req, res) => {
    try {
      const { category, maxCalories, ingredients } = req.body;
      const prompt = `You are a professional AI chef and dietitian.
Create a balanced detailed recipe dish in English.
Parameters:
- Category: ${category}
- Max calories: ${maxCalories} kcal
- Available ingredients: ${ingredients || 'any healthy foods'}

Return STRICTLY valid JSON (no markdown \`\`\`json tags) with the following structure:
{
  "title": "Dish name",
  "description": "Brief description",
  "prepTimeMinutes": 10,
  "cookTimeMinutes": 15,
  "servings": 1,
  "calories": 420,
  "protein": 32,
  "fat": 12,
  "carbs": 35,
  "fiber": 7,
  "tags": ["Quick", "Protein"],
  "imageUrl": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
  "ingredients": [
    {"name": "Ingredient 1", "amount": "100g", "calories": 120}
  ],
  "instructions": [
    "Step 1...",
    "Step 2..."
  ]
}`;

      const response = await generateGeminiContentWithFallback(prompt);
      const raw = response.text || '';
      const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      return res.json(JSON.parse(cleanJson));
    } catch (error) {
      console.error('API Gemini Generate Recipe Error:', error);
      return res.status(500).json({ error: 'Failed to generate recipe. Make sure GEMINI_API_KEY is configured.' });
    }
  });

  // 3. Workout Calories API Endpoint (/api/gemini/workout)
  app.post('/api/gemini/workout', async (req, res) => {
    try {
      const { workoutQuery, userWeightKg } = req.body;
      const prompt = `The user described their workout: "${workoutQuery}".
User weight: ${userWeightKg || 70} kg.
Calculate burned calories.
Return STRICTLY valid JSON without markdown:
{
  "title": "Short workout name in English",
  "durationMinutes": 30,
  "caloriesBurned": 280,
  "summary": "Brief praise and calculation"
}`;

      const response = await generateGeminiContentWithFallback(prompt);
      const raw = response.text || '';
      const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      return res.json(JSON.parse(cleanJson));
    } catch (error) {
      console.error('API Gemini Workout Error:', error);
      return res.status(500).json({ error: 'Failed to calculate workout calories. Make sure GEMINI_API_KEY is configured.' });
    }
  });

  // 4. AI Coach / Nutritionist Chat Endpoint (/api/gemini/coach)
  app.post('/api/gemini/coach', async (req, res) => {
    try {
      const { userMessage, history, userProfile, dailySummary } = req.body;
      const systemPrompt = `You are an erudite, certified AI Coach-Nutritionist for the NutriMint app (a Foodvisor analogue).
Your task is to give personal recommendations to the user, referencing their REAL physiological profile, REAL diary nutrition data for today and the WHOLE PREVIOUS HISTORY OF THIS DIALOG.

User profile:
- Name: ${userProfile?.name || 'Friend'}
- Height: ${userProfile?.height || 175} cm, Age: ${userProfile?.age || 25} years, Gender: ${userProfile?.gender || 'not specified'}
- Current weight: ${userProfile?.currentWeight || 70} kg, Target weight: ${userProfile?.targetWeight || 65} kg
- Daily calorie goal (base): ${userProfile?.targetCalories || 2000} kcal
- Daily macro goals: Protein ${userProfile?.targetProtein || 140}g, Fat ${userProfile?.targetFat || 60}g, Carbs ${userProfile?.targetCarbs || 220}g
- Water norm: ${userProfile?.targetWater || 2000} ml

Today's diary data:
- Total calories eaten: ${dailySummary?.totalCalories || 0} kcal
- Burned in workouts: +${dailySummary?.totalBurned || 0} kcal
- Effective calorie limit (Base + Workouts): ${dailySummary?.effectiveTarget || userProfile?.targetCalories || 2000} kcal
- Active workouts today: ${dailySummary?.workoutListString || 'No workout entries for today yet'}
- Important rule: When workouts are added the effective limit increases, and when workouts are deleted the effective limit automatically decreases.
- Actual macros: Protein ${dailySummary?.totalProtein || 0}g, Fat ${dailySummary?.totalFat || 0}g, Carbs ${dailySummary?.totalCarbs || 0}g
- Today's dish entries: ${dailySummary?.mealListString || 'No entries for today yet'}
- Water drunk: ${dailySummary?.waterIntake || 0} ml

Instructions:
- Reply politely, kindly, professionally and to the point in English.
- Use emoji (🥗, 🥑, 💪, 🔥, 💧) for emphasis.
- Carefully remember and consider the user's previous remarks and your answers in this chat.
- Actively use concrete numbers and dishes from the user's diary when they ask about calories, diet, dinner, advice or progress.
- Give practical and actionable nutrition and workout advice.
- Answer length: 1-3 short paragraphs or a structured list.`;

      let fullPrompt = `${systemPrompt}\n\n`;
      if (history && Array.isArray(history) && history.length > 0) {
        fullPrompt += `=== CHAT HISTORY ===\n`;
        history.forEach((h: any) => {
          fullPrompt += `${h.role === 'user' ? 'User' : 'AI-Coach'}: ${h.content}\n`;
        });
        fullPrompt += `=== END OF HISTORY ===\n\n`;
      }
      fullPrompt += `New user message: "${userMessage}"\nAI-Coach reply:`;

      const response = await generateGeminiContentWithFallback(fullPrompt);
      return res.json({ reply: response.text || 'Great question! I am ready to help you plan your diet.' });
    } catch (error) {
      console.warn('API Gemini Coach Fallback (API Key missing or upstream issue):', error);
      const { userMessage, userProfile, dailySummary } = req.body || {};
      const name = userProfile?.name || 'Friend';
      const eaten = dailySummary?.totalCalories || 0;
      const target = dailySummary?.effectiveTarget || userProfile?.targetCalories || 2000;
      const remaining = Math.max(0, target - eaten);
      const burned = dailySummary?.totalBurned || 0;
      const protein = dailySummary?.totalProtein || 0;
      const targetProtein = userProfile?.targetProtein || 140;

      let fallbackReply = `Hello, ${name}! 🥗\n\n`;
      const q = (userMessage || '').toLowerCase();

      if (q.includes('calor') || q.includes('norm') || q.includes('limit') || q.includes('how much') || q.includes('how many')) {
        fallbackReply += `📊 **Today's nutrition status:**\n• Eaten: **${eaten} kcal** of **${target} kcal** (remaining: **${remaining} kcal**).\n• Burned through activity: **+${burned} kcal**.\n• Protein: **${protein}g** / ${targetProtein}g.\n\n`;
        if (remaining > 350) {
          fallbackReply += `💡 *Recommendation:* You have a great calorie buffer! For your next meal, a portion of lean protein (chicken breast, fish or cottage cheese) with vegetables and complex carbs would be perfect.`;
        } else if (remaining > 0) {
          fallbackReply += `💡 *Recommendation:* You are almost at your daily norm. If you feel like a snack — pick a light protein snack or fresh vegetables.`;
        } else {
          fallbackReply += `💡 *Recommendation:* You have hit your calorie norm for today. Remember to drink clean water and keep the balance! 💧`;
        }
      } else if (q.includes('dinner') || q.includes('lunch') || q.includes('breakfast') || q.includes('what to eat') || q.includes('eat') || q.includes('meal')) {
        fallbackReply += `🍽️ **Meal recommendation:**\nFor a perfect balance I recommend:\n1. **Protein:** Salmon steak or roasted turkey breast (150-180g).\n2. **Fiber:** Fresh vegetable salad with a spoon of olive oil (200g).\n3. **Complex carbs:** Quinoa, brown rice or buckwheat (100g).\n\nYour remaining allowance: **${remaining} kcal**. The dish will fit your daily diet perfectly! ✨`;
      } else if (q.includes('run') || q.includes('workout') || q.includes('train') || q.includes('muscle') || q.includes('sport') || q.includes('exercise') || q.includes('gym')) {
        fallbackReply += `💪 **Activity and recovery tip:**\n• Regular workouts speed up metabolism and burn calories (already burned +${burned} kcal today).\n• To preserve muscle, aim for the protein norm (~1.6-2.0g per kg of weight).\n• Be sure to drink water before and after exercise! 💧`;
      } else {
        fallbackReply += `I have analyzed your food diary for today:\n• Eaten: **${eaten} / ${target} kcal** (remaining: **${remaining} kcal**)\n• Protein: **${protein}g** of **${targetProtein}g**\n• Water: **${dailySummary?.waterIntake || 0} ml**\n\nHow can I help? I can suggest a balanced dish recipe, break down macros or build a workout plan! 🥑`;
      }

      return res.json({ reply: fallbackReply });
    }
  });

  // 5. AI Calorie Calculator Endpoint (/api/gemini/calculate-calories)
  app.post('/api/gemini/calculate-calories', async (req, res) => {
    try {
      const { gender, age, height, currentWeight, targetWeight, weeklyGoal, activityLevel, dietType, additionalNotes } = req.body;
      const prompt = `You are a highly qualified sports dietitian and nutritionist.
The user asks to jointly calculate a personal daily calorie and macro norm.

User data:
- Gender: ${gender === 'male' ? 'Male' : 'Female'}
- Age: ${age || 25} years
- Height: ${height || 175} cm
- Current weight: ${currentWeight || 70} kg
- Target weight: ${targetWeight || 65} kg
- Activity level: ${activityLevel || 'moderate'}
- Diet type: ${dietType || 'Standard'}
- Additional notes: ${additionalNotes || 'none'}

Tasks:
1. Compute BMR (basal metabolic rate) and TDEE (daily calorie expenditure accounting for activity).
2. Calculate the target calorie norm (recommendedCalories) with a safe deficit for weight loss or surplus for weight gain.
3. Calculate optimal protein (recommendedProtein in grams), fat (recommendedFat in grams), carbs (recommendedCarbs in grams) and water (recommendedWater in ml).
4. Write a friendly, competent and motivating advice explanation (explanation) in English (2-3 sentences) breaking down the calculations.

Return the result STRICTLY as valid JSON (no markdown \`\`\`json tags):
{
  "recommendedCalories": 1850,
  "recommendedProtein": 135,
  "recommendedFat": 60,
  "recommendedCarbs": 190,
  "recommendedWater": 2300,
  "bmr": 1620,
  "tdee": 2200,
  "explanation": "Detailed nutritionist advice..."
}`;

      const response = await generateGeminiContentWithFallback(prompt);
      const raw = response.text || '';
      const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      return res.json(JSON.parse(cleanJson));
    } catch (error) {
      console.error('API Gemini Calculate Calories Error:', error);
      return res.status(500).json({ error: 'Failed to calculate calories with AI' });
    }
  });

  // 6. AI Food Photo Analyzer Endpoint (/api/gemini/analyze-food)
  app.post('/api/gemini/analyze-food', async (req, res) => {
    const { base64Image, userHint, userRemarks } = req.body;
    try {
      const parts: any[] = [];
      let hasImage = false;

      if (base64Image && typeof base64Image === 'string') {
        let mimeType = 'image/jpeg';
        let cleanBase64 = '';

        if (base64Image.startsWith('http://') || base64Image.startsWith('https://')) {
          try {
            const imgRes = await fetch(base64Image);
            if (imgRes.ok) {
              const arrayBuf = await imgRes.arrayBuffer();
              cleanBase64 = Buffer.from(arrayBuf).toString('base64');
              const rawCt = imgRes.headers.get('content-type') || '';
              if (rawCt.includes('png')) mimeType = 'image/png';
              else if (rawCt.includes('webp')) mimeType = 'image/webp';
              else mimeType = 'image/jpeg';
            }
          } catch (e) {
            console.warn('Failed to fetch image URL for base64:', e);
          }
        } else {
          if (base64Image.startsWith('data:image/png')) {
            mimeType = 'image/png';
          } else if (base64Image.startsWith('data:image/webp')) {
            mimeType = 'image/webp';
          } else {
            mimeType = 'image/jpeg';
          }
          cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
        }

        if (cleanBase64 && cleanBase64.length > 20) {
          parts.push({ inlineData: { mimeType, data: cleanBase64 } });
          hasImage = true;
        }
      }

      const combinedUserRemarks = [userRemarks, userHint].filter(Boolean).join('. ');

      const prompt = `You are an expert AI dietitian and nutritionist for the Foodvisor app.
Your task is to recognize with maximum accuracy ${hasImage ? 'the finished dish or products in the photo' : 'the dish from the description'}, estimate the real portion size in grams and calculate the exact nutritional value (Calories, Protein, Fat, Carbs, Fiber).

${hasImage ? 'Carefully identify:\n- Dish composition and visible components (meat, side, sauce, herbs, vegetables, oil, dressing).\n- Cooking method (pan-fried in oil, grilled, boiled, stewed, fresh raw).\n- Real portion weight in grams (usually 120-450g depending on size).\n' : ''}${
  combinedUserRemarks
    ? `\nUSER NOTES ON THE DISH: "${combinedUserRemarks}". You MUST account for them when calculating weight, calories and macros (e.g.: no oil, double portion, 3 eggs, with bread, no sugar, etc.)!\n`
    : ''
}

Nutrition calculation rules:
- Name ("title"): Natural, exact English culinary name (e.g.: "Fluffy 3-egg omelette with herbs", "Grilled salmon steak with vegetables", "Chicken Caesar salad", "Homemade vegetable soup with sour cream", "Pasta Carbonara").
- "portionGrams": Realistic weight of the whole portion in grams (number).
- "calories": Total calories for the whole portion (kcal).
- "protein": Protein per portion in grams.
- "fat": Fat per portion in grams.
- "carbs": Carbs per portion in grams.
- "fiber": Fiber per portion in grams.
- "ingredients": Array of 2-6 key recognized ingredients.
- "aiAnalysis": Brief (1-2 sentences) expert comment on benefits, macro balance and nutrients of the dish.
- "confidence": Recognition confidence in percent (integer 88-99).`;

      parts.push({ text: prompt });

      const ai = getGeminiClient();
      if (ai) {
        // Models in order of multimodal vision precision
        const candidateModels = hasImage
          ? ['gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']
          : ['gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

        for (const model of candidateModels) {
          try {
            const geminiPromise = ai.models.generateContent({
              model,
              contents: { parts },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: 'Dish name' },
                    portionGrams: { type: Type.NUMBER, description: 'Portion weight in grams' },
                    calories: { type: Type.NUMBER, description: 'Calories per portion' },
                    protein: { type: Type.NUMBER, description: 'Protein in grams' },
                    fat: { type: Type.NUMBER, description: 'Fat in grams' },
                    carbs: { type: Type.NUMBER, description: 'Carbs in grams' },
                    fiber: { type: Type.NUMBER, description: 'Fiber in grams' },
                    ingredients: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Ingredient list',
                    },
                    aiAnalysis: { type: Type.STRING, description: 'Nutritionist comment' },
                    confidence: { type: Type.INTEGER, description: 'Confidence percent from 85 to 99' },
                  },
                  required: [
                    'title',
                    'portionGrams',
                    'calories',
                    'protein',
                    'fat',
                    'carbs',
                    'fiber',
                    'ingredients',
                    'aiAnalysis',
                    'confidence',
                  ],
                },
              },
            });

            const timeoutMs = hasImage ? 25000 : 12000;
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout on model ${model}`)), timeoutMs)
            );

            const response: any = await Promise.race([geminiPromise, timeoutPromise]);
            const raw = response?.text || '';
            
            let parsed: any = null;
            try {
              let cleaned = raw.replace(/```json/gi, '').replace(/```javascript/gi, '').replace(/```/g, '').trim();
              const firstBrace = cleaned.indexOf('{');
              const lastBrace = cleaned.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1);
              }
              parsed = JSON.parse(cleaned);
            } catch (e) {
              console.warn(`JSON parse attempt failed for model ${model}:`, e);
            }

            if (parsed && parsed.title && parsed.calories !== undefined) {
              const portionGrams = Math.max(10, Math.round(Number(parsed.portionGrams) || 200));
              const calories = Math.max(10, Math.round(Number(parsed.calories) || 250));
              const protein = Math.max(0, Math.round((Number(parsed.protein) || 0) * 10) / 10);
              const fat = Math.max(0, Math.round((Number(parsed.fat) || 0) * 10) / 10);
              const carbs = Math.max(0, Math.round((Number(parsed.carbs) || 0) * 10) / 10);
              const fiber = Math.max(0, Math.round((Number(parsed.fiber) || 0) * 10) / 10);

              console.log(`✅ Gemini Vision (${model}) recognized food:`, parsed.title, `${calories} kcal, ${portionGrams}g`);

              return res.json({
                title: String(parsed.title).trim(),
                portionGrams,
                calories,
                protein,
                fat,
                carbs,
                fiber,
                ingredients: Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0
                  ? parsed.ingredients
                  : [parsed.title],
                aiAnalysis: parsed.aiAnalysis ? String(parsed.aiAnalysis) : 'Recognized with Foodvisor AI',
                confidence: Math.min(99, Math.max(80, Math.round(Number(parsed.confidence) || 97))),
              });
            }
          } catch (modelErr: any) {
            console.warn(`Model ${model} vision attempt failed (${modelErr?.message?.slice(0, 100) || modelErr}), trying next candidate...`);
          }
        }
      }
    } catch (error) {
      console.warn('AI analysis endpoint encountered error, using instant nutritional fallback:', error);
    }

    // Accurate instant local calculation fallback if all cloud models are unavailable
    const fallbackText = userRemarks || userHint || 'Dish from photo';
    const computed = calculateRealFoodNutrition(fallbackText, '');
    return res.json({
      ...computed,
      ingredients: [computed.title],
      aiAnalysis: 'Estimated with the Foodvisor nutritional food algorithm',
    });
  });

  // Vite middleware for dev or static files for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/data/db.json', '**/*.json'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
