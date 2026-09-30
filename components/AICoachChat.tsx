'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Plus,
  Trash2,
  ChevronDown,
  MessageSquare,
  X,
  Clock,
  Check,
  Sparkles,
  Edit2,
  RefreshCw,
  BrainCircuit,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types/user';
import { MealLog } from '../types/meal';
import { WorkoutLog, getLocalDateString } from '../lib/store';
import { calculateWorkoutCaloriesWithAI, askNutritionistWithAI } from '../lib/gemini';
import {
  NutritionistChatSession,
  ChatMessage,
  fetchChatsFromFirebase,
  syncChatToFirebase,
  deleteChatFromFirebase,
  createDefaultChat,
  loadChatsFromLocalStorage,
  saveChatsToLocalStorage,
  getActiveChatId,
  setActiveChatId,
  subscribeToUserChats,
} from '../lib/chatStore';

interface AICoachChatProps {
  userProfile: UserProfile;
  mealLogs: MealLog[];
  workoutLogs?: WorkoutLog[];
  selectedDate?: string;
  onAddWorkout?: (workout: WorkoutLog) => void;
  waterAmount?: number;
}

const QUICK_SUGGESTIONS = [
  '🥗 Suggest a light dinner under 450 kcal',
  '💪 How best to hit my protein goal today?',
  '🔥 I ran 5 km in 30 min, log it to my diary',
  '🥑 How many calories in half an avocado with an egg?',
];

export const AICoachChat: React.FC<AICoachChatProps> = ({
  userProfile,
  mealLogs,
  workoutLogs = [],
  selectedDate = getLocalDateString(),
  onAddWorkout,
  waterAmount = 0,
}) => {
  const currentUserId = userProfile?.uid || 'u1';
  const [chats, setChats] = useState<NutritionistChatSession[]>([]);
  const [activeChatId, setActiveId] = useState<string>('');
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');
  const messagesRef = useRef<HTMLDivElement | null>(null);

  // Initialize and subscribe to Firestore chats in real-time
  useEffect(() => {
    // 1. Instant local load
    const localChats = loadChatsFromLocalStorage(currentUserId);
    let initialActiveId = getActiveChatId();

    if (localChats.length > 0) {
      setChats(localChats);
      if (!initialActiveId || !localChats.some((c) => c.id === initialActiveId)) {
        initialActiveId = localChats[0].id;
      }
      setActiveId(initialActiveId);
      setActiveChatId(initialActiveId);
    } else {
      const defaultChat = createDefaultChat(userProfile.name, currentUserId);
      setChats([defaultChat]);
      setActiveId(defaultChat.id);
      setActiveChatId(defaultChat.id);
      saveChatsToLocalStorage([defaultChat]);
      syncChatToFirebase(defaultChat);
    }

    // 2. Fetch remote and subscribe to Firestore updates
    fetchChatsFromFirebase(currentUserId).then((remote) => {
      if (remote && remote.length > 0) {
        setChats(remote);
        setActiveId((prev) => (remote.some((c) => c.id === prev) ? prev : remote[0].id));
      }
    });

    const unsubscribe = subscribeToUserChats(currentUserId, (updatedRemoteChats) => {
      if (updatedRemoteChats && updatedRemoteChats.length > 0) {
        setChats(updatedRemoteChats);
        setActiveId((prev) =>
          updatedRemoteChats.some((c) => c.id === prev) ? prev : updatedRemoteChats[0].id
        );
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUserId, userProfile.name]);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const messages = activeChat ? activeChat.messages : [];
  const userMessagesCount = messages.filter((m) => m.role === 'user').length;

  const scrollToBottom = () => {
    // Scroll only the messages list itself. scrollIntoView() would also scroll every
    // scrollable ancestor — including the overflow-hidden desktop stage — which pushed
    // the whole phone frame out of view on desktop.
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const totalCalories = mealLogs.reduce((acc, m) => acc + m.calories, 0);
  const totalProtein = mealLogs.reduce((acc, m) => acc + m.protein, 0);
  const totalFat = mealLogs.reduce((acc, m) => acc + m.fat, 0);
  const totalCarbs = mealLogs.reduce((acc, m) => acc + m.carbs, 0);

  // Create a brand new clean chat session (Zero previous baggage)
  const handleCreateNewChat = () => {
    const newChat = createDefaultChat(userProfile.name, currentUserId);
    const updatedChats = [newChat, ...chats];
    setChats(updatedChats);
    setActiveId(newChat.id);
    setActiveChatId(newChat.id);
    saveChatsToLocalStorage(updatedChats);
    syncChatToFirebase(newChat);
    setIsSelectorOpen(false);
  };

  // Delete a chat session
  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (chats.length <= 1) {
      // Re-create a fresh chat if deleting the last one
      const newChat = createDefaultChat(userProfile.name, currentUserId);
      setChats([newChat]);
      setActiveId(newChat.id);
      setActiveChatId(newChat.id);
      saveChatsToLocalStorage([newChat]);
      syncChatToFirebase(newChat);
      await deleteChatFromFirebase(chatId);
      return;
    }

    const updated = chats.filter((c) => c.id !== chatId);
    setChats(updated);
    saveChatsToLocalStorage(updated);
    await deleteChatFromFirebase(chatId);

    if (activeChatId === chatId) {
      const nextId = updated[0].id;
      setActiveId(nextId);
      setActiveChatId(nextId);
    }
  };

  // Rename a chat session
  const handleSaveRename = async (chatId: string) => {
    if (!editTitleText.trim()) {
      setEditingChatId(null);
      return;
    }
    const updatedChats = chats.map((c) =>
      c.id === chatId ? { ...c, title: editTitleText.trim(), updatedAt: new Date().toISOString() } : c
    );
    setChats(updatedChats);
    saveChatsToLocalStorage(updatedChats);
    const targetChat = updatedChats.find((c) => c.id === chatId);
    if (targetChat) {
      await syncChatToFirebase(targetChat);
    }
    setEditingChatId(null);
  };

  // Select a chat
  const handleSelectChat = (chatId: string) => {
    setActiveId(chatId);
    setActiveChatId(chatId);
    setIsSelectorOpen(false);
  };

  // Send message
  const handleSendMessage = async (customPrompt?: string) => {
    const text = (customPrompt || inputMessage).trim();
    if (!text || isLoading || !activeChat) return;

    const userTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: 'usr_' + Date.now(),
      role: 'user',
      content: text,
      time: userTime,
      timestamp: Date.now(),
    };

    // Auto-derive clean title for new chat if it is the first question
    let newTitle = activeChat.title;
    if (
      (activeChat.title.startsWith('New chat') ||
        activeChat.title.startsWith('Consultation')) &&
      userMessagesCount === 0
    ) {
      newTitle = text.length > 32 ? text.slice(0, 30) + '...' : text;
    }

    const updatedMessages = [...activeChat.messages, userMsg];
    const updatedChat: NutritionistChatSession = {
      ...activeChat,
      title: newTitle,
      updatedAt: new Date().toISOString(),
      messages: updatedMessages,
    };

    const updatedChatsList = chats.map((c) => (c.id === activeChat.id ? updatedChat : c));
    setChats(updatedChatsList);
    saveChatsToLocalStorage(updatedChatsList);
    syncChatToFirebase(updatedChat);

    setInputMessage('');
    setIsLoading(true);

    const q = text.toLowerCase();
    const isWorkoutIntent =
      q.includes('run') ||
      q.includes('workout') ||
      q.includes('training') ||
      q.includes('swim') ||
      q.includes('cycl') ||
      q.includes('walk') ||
      q.includes('burn') ||
      q.includes('log it');

    if (isWorkoutIntent) {
      try {
        const workoutRes = await calculateWorkoutCaloriesWithAI(
          text,
          userProfile.currentWeight || 75
        );

        if (onAddWorkout) {
          const newWorkout: WorkoutLog = {
            id: 'w_' + Date.now(),
            userId: currentUserId,
            date: selectedDate,
            title: workoutRes.title,
            durationMinutes: workoutRes.durationMinutes,
            caloriesBurned: workoutRes.caloriesBurned,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          };
          onAddWorkout(newWorkout);
        }

        const botReply = `🔥 **Workout logged!**\n\n• Type: **${workoutRes.title}** (${workoutRes.durationMinutes} min)\n• Burned: **+${workoutRes.caloriesBurned} kcal**\n\n✨ Your daily calorie goal was automatically increased! 💪`;

        const assistantMsg: ChatMessage = {
          id: 'ast_' + Date.now(),
          role: 'assistant',
          content: botReply,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now(),
        };

        const finalMessages = [...updatedMessages, assistantMsg];
        const finalChat = { ...updatedChat, messages: finalMessages };
        const finalChatsList = chats.map((c) => (c.id === activeChat.id ? finalChat : c));

        setChats(finalChatsList);
        saveChatsToLocalStorage(finalChatsList);
        syncChatToFirebase(finalChat);
      } catch (err) {
        console.warn('Error processing workout in chat:', err);
      } finally {
        setIsLoading(false);
      }
    } else {
      try {
        const mealListString =
          mealLogs && mealLogs.length > 0
            ? mealLogs
                .map(
                  (m) =>
                    `${m.title} (${m.calories} kcal, P/F/C: ${m.protein}/${m.fat}/${m.carbs}g)`
                )
                .join(', ')
            : 'No meals logged for today yet';

        const totalBurned = workoutLogs.reduce((acc, w) => acc + (w.caloriesBurned || 0), 0);
        const effectiveTarget = (userProfile.targetCalories || 2000) + totalBurned;
        const workoutListString =
          workoutLogs && workoutLogs.length > 0
            ? workoutLogs.map((w) => `${w.title} (${w.durationMinutes} min, +${w.caloriesBurned} kcal)`).join(', ')
            : 'No active workouts for today';

        // Full context of this specific chat session
        const history = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const botReply = await askNutritionistWithAI({
          userMessage: text,
          history,
          userProfile: {
            name: userProfile.name,
            height: userProfile.height,
            currentWeight: userProfile.currentWeight,
            targetWeight: userProfile.targetWeight,
            age: userProfile.age,
            gender: userProfile.gender,
            targetCalories: userProfile.targetCalories,
            targetProtein: userProfile.targetProtein,
            targetFat: userProfile.targetFat,
            targetCarbs: userProfile.targetCarbs,
            targetWater: userProfile.targetWater,
          },
          dailySummary: {
            totalCalories,
            totalProtein,
            totalFat,
            totalCarbs,
            mealsCount: mealLogs.length,
            mealListString,
            waterIntake: waterAmount,
            totalBurned,
            effectiveTarget,
            workoutListString,
          },
        });

        const assistantMsg: ChatMessage = {
          id: 'ast_' + Date.now(),
          role: 'assistant',
          content: botReply,
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now(),
        };

        const finalMessages = [...updatedMessages, assistantMsg];
        const finalChat = { ...updatedChat, messages: finalMessages };
        const finalChatsList = chats.map((c) => (c.id === activeChat.id ? finalChat : c));

        setChats(finalChatsList);
        saveChatsToLocalStorage(finalChatsList);
        syncChatToFirebase(finalChat);
      } catch (err) {
        console.warn('Error fetching nutritionist response from Gemini:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col justify-between font-sans">
      {/* Top Header Bar with Chat Selector and Memory Status */}
      <div className="flex items-center justify-between gap-2 mb-2.5 shrink-0">
        <button
          onClick={() => setIsSelectorOpen(!isSelectorOpen)}
          className="flex-1 flex items-center justify-between bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 hover:border-[#00C29A]/40 px-3.5 py-2.5 rounded-2xl transition-all text-left shadow-2xs group"
        >
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-[#00C29A] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#00C29A]">
                  AI Coach
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  • {messages.length} msgs.
                </span>
              </div>
              <h3 className="font-bold text-xs text-slate-800 truncate">
                {activeChat ? activeChat.title : 'Consultation'}
              </h3>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="hidden text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">
              Chats ({chats.length})
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 group-hover:text-[#00C29A] transition-transform duration-200 ${
                isSelectorOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        <button
          onClick={handleCreateNewChat}
          className="flex items-center space-x-1.5 bg-[#00C29A] hover:bg-[#00A885] active:scale-95 text-white px-3.5 py-2.5 rounded-2xl font-bold text-xs shadow-xs transition-all shrink-0 cursor-pointer"
          title="Start a new chat from scratch"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden">New chat</span>
        </button>
      </div>

      {/* Chat Selector Modal / Dropdown */}
      <AnimatePresence>
        {isSelectorOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSelectorOpen(false)}
              className="fixed inset-0 bg-slate-900 z-40"
            />

            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className="absolute top-16 left-2 right-2 bg-white rounded-3xl border border-slate-200 shadow-2xl z-50 p-4 max-h-[70%] flex flex-col"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2.5">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-50 text-[#00C29A] flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">Your saved chats</h4>
                    <p className="text-[10px] text-slate-400">
                      In each chat the AI remembers its own history
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSelectorOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto space-y-2 pr-1 flex-1 no-scrollbar">
                {chats.map((c) => {
                  const isActive = c.id === activeChatId;
                  const lastMsg = c.messages[c.messages.length - 1];
                  const formattedDate = new Date(c.updatedAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectChat(c.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                        isActive
                          ? 'bg-[#E6F9F5] border-[#00C29A] text-slate-900 shadow-2xs'
                          : 'bg-white border-slate-100 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden mr-2 flex-1">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                            isActive ? 'bg-[#00C29A] text-white shadow-2xs' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </div>

                        <div className="overflow-hidden flex-1">
                          {editingChatId === c.id ? (
                            <div
                              className="flex items-center space-x-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editTitleText}
                                onChange={(e) => setEditTitleText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(c.id)}
                                className="w-full text-xs font-bold px-2 py-1 bg-white border border-[#00C29A] rounded-lg outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveRename(c.id)}
                                className="p-1 bg-[#00C29A] text-white rounded-lg text-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs truncate text-slate-900">{c.title}</span>
                              {isActive && <Check className="w-3.5 h-3.5 text-[#00C29A] shrink-0" />}
                            </div>
                          )}

                          {lastMsg && (
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {lastMsg.role === 'user' ? 'You: ' : 'AI: '}
                              {lastMsg.content}
                            </p>
                          )}
                          <span className="text-[9px] text-slate-400 flex items-center space-x-1 mt-1 font-medium">
                            <Clock className="w-2.5 h-2.5 mr-0.5 inline" />
                            {formattedDate} • {c.messages.length} messages
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {editingChatId !== c.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingChatId(c.id);
                              setEditTitleText(c.title);
                            }}
                            className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Rename"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={(e) => handleDeleteChat(e, c.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete chat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleCreateNewChat}
                className="mt-3.5 w-full py-3 bg-[#00C29A] hover:bg-[#00A885] active:scale-[0.99] text-white font-bold text-xs rounded-2xl flex items-center justify-center space-x-2 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Start a new chat from scratch</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Messages Scroll Area */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto no-scrollbar space-y-3.5 pr-1">
        {messages.map((m, idx) => (
          <div
            key={`${m.id || 'msg'}-${idx}`}
            className={`flex items-start space-x-2.5 ${
              m.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 font-bold text-xs ${
                m.role === 'user'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'bg-[#00C29A] text-white shadow-2xs'
              }`}
            >
              {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[85%] p-4 rounded-3xl text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#00C29A] text-white rounded-tr-sm font-medium shadow-2xs'
                  : 'bg-white text-slate-800 rounded-tl-sm border border-slate-100 shadow-2xs'
              }`}
            >
              <div className="whitespace-pre-line break-words">{m.content}</div>
              <div
                className={`text-[9px] mt-1.5 text-right font-medium ${
                  m.role === 'user' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                {m.time}
              </div>
            </div>
          </div>
        ))}

        {/* Quick Suggestion Chips on Fresh Chat */}
        {userMessagesCount === 0 && (
          <div className="pt-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              💡 Quick tips to start:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(suggestion)}
                  className="text-left text-[11px] font-medium text-slate-700 bg-white hover:bg-emerald-50/70 border border-slate-200 hover:border-[#00C29A]/50 p-2.5 rounded-2xl transition-all shadow-2xs"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-2xl bg-[#00C29A] text-white flex items-center justify-center shadow-2xs">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 text-xs text-slate-500 font-medium shadow-2xs flex items-center space-x-2">
              <RefreshCw className="w-3.5 h-3.5 text-[#00C29A] animate-spin" />
              <span>AI Coach remembers context and is preparing a reply...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-2 shrink-0 mt-2">
        <input
          type="text"
          placeholder="Ask the AI nutritionist..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          className="flex-1 px-3 py-2 text-base font-medium text-slate-800 outline-none bg-transparent"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputMessage.trim() || isLoading}
          className="w-10 h-10 rounded-xl bg-[#00C29A] text-white flex items-center justify-center hover:bg-[#00A885] active:scale-95 disabled:opacity-50 transition-all shrink-0 shadow-2xs cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
