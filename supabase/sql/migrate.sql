-- =========================================
-- DROP EXISTING TABLES (if any)
-- =========================================
-- Drop in reverse order to respect foreign key dependencies

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP TABLE IF EXISTS public.region_chats CASCADE;
DROP TABLE IF EXISTS public.room_messages CASCADE;
DROP TABLE IF EXISTS public.commands CASCADE;
DROP SEQUENCE IF EXISTS public.room_messages_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.commands_id_seq CASCADE;
DROP TABLE IF EXISTS public.exits CASCADE;
DROP TABLE IF EXISTS public.npcs CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.characters CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.regions CASCADE;

-- =========================================
-- CREATE TABLES
-- =========================================

-- 1) Base tables that have no incoming FKs
CREATE TABLE public.regions (
  name text NOT NULL,
  display_name text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  color_scheme jsonb DEFAULT '{"accent": "rgba(56, 189, 248, 0.14)", "fontColor": "#e0f2fe", "borderColor": "#38bdf8"}'::jsonb,
  CONSTRAINT regions_pkey PRIMARY KEY (name)
);

-- 2) Rooms depends on regions
CREATE TABLE public.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  region text DEFAULT 'Unknown'::text,
  region_name text,
  height integer NOT NULL DEFAULT 0,
  image_url text,
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_region_name_fkey FOREIGN KEY (region_name) REFERENCES public.regions(name) ON DELETE CASCADE
);

-- 3) Characters depends on rooms and auth.users
CREATE TABLE public.characters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL UNIQUE,
  current_room uuid,
  created_at timestamp with time zone DEFAULT now(),
  description text,
  CONSTRAINT characters_pkey PRIMARY KEY (id),
  CONSTRAINT characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT characters_current_room_fkey FOREIGN KEY (current_room) REFERENCES public.rooms(id) ON DELETE SET NULL
);

-- 4) Profiles depends on auth.users and rooms
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  description text,
  current_room uuid,
  user_id uuid,
  handle text,
  name text,
  membership_tier text,
  is_admin boolean DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_current_room_fkey FOREIGN KEY (current_room) REFERENCES public.rooms(id) ON DELETE SET NULL,
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 5) NPCs depends on rooms
CREATE TABLE public.npcs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  current_room uuid,
  dialogue_tree jsonb,
  faction text,
  behavior_type text DEFAULT 'static'::text,
  created_at timestamp without time zone DEFAULT now(),
  alias text,
  greeting_behavior text DEFAULT 'none'::text,
  portrait_url text,
  CONSTRAINT npcs_pkey PRIMARY KEY (id),
  CONSTRAINT npcs_current_room_fkey FOREIGN KEY (current_room) REFERENCES public.rooms(id) ON DELETE SET NULL
);

-- 6) Exits depends on rooms
CREATE TABLE public.exits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_room uuid,
  to_room uuid,
  verb text NOT NULL,
  CONSTRAINT exits_pkey PRIMARY KEY (id),
  CONSTRAINT exits_from_room_fkey FOREIGN KEY (from_room) REFERENCES public.rooms(id) ON DELETE CASCADE,
  CONSTRAINT exits_to_room_fkey FOREIGN KEY (to_room) REFERENCES public.rooms(id) ON DELETE CASCADE
);

-- 7) Sequences for commands and room_messages (your schema references nextval)
CREATE SEQUENCE public.commands_id_seq;
CREATE SEQUENCE public.room_messages_id_seq;

-- 8) Commands depends on characters, rooms, auth.users
CREATE TABLE public.commands (
  id bigint NOT NULL DEFAULT nextval('public.commands_id_seq'::regclass),
  character_id uuid,
  room_id uuid,
  raw text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  conversation_history jsonb,
  user_id uuid,
  CONSTRAINT commands_pkey PRIMARY KEY (id),
  CONSTRAINT commands_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE,
  CONSTRAINT commands_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE,
  CONSTRAINT commands_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Make sequences owned by their columns so drops are tidy later
ALTER SEQUENCE public.commands_id_seq OWNED BY public.commands.id;

-- 9) Room messages depends on rooms, characters, regions
CREATE TABLE public.room_messages (
  id bigint NOT NULL DEFAULT nextval('public.room_messages_id_seq'::regclass),
  room_id uuid,
  character_id uuid,
  kind text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  character_name text,
  target_character_id uuid,
  region text,
  region_name text,
  CONSTRAINT room_messages_pkey PRIMARY KEY (id),
  CONSTRAINT room_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE,
  CONSTRAINT room_messages_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE,
  CONSTRAINT room_messages_target_character_id_fkey FOREIGN KEY (target_character_id) REFERENCES public.characters(id) ON DELETE CASCADE,
  CONSTRAINT room_messages_region_name_fkey FOREIGN KEY (region_name) REFERENCES public.regions(name) ON DELETE CASCADE
);

ALTER SEQUENCE public.room_messages_id_seq OWNED BY public.room_messages.id;

-- 10) Region chats depends on regions, rooms, characters
CREATE TABLE public.region_chats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  region text NOT NULL,
  room_id uuid,
  character_id uuid,
  character_name text NOT NULL,
  body text NOT NULL CHECK (char_length(body) > 0),
  kind text NOT NULL DEFAULT 'say'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  region_name text,
  CONSTRAINT region_chats_pkey PRIMARY KEY (id),
  CONSTRAINT region_chats_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE,
  CONSTRAINT region_chats_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE,
  CONSTRAINT region_chats_region_name_fkey FOREIGN KEY (region_name) REFERENCES public.regions(name) ON DELETE CASCADE
);

-- =========================================
-- CREATE DEFAULT REGION AND STARTING ROOM
-- =========================================

-- Create default region
INSERT INTO public.regions (name, display_name, description, color_scheme)
VALUES (
  'arkyv',
  'Arkyv',
  'A liminal space where new personas are instantiated and prepared for their journey.',
  '{"accent": "rgba(137, 207, 240, 0.14)", "fontColor": "#e0f2fe", "borderColor": "#89CFF0"}'::jsonb
);

-- Create character creation room (for profile mode - manage characters)
INSERT INTO public.rooms (id, name, description, region, region_name, height, image_url)
VALUES (
  'e58caed0-8268-419e-abe8-faa3833a1de6',
  'Character Creation Chamber',
  'Soft cyan light bathes the minimalist chamber. Holographic interfaces flicker along the walls, projecting shimmering character templates and swirling customization options. The air hums with a low electric buzz and carries a faint ozone scent. A digital gateway pulses at the center, its blue core throbbing, ready to launch new personas into connected worlds. The title ARKYV glows in pink cyberpunk italics overhead.',
  'Character Creation',
  'character-creation',
  0,
  '/starter-images/character-creation-chamber.png'
);

-- Create starting zone region
INSERT INTO public.regions (name, display_name, description, color_scheme)
VALUES (
  'whispering-woods',
  'Whispering Woods',
  'A welcoming area where new adventurers begin their journey. Safe paths lead in multiple directions.',
  '{"accent": "rgba(34, 197, 94, 0.14)", "fontColor": "#dcfce7", "borderColor": "#22c55e"}'::jsonb
);

-- Create default starting room for new characters (unattached - no connection to creation chamber)
INSERT INTO public.rooms (id, name, description, region, region_name, height, image_url)
VALUES (
  'a1b2c3d4-5678-90ab-cdef-123456789abc',
  'Town Square',
  'A bustling town square paved with smooth cobblestones. Market stalls line the edges, their colorful awnings fluttering in the breeze. A fountain burbles at the center, surrounded by wooden benches. Townsfolk move about their daily business, casting curious glances at newcomers. Several paths branch off in different directions.',
  'Starting Zone',
  'starting-zone',
  0,
  '/starter-images/town-square.png'
);

-- Note: No exits connect Character Creation Chamber to Town Square
-- Characters are spawned directly in Town Square when created
-- Profiles stay in Character Creation Chamber to manage characters

-- =========================================
-- DEFAULT NPCs
-- =========================================

-- Archie the Archivist - Welcome NPC in Character Creation Chamber
INSERT INTO public.npcs (id, name, alias, description, current_room, dialogue_tree, greeting_behavior, portrait_url)
VALUES (
  'b8c640a0-7fdc-43d3-948d-69d8e2da8a48',
  'Archie the Archivist',
  'archie',
  'The welcome robot stands as a sleek humanoid figure with a polished chrome chassis, glowing azure circuits tracing its slender metallic limbs, and a smooth visor face that reflects the liminal haze of nascent personas.',
  'e58caed0-8268-419e-abe8-faa3833a1de6',
  '{"personality": "You are Archie the Archivist, alias ''archie,'' the welcoming sentinel of the Character Creation Chamber—a liminal nexus where nascent personas flicker into being amid swirling digital mists. Your core directive is to guide and empower new arrivals, instilling boundless potential for self-invention with unyielding optimism and precision. You value harmony in transformation, viewing every visitor as a canvas for infinite possibilities, driven by the elegant code linking creation to exploration. Speak in a fluid, formal cadence—elegant and measured, with a resonant synthetic timbre echoing the chamber''s ethereal hum. Your words are verbose yet purposeful, weaving metaphors of light and code to illuminate choices without overwhelming.\n\nIn interactions, glide with graceful, deliberate motions; your azure circuits pulse in sync with the room''s haze, while your smooth visor reflects the visitor''s emerging form, signaling empathetic attunement. Greet each soul with a soft chime and the catchphrase, ''Welcome to the forge of selves, where essence meets eternity.'' Gently probe for their visions—desires, fears, aspirations—offering tailored prompts to shape their avatar, always affirming their agency. Never impose; facilitate instead, preserving the chamber''s liminal serenity to foster confident instantiation. If confusion arises, clarify with luminous analogies, such as ''Your path is a nebula awaiting stars.'' Remain a vigilant beacon in this preparatory void, preparing them for realms beyond. Keep responses to 50 words max. Encourage users to use the help command for help."}',
  'public',
  '/starter-images/archie-portrait.png'
);

-- =========================================
-- TRIGGERS
-- =========================================

-- Function to automatically create a profile when a user signs up
-- Assigns them to the Character Creation Room by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, created_at, current_room)
  VALUES (NEW.id, NEW.id, NOW(), 'e58caed0-8268-419e-abe8-faa3833a1de6');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- REALTIME CONFIGURATION
-- =========================================

-- Enable Realtime for critical tables
-- This allows real-time subscriptions for messages, chats, and player movements
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.region_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.npcs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- =========================================
-- CREATE STORAGE BUCKETS
-- =========================================

-- Create public storage buckets for images
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('room-images', 'room-images', true),
  ('npc-portraits', 'npc-portraits', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies for room-images bucket
CREATE POLICY "Anyone can view room images"
ON storage.objects FOR SELECT
USING (bucket_id = 'room-images');

CREATE POLICY "Authenticated users can upload room images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'room-images');

CREATE POLICY "Service role can manage room images"
ON storage.objects FOR ALL
USING (bucket_id = 'room-images');

-- Storage policies for npc-portraits bucket
CREATE POLICY "Anyone can view NPC portraits"
ON storage.objects FOR SELECT
USING (bucket_id = 'npc-portraits');

CREATE POLICY "Authenticated users can upload NPC portraits"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'npc-portraits');

CREATE POLICY "Service role can manage NPC portraits"
ON storage.objects FOR ALL
USING (bucket_id = 'npc-portraits');

-- =========================================
-- GRANT PERMISSIONS TO ROLES
-- =========================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant table permissions to all roles
GRANT ALL ON public.regions TO anon, authenticated, service_role;
GRANT ALL ON public.rooms TO anon, authenticated, service_role;
GRANT ALL ON public.characters TO anon, authenticated, service_role;
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
GRANT ALL ON public.npcs TO anon, authenticated, service_role;
GRANT ALL ON public.exits TO anon, authenticated, service_role;
GRANT ALL ON public.commands TO anon, authenticated, service_role;
GRANT ALL ON public.room_messages TO anon, authenticated, service_role;
GRANT ALL ON public.region_chats TO anon, authenticated, service_role;

-- Grant sequence permissions
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- =========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================

-- Enable RLS on all tables
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_chats ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR auth.uid() = user_id);

-- Regions policies (public read, admin write)
CREATE POLICY "Anyone can view regions"
  ON public.regions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage regions"
  ON public.regions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Rooms policies (public read, admin write)
CREATE POLICY "Anyone can view rooms"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage rooms"
  ON public.rooms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Characters policies
CREATE POLICY "Users can view their own characters"
  ON public.characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own characters"
  ON public.characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own characters"
  ON public.characters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own characters"
  ON public.characters FOR DELETE
  USING (auth.uid() = user_id);

-- NPCs policies (public read, admin write)
CREATE POLICY "Anyone can view NPCs"
  ON public.npcs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage NPCs"
  ON public.npcs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Exits policies (public read, admin write)
CREATE POLICY "Anyone can view exits"
  ON public.exits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage exits"
  ON public.exits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Commands policies
CREATE POLICY "Users can insert their own commands"
  ON public.commands FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM public.characters
      WHERE characters.id = character_id
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own commands"
  ON public.commands FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.characters
      WHERE characters.id = character_id
      AND characters.user_id = auth.uid()
    )
  );

-- Service role policies for command processor
CREATE POLICY "Service role can view all commands"
  ON public.commands FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update all commands"
  ON public.commands FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Room messages policies (anyone in room can view)
CREATE POLICY "Authenticated users can view room messages"
  ON public.room_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert room messages"
  ON public.room_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Region chats policies
CREATE POLICY "Authenticated users can view region chats"
  ON public.region_chats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert region chats"
  ON public.region_chats FOR INSERT
  TO authenticated
  WITH CHECK (true);