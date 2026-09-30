import { supabase } from '../src/lib/supabase';
import { safeLocalStorageSet } from './store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  timestamp?: number;
}

export interface NutritionistChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const LOCAL_STORAGE_KEY = 'nutrimint_chats_v1';
const ACTIVE_CHAT_KEY = 'nutrimint_active_chat_id';

/** Row shape of the `chats` table in Supabase. */
interface ChatRow {
  id: string;
  user_id: string;
  title: string | null;
  messages: unknown;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Guest-mode placeholders ('u1', 'user_<ts>'): live locally only.
 * Only a real uid is written to the cloud.
 */
function isPlaceholderUid(u?: string | null): boolean {
  if (!u) return true;
  const s = String(u);
  return s === 'u1' || s === 'USER' || /^user_\d+$/.test(s);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// chats.user_id is a uuid column: non-UUID (guest, legacy Firebase-uid) gives
// PostgREST 400. Such chats stay local-only.
function isRealUid(u?: string | null): boolean {
  if (!u || isPlaceholderUid(u)) return false;
  return UUID_RE.test(String(u).trim());
}

function mapRowToSession(row: ChatRow, fallbackUserId?: string): NutritionistChatSession | null {
  if (!row || !row.id || !Array.isArray(row.messages)) return null;
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : fallbackUserId || 'u1',
    title: row.title || 'Coach chat',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    messages: row.messages as ChatMessage[],
  };
}

/**
 * Generate a new default chat session for a user
 */
export function createDefaultChat(userProfileName?: string, userId?: string): NutritionistChatSession {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  return {
    id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    userId: userId || 'u1',
    title: `New chat (${dateStr})`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    messages: [
      {
        id: 'msg_' + Date.now(),
        role: 'assistant',
        content: `Hi, ${userProfileName || 'friend'}! 🥑 I'm your personal AI Coach-Nutritionist.\n\nIn this chat I'll remember our whole conversation and context. Ask any question about diet, recipes, calories or workouts!`,
        time: timeStr,
        timestamp: Date.now(),
      },
    ],
  };
}

/**
 * Load chats from LocalStorage first for instant, zero-latency render
 */
export function loadChatsFromLocalStorage(userId?: string): NutritionistChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed: NutritionistChatSession[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (userId && userId !== 'u1') {
          const userSpecific = parsed.filter((c) => c.userId === userId || c.userId === 'u1');
          return userSpecific.length > 0 ? userSpecific : parsed;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse local chats:', e);
  }
  return [];
}

/**
 * Save chats to LocalStorage
 */
export function saveChatsToLocalStorage(chats: NutritionistChatSession[]) {
  safeLocalStorageSet(LOCAL_STORAGE_KEY, chats);
}

/**
 * Fetch all chats for the user from the Supabase `chats` table.
 * Only own chats (user_id == uid): old 'u1' chats stay local-only.
 */
export async function fetchChatsFromFirebase(userId?: string): Promise<NutritionistChatSession[]> {
  try {
    // Guest without auth: live locally only, no network calls.
    if (!isRealUid(userId)) return loadChatsFromLocalStorage(userId);
    const uid = String(userId);
    const { data, error } = await supabase
      .from('chats')
      .select('id, user_id, title, messages, created_at, updated_at')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const chats: NutritionistChatSession[] = [];
    const rows = (data ?? []) as ChatRow[];
    for (const row of rows) {
      const session = mapRowToSession(row, uid);
      if (session) chats.push(session);
    }

    // Sort by updatedAt descending (newest activity first)
    chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (chats.length > 0) {
      saveChatsToLocalStorage(chats);
      return chats;
    }
  } catch (err) {
    console.warn('Error fetching chats from Supabase:', err);
  }

  return loadChatsFromLocalStorage(userId);
}

/**
 * Real-time subscription to user's chat sessions in Supabase
 */
export function subscribeToUserChats(
  userId: string,
  onUpdate: (chats: NutritionistChatSession[]) => void
): () => void {
  try {
    // Guest: no realtime — quiet no-op.
    if (!isRealUid(userId)) return () => {};
    const uid = String(userId);
    const channel = supabase
      .channel(`chats-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `user_id=eq.${uid}` },
        async () => {
          try {
            const { data, error } = await supabase
              .from('chats')
              .select('id, user_id, title, messages, created_at, updated_at')
              .eq('user_id', uid)
              .order('updated_at', { ascending: false })
              .limit(50);
            if (error) throw error;

            const chats: NutritionistChatSession[] = [];
            const rows = (data ?? []) as ChatRow[];
            for (const row of rows) {
              const session = mapRowToSession(row, uid);
              if (session) chats.push(session);
            }

            chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            if (chats.length > 0) {
              saveChatsToLocalStorage(chats);
              onUpdate(chats);
            }
          } catch (err) {
            console.warn('Supabase chats subscription refetch error:', err);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Failed to setup Supabase chats subscription:', err);
    return () => {};
  }
}

/**
 * Sync a single chat session to the Supabase `chats` table.
 * Old 'u1' chats stay local-only: a real uid is written to the cloud.
 */
export async function syncChatToFirebase(chat: NutritionistChatSession) {
  try {
    const uid = chat.userId;
    if (!isRealUid(uid)) return;
    const payload = {
      id: chat.id,
      user_id: uid,
      title: chat.title || 'Consultation',
      messages: (chat.messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        time: m.time,
        timestamp: m.timestamp || Date.now(),
      })),
      created_at: chat.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('chats').upsert(payload);
    if (error) throw error;
  } catch (err) {
    console.warn('Error syncing chat session to Supabase:', err);
  }
}

/**
 * Delete a chat session from the Supabase `chats` table
 */
export async function deleteChatFromFirebase(chatId: string) {
  try {
    const { error } = await supabase.from('chats').delete().eq('id', chatId);
    if (error) throw error;
  } catch (err) {
    console.warn('Error deleting chat from Supabase:', err);
  }
}

export function getActiveChatId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

export function setActiveChatId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_CHAT_KEY, id);
  } catch {
    // ignore
  }
}
