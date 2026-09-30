-- Nutru initial schema: Firestore collections -> Postgres (fresh schema, no data migration)
-- profiles <- users, meals <- meals, diaries <- calendar/daily logs,
-- friendships <- friends, meal_reactions <- meal reactions,
-- weight_logs <- weight history, workouts <- workouts, chats <- AI chats

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text,
  avatar text,
  avatar_url text,
  friend_code text UNIQUE,
  clean_code text,
  search_keys text[] DEFAULT '{}',
  gender text,
  age int,
  height numeric,
  current_weight numeric,
  target_weight numeric,
  start_weight numeric,
  weekly_goal numeric,
  activity_level text,
  diet_type text,
  target_calories int,
  target_protein int,
  target_fat int,
  target_carbs int,
  target_fiber int,
  target_water int,
  streak_days int DEFAULT 1,
  bmr int,
  tdee int,
  calendar_meals jsonb DEFAULT '{}',
  daily_logs jsonb DEFAULT '{}',
  last_meal_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_clean_code_idx ON public.profiles (clean_code);
CREATE INDEX IF NOT EXISTS profiles_search_keys_gin ON public.profiles USING GIN (search_keys);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

-- 2. meals (id format meal_*, NOT uuid)
CREATE TABLE IF NOT EXISTS public.meals (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date text NOT NULL,
  type text NOT NULL,
  title text,
  calories int DEFAULT 0,
  protein int DEFAULT 0,
  fat int DEFAULT 0,
  carbs int DEFAULT 0,
  fiber int DEFAULT 0,
  portion_grams numeric DEFAULT 100,
  time text,
  image_url text,
  ingredients jsonb DEFAULT '[]',
  ai_analysis jsonb,
  confidence numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meals_user_date_idx ON public.meals (user_id, date DESC);

-- 3. diaries
CREATE TABLE IF NOT EXISTS public.diaries (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_meals jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- 4. friendships (id = sorted uid_a_uid_b)
CREATE TABLE IF NOT EXISTS public.friendships (
  id text PRIMARY KEY,
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS friendships_user_a_idx ON public.friendships (user_a);
CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON public.friendships (user_b);

-- 5. meal_reactions
CREATE TABLE IF NOT EXISTS public.meal_reactions (
  id text PRIMARY KEY,
  meal_id text NOT NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meal_reactions_meal_idx ON public.meal_reactions (meal_id);

-- 6. weight_logs (PK user_id + date YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS public.weight_logs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date text NOT NULL,
  weight numeric NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

-- 7. workouts
CREATE TABLE IF NOT EXISTS public.workouts (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date text,
  title text,
  duration_minutes int,
  calories_burned int,
  time text,
  data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workouts_user_date_idx ON public.workouts (user_id, date);

-- 8. chats
CREATE TABLE IF NOT EXISTS public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  messages jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chats_user_updated_idx ON public.chats (user_id, updated_at DESC);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- profiles: read = any authenticated (friend search), write = owner
DROP POLICY IF EXISTS "profiles select authenticated" ON public.profiles;
CREATE POLICY "profiles select authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles insert owner" ON public.profiles;
CREATE POLICY "profiles insert owner" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles update owner" ON public.profiles;
CREATE POLICY "profiles update owner" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles delete owner" ON public.profiles;
CREATE POLICY "profiles delete owner" ON public.profiles
  FOR DELETE TO authenticated USING (auth.uid() = id);

-- meals: read = any authenticated, write = owner
DROP POLICY IF EXISTS "meals select authenticated" ON public.meals;
CREATE POLICY "meals select authenticated" ON public.meals
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "meals insert owner" ON public.meals;
CREATE POLICY "meals insert owner" ON public.meals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "meals update owner" ON public.meals;
CREATE POLICY "meals update owner" ON public.meals
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "meals delete owner" ON public.meals;
CREATE POLICY "meals delete owner" ON public.meals
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- diaries: read = any authenticated, write = owner
DROP POLICY IF EXISTS "diaries select authenticated" ON public.diaries;
CREATE POLICY "diaries select authenticated" ON public.diaries
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "diaries insert owner" ON public.diaries;
CREATE POLICY "diaries insert owner" ON public.diaries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "diaries update owner" ON public.diaries;
CREATE POLICY "diaries update owner" ON public.diaries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "diaries delete owner" ON public.diaries;
CREATE POLICY "diaries delete owner" ON public.diaries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- friendships: read = any authenticated, write = participant
DROP POLICY IF EXISTS "friendships select authenticated" ON public.friendships;
CREATE POLICY "friendships select authenticated" ON public.friendships
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "friendships insert member" ON public.friendships;
CREATE POLICY "friendships insert member" ON public.friendships
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IN (user_a, user_b));
DROP POLICY IF EXISTS "friendships update member" ON public.friendships;
CREATE POLICY "friendships update member" ON public.friendships
  FOR UPDATE TO authenticated USING (auth.uid() IN (user_a, user_b)) WITH CHECK (auth.uid() IN (user_a, user_b));
DROP POLICY IF EXISTS "friendships delete member" ON public.friendships;
CREATE POLICY "friendships delete member" ON public.friendships
  FOR DELETE TO authenticated USING (auth.uid() IN (user_a, user_b));

-- meal_reactions: read = any authenticated, write = sender
DROP POLICY IF EXISTS "meal_reactions select authenticated" ON public.meal_reactions;
CREATE POLICY "meal_reactions select authenticated" ON public.meal_reactions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "meal_reactions insert owner" ON public.meal_reactions;
CREATE POLICY "meal_reactions insert owner" ON public.meal_reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);
DROP POLICY IF EXISTS "meal_reactions update owner" ON public.meal_reactions;
CREATE POLICY "meal_reactions update owner" ON public.meal_reactions
  FOR UPDATE TO authenticated USING (auth.uid() = from_user_id) WITH CHECK (auth.uid() = from_user_id);
DROP POLICY IF EXISTS "meal_reactions delete owner" ON public.meal_reactions;
CREATE POLICY "meal_reactions delete owner" ON public.meal_reactions
  FOR DELETE TO authenticated USING (auth.uid() = from_user_id);

-- weight_logs: read = any authenticated, write = owner
DROP POLICY IF EXISTS "weight_logs select authenticated" ON public.weight_logs;
CREATE POLICY "weight_logs select authenticated" ON public.weight_logs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "weight_logs insert owner" ON public.weight_logs;
CREATE POLICY "weight_logs insert owner" ON public.weight_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "weight_logs update owner" ON public.weight_logs;
CREATE POLICY "weight_logs update owner" ON public.weight_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "weight_logs delete owner" ON public.weight_logs;
CREATE POLICY "weight_logs delete owner" ON public.weight_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- workouts: read = any authenticated, write = owner
DROP POLICY IF EXISTS "workouts select authenticated" ON public.workouts;
CREATE POLICY "workouts select authenticated" ON public.workouts
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "workouts insert owner" ON public.workouts;
CREATE POLICY "workouts insert owner" ON public.workouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "workouts update owner" ON public.workouts;
CREATE POLICY "workouts update owner" ON public.workouts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "workouts delete owner" ON public.workouts;
CREATE POLICY "workouts delete owner" ON public.workouts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- chats: all operations = owner only
DROP POLICY IF EXISTS "chats select owner" ON public.chats;
CREATE POLICY "chats select owner" ON public.chats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "chats insert owner" ON public.chats;
CREATE POLICY "chats insert owner" ON public.chats
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "chats update owner" ON public.chats;
CREATE POLICY "chats update owner" ON public.chats
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "chats delete owner" ON public.chats;
CREATE POLICY "chats delete owner" ON public.chats
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Realtime (idempotent: add only if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meals;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chats') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END $$;

-- Storage: private bucket mealPhotos (path = <auth.uid()>/...)
INSERT INTO storage.buckets (id, name, public)
VALUES ('mealPhotos', 'mealPhotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mealPhotos select authenticated" ON storage.objects;
CREATE POLICY "mealPhotos select authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'mealPhotos');
DROP POLICY IF EXISTS "mealPhotos insert owner folder" ON storage.objects;
CREATE POLICY "mealPhotos insert owner folder" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'mealPhotos' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "mealPhotos update owner folder" ON storage.objects;
CREATE POLICY "mealPhotos update owner folder" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'mealPhotos' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'mealPhotos' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "mealPhotos delete owner folder" ON storage.objects;
CREATE POLICY "mealPhotos delete owner folder" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'mealPhotos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- How to apply:
-- 1. Open Supabase Dashboard -> your project -> SQL Editor -> New query.
-- 2. Paste the full contents of supabase/migrations/0001_init.sql and run it.
-- 3. Verify: Table Editor shows the 8 tables; Authentication -> Policies shows the new policies;
--    Storage shows private bucket mealPhotos; Database -> Replication shows the 4 tables in supabase_realtime.
-- 4. Optional CLI: supabase db push (if the project is linked).
