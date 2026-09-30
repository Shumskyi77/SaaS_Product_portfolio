# Foodvisor — AI Nutrition Diary & Macro Tracker

## 🌐 Live demo: https://saa-s-product-portfolio.vercel.app/

> Personal calorie tracker, food scanner from photo, and AI nutritionist.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Cloud_DB-3ECF8E?logo=supabase&logoColor=white)
![Gemini AI](https://img.shields.io/badge/Gemini-AI-4285F4?logo=google&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deploy-black?logo=vercel)

Foodvisor is a mobile-first (with desktop shell) nutrition app: log meals in seconds via **photo, voice, barcode or text search**, get real **calories + protein / fat / carbs / fiber** from Gemini AI, track water, weight and workouts, keep a streak, compete with friends, and chat with an **AI coach** that knows your diary.

## ✨ Features

**Food logging — 4 ways**
- 📸 **AI Camera Scanner** — photo of a dish / fridge → dishes with portion grams, kcal, P/F/C, ingredients + AI comment
- 🎙️ **Voice input** — “oatmeal with banana and latte” → parsed into separate dishes (`/api/gemini/parse-voice`)
- 📊 **Barcode scanner** — Open Food Facts lookup (`/api/openfoodfacts/barcode/:code`) + Gemini fallback estimator
- 🔍 **Food search** — text database + manual add

**Diary & analytics**
- 📅 Daily dashboard: calories vs target, macro rings, meals by type (breakfast / lunch / dinner / snack)
- 📈 Progress page: weight chart, calorie history (Recharts), streak engine
- 💧 Water tracker, 🏋️ workout log with kcal burn by body weight
- 🗓️ Calendar navigation with per-date sync

**AI Coach**
- 💬 Chat that sees your profile, today’s meals, workouts and water; can add workouts directly from chat
- Multi-model Gemini fallback (`gemini-3.7-flash` → `flash-latest` → `lite` variants) with timeout + offline nutrition-engine fallback

**Social**
- 👥 Friends by friend-code (`NM-XXXXXX`, Cyrillic-tolerant search), activity feed, meal reactions (emoji)
- Real-time Supabase sync + local-first outbox with retry toast (“not in cloud yet — will resend”)

**Gamification**
- 🐣 Tamagotchi pet: fed by hitting calorie target, workouts and logging streak; widget + play modal
- 🔥 Streak days calculated from real meal dates

**Platform**
- 📱 Mobile shell + bottom nav, 🖥️ desktop shell, PWA-ready viewport, camera/mic permissions
- 🔐 Guest-only local profile: no sign-up / sign-in, all data (diary, weight, pet, coach chats) stays in this browser's localStorage
- 🌙 Onboarding with BMR / TDEE → personalized target calories

## 🧱 Tech Stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion, Lucide, Recharts
- **Backend:** Express 4 (`server.ts`) + Vercel Serverless (`api/[...all].ts`, `api/gemini/*`, `api/openfoodfacts/*`)
- **AI:** Google Gemini (`@google/genai`, `@google/generative-ai`)
- **Data:** Supabase (Auth + Postgres, direct from client), `data/db.json` as local dev fallback
- **Scanning:** `@zxing/browser`, `@zxing/library`, `html5-qrcode`
- **Tooling:** `tsx`, `esbuild`, `tsc --noEmit`

## 📁 Project Structure

```
├── src/App.tsx              # App state, auth, cloud sync, navigation
├── components/              # Dashboard, AICameraScanner, FoodSearchModal,
│                            # AICoachChat, FriendsPage, ProgressPage, RecipesPage,
│                            # OnboardingFlow, Tamagotchi*, WorkoutModal, etc.
├── lib/                     # store.ts (localStorage), supabaseDb.ts, supabaseAuth.ts,
│                            # gemini.ts, nutritionEngine.ts, openFoodFacts.ts,
│                            # streakEngine.ts, googleFit.ts
├── api/                     # Vercel functions: gemini/*, openfoodfacts/*
├── server.ts                # Express API: /api/meals, /api/friends, /api/weights,
│                            # /api/workouts, /api/reactions, /api/gemini/*
├── supabase/migrations/     # DB schema
├── types/                   # UserProfile, MealLog, TamagotchiState, Recipe
├── data/db.json             # Local dev DB (gitignored)
└── vite.config.ts / vercel.json
```

## 🚀 Getting Started

**Prerequisites:** Node.js 20+, npm or bun.

```bash
git clone https://github.com/<you>/foodvisor.git
cd foodvisor
npm install   # or: bun install

cp .env.example .env.local
# fill in keys (see table below)

npm run dev    # → http://localhost:3000
```

| Script | Command |
|---|---|
| Dev (Vite + Express) | `npm run dev` (`tsx server.ts`) |
| Production build | `npm run build` |
| Start prod | `npm start` |
| Type check | `npm run lint` (`tsc --noEmit`) |

## 🔑 Environment Variables

Copy `.env.example` → `.env.local` (never commit `.env.local`).

| Variable | Where | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same (public anon key) | ✅ |
| `VITE_GEMINI_API_KEY` | [AI Studio](https://aistudio.google.com/app/apikey) — restrict by HTTP referrer | for client AI |
| `GEMINI_API_KEY` | same, server-only (Vercel → Env Vars) | for `/api/*` AI |
| `VITE_GOOGLE_CLIENT_ID` | Google Cloud → Credentials → OAuth Client ID | for Google Fit / Sign-In |

> `VITE_*` keys ship in the browser bundle — only public keys there. `GEMINI_API_KEY` (no prefix) is read only by Node.

## 🔌 API Overview

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/meals` | List / save meals (owner-checked) |
| DELETE | `/api/meals/:id` | Delete meal + calendar copies |
| GET/POST | `/api/users/diary/:userId` | Full calendar diary sync |
| GET | `/api/users/search?q=` | Find users by code / name / email |
| GET/POST | `/api/friends`, `/api/friends/add`, `/api/friends/feed` | Friends graph + activity feed |
| GET/POST | `/api/weights`, `/api/workouts`, `/api/reactions` | Weight, workouts, emoji reactions |
| POST | `/api/gemini/parse-voice` | Speech text → dishes JSON |
| POST | `/api/gemini/analyze-fridge` | Fridge photo → ingredient list |
| POST | `/api/gemini/estimate-barcode` | AI nutrition estimate by barcode |
| GET | `/api/openfoodfacts/barcode/:code` | OFF proxy (v2 → v0 fallback) |
| GET | `/api/health` | Backend diagnostic |

Auth: `Authorization: Bearer <supabase_access_token>` is verified server-side (`lib/serverAuth.ts`) and matched against `userId` in body/query (IDOR protection).

## ☁️ Deploy (Vercel)

1. Push to GitHub, Import project in Vercel.
2. Set Env Vars: `GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GEMINI_API_KEY`, `VITE_GOOGLE_CLIENT_ID`.
3. Deploy — `vercel.json` already routes `/api/*` to functions and everything else to SPA.

## 🗺️ Roadmap

- [ ] Recipe generator from fridge contents
- [ ] Google Fit auto-import of weight / activity
- [ ] PWA offline install + push reminders
- [ ] i18n (RU / EN)

## 📄 License

No license specified yet. Add `LICENSE` (e.g. MIT) before public release.
