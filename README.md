# Arkyv Engine

![Arkyv Engine](./public/arkyv_social_card.jpg)

An open-source text-based multi-user dungeon (MUD) built with Next.js, Supabase, and AI. Create immersive worlds where players explore interconnected regions, interact with intelligent NPCs, and shape emergent narratives through collaborative gameplay.

**🎮 [Try the Live Demo](https://www.babushkabook.com/arkyv)** - See Arkyv Engine in action!

## Why This Exists

I grew up playing MUDs and always wondered where they all went. I guess hosting was expensive and people moved on to graphical games, but as a huge reader and fan of sci-fi and fantasy, I've always loved the power of text-based storytelling and imagination.

So I built Arkyv Engine—a modern MUD system that's actually easy to host. With free tiers on Supabase and Vercel, and AI to help generate content, anyone can now create and run their own text-based world without breaking the bank or needing a CS degree.

This is for the dreamers, the storytellers, and anyone who believes that the best graphics are the ones in your mind.

## Features

- 🎮 **Real-time Multiplayer** - Explore worlds with other players in real-time
- 🤖 **AI-Powered NPCs** - Dynamic conversations with intelligent characters
- 🗺️ **Visual World Builder** - Admin panel for creating and managing rooms
- 💬 **Region Chat** - Communicate with players in the same area
- 🎵 **Dynamic Soundscapes** - Ambient audio that changes with location
- 🎨 **AI Image Generation** - Generate pixel art for rooms and NPCs
- 🔐 **Secure Authentication** - Supabase Auth with Row Level Security

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **AI Providers**: OpenAI or Grok (your choice)
- **Image Generation**: RetroDiffusion API
- **Deployment**: Vercel (recommended)

---

## Prerequisites

Before you begin, you'll need accounts with the following services:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Supabase](https://supabase.com/) - Free tier available
- [OpenAI](https://openai.com/api/) OR [Grok](https://x.ai/api) - Choose one
- [RetroDiffusion](https://retrodiffusion.ai) (optional, for AI image generation)
- [Vercel](https://vercel.com/) (optional, for deployment)

---

## Quick Start

**For a comprehensive interactive setup guide, visit `/setup` in your local or deployed app!**

The rest of this README provides the same instructions in text format.

### Setup Order (Important!)

Whether you use Docker or deploy to Vercel, you **must** complete these steps in order:

1. ✅ **Supabase Setup** - Create project, run migration, enable realtime, create storage buckets
2. ✅ **Get API Keys** - Choose OpenAI or Grok for AI (required for NPCs)
3. ✅ **Deploy Edge Functions** - Deploy command processor to Supabase
4. ✅ **Choose Deployment** - Either Docker (self-host) OR Vercel (cloud)

**Docker does NOT replace Supabase!** It only runs the Next.js app. You still need Supabase (free tier) for database, auth, and realtime features.

---

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/SeloSlav/arkyv-engine.git
cd arkyv-engine
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

#### 3.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/) and sign up/login
2. Click "New Project"
3. Fill in project details:
   - **Name**: `arkyv-engine` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Select closest to you
4. Click "Create new project" and wait for it to initialize (~2 minutes)

#### 3.2 Run Database Migration

1. In your Supabase project, go to the **SQL Editor** (left sidebar)
2. Click "New query"
3. Open `supabase/sql/migrate.sql` from this repository
4. Copy the entire contents and paste into the SQL Editor
5. Click "Run" to execute the migration
6. You should see: "Success. No rows returned"

This creates all necessary tables: `regions`, `rooms`, `characters`, `profiles`, `npcs`, `exits`, `commands`, `room_messages`, and `region_chats`.

#### 3.3 Verify Realtime is Enabled

The migration automatically enables realtime for the 5 critical tables. You can verify this in Supabase:

1. Go to **Table Editor** (left sidebar)
2. Check that these tables have realtime enabled (paper plane icon ✈️ should be highlighted):
   - `room_messages` - For terminal messages
   - `region_chats` - For region chat
   - `characters` - For player movements
   - `npcs` - For NPC interactions
   - `profiles` - For profile mode

**Note:** If for some reason realtime wasn't automatically enabled, you can manually enable it by clicking the "Enable Realtime" button on each table.

#### 3.4 Create Storage Buckets

1. Click **Storage** in the left sidebar
2. Click **"New bucket"**
3. Create first bucket:
   - **Name**: `room-images`
   - **Public bucket**: ✅ **Check this box**
   - Click **"Create bucket"**
4. Create second bucket:
   - **Name**: `npc-portraits`
   - **Public bucket**: ✅ **Check this box**
   - Click **"Create bucket"**

These are required for AI image generation to work.

#### 3.5 Get Your API Keys

1. Go to **Project Settings** → **API**
2. Copy these values (you'll need them for `.env.local`):
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (keep this secret!)

### 4. Choose Your AI Provider

You only need **ONE** of these:

#### Option A: OpenAI

1. Go to [openai.com/api](https://openai.com/api/)
2. Sign up or login
3. Navigate to **API Keys**
4. Click "Create new secret key"
5. Copy the key (starts with `sk-...`)

#### Option B: Grok (supports NSFW content)

1. Go to [x.ai/api](https://x.ai/api)
2. Sign up or login
3. Get your API key from the dashboard
4. Copy the key

### 5. Configure Environment Variables

#### 5.1 Create `.env.local`

Copy the example file:

```bash
cp .env.example .env.local
```

#### 5.2 Fill in Your Keys

Open `.env.local` and add your keys:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# AI Provider Configuration
# Set to "openai" or "grok" depending on which you're using
AI_PROVIDER=openai

# OpenAI API Key (if using OpenAI)
OPENAI_API_KEY=sk-your_key_here

# Grok API Key (if using Grok)
GROK_API_KEY=your_grok_key_here

# RetroDiffusion (optional - for AI image generation)
RETRO_DIFFUSION_API_KEY=your_retro_key_here
```

**Important**: You only need to fill in the API key for the provider you're using!

### 6. Deploy Supabase Edge Functions

The command processor runs as a Supabase Edge Function to handle game commands.

#### 6.1 Install Supabase CLI

```bash
npm install -g supabase
```

#### 6.2 Login to Supabase

```bash
supabase login
```

#### 6.3 Link Your Project

```bash
supabase link --project-ref your-project-ref
```

Find your project ref in your Supabase project URL: `https://supabase.com/dashboard/project/YOUR-PROJECT-REF`

#### 6.4 Set Edge Function Secrets

**CRITICAL:** Edge Functions need their own environment variables, separate from your local `.env.local` file!

**📍 Find Your Supabase URL:** Click the **"Connect"** button in the top header of your Supabase Dashboard to copy your project URL.

**Method 1: Using Supabase Dashboard (Recommended)**

1. Go to **Project Settings** → **Edge Functions** (in left sidebar)
2. Scroll down to **"Secrets"** section
3. Click **"Add new secret"** for each variable below

**All 10 Required Secrets:**

| Secret Name | Value | Notes |
|-------------|-------|-------|
| `SUPABASE_URL` | Auto-provided ✓ | Your project URL |
| `EDGE_SUPABASE_URL` | https://xxxxx.supabase.co | **MUST ADD!** |
| `SUPABASE_ANON_KEY` | Auto-provided ✓ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided ✓ | Service role key |
| `EDGE_SERVICE_ROLE_KEY` | your_service_role_key | **MUST ADD!** |
| `SUPABASE_DB_URL` | Auto-provided ✓ | Database URL |
| `AI_PROVIDER` | openai or grok | **MUST ADD!** |
| `OPENAI_API_KEY` | sk-your_key | **MUST ADD** (if using OpenAI) |
| `GROK_API_KEY` | your_grok_key | **MUST ADD** (if using Grok) |
| `RETRO_DIFFUSION_API_KEY` | your_retro_key | Optional - for AI images |

**🚨 CRITICAL:** You MUST add all secrets marked "MUST ADD!" AND at least ONE AI provider key (OpenAI or Grok) for NPCs to work!

**Method 2: Using CLI (Alternative)**

If you prefer command line:

```bash
# Set the EDGE_ prefixed versions (REQUIRED!)
supabase secrets set EDGE_SUPABASE_URL=https://xxxxx.supabase.co
supabase secrets set EDGE_SERVICE_ROLE_KEY=your_service_role_key

# Set your AI provider and key
supabase secrets set AI_PROVIDER=openai
supabase secrets set OPENAI_API_KEY=sk-your_key_here
# OR for Grok:
# supabase secrets set GROK_API_KEY=your_grok_key_here

# Optional: For AI image generation
supabase secrets set RETRO_DIFFUSION_API_KEY=your_key_here
```

**⚠️ Common Mistake:** If commands don't process, verify your `EDGE_SUPABASE_URL` matches your project URL exactly!

#### 6.5 Deploy the Function

```bash
supabase functions deploy command-processor
```

You should see: "Deployed Function command-processor"

### 7. Set Up Admin Access

The admin panel uses a database column to control who has admin access.

#### 7.1 Create Your Admin Account

1. Start the dev server: `npm run dev`
2. Go to `http://localhost:3000`
3. Click "Sign In to Play" → "Need an account? Sign Up"
4. Create your admin account

#### 7.2 Get Your User ID

1. Go to your Supabase project
2. Navigate to **Authentication** → **Users** (left sidebar)
3. Find your newly created user
4. Copy the **UUID** (looks like: `e00d825e-cf13-45ad-a886-c7ff9721da0b`)

#### 7.3 Grant Yourself Admin Access

After running the migration, you need to manually grant yourself admin access. Choose one method:

**Option A: Using SQL (Recommended)**

1. In Supabase, go to **SQL Editor**
2. Click "New query"
3. Run this query (replace with your copied UUID):

```sql
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id = 'your-uuid-here';
```

4. Click "Run"
5. You should see: "Success. 1 rows affected"

**Option B: Using Table Editor**

1. Go to **Table Editor** → **profiles**
2. Find your user row
3. Click the **is_admin** checkbox to set it to `true`
4. Changes save automatically

### 8. Run Locally

Start the development server (if not already running):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Initial World Setup

Now that you have admin access, you can create your first rooms!

### 1. Access the Admin Panel

Navigate to `http://localhost:3000/admin` - you should now have access to the world builder!

### 2. Create Your First Region

1. Scroll down to **"Regions Management"**
2. Click **"Create New Region"**
3. Fill in:
   - **Name**: `Mystical Forest` (the system auto-normalizes to lowercase with hyphens)
   - **Description**: A brief description of the region's theme
4. Click **"Create Region"**

### 3. Create Your First Room

1. In the map area at the top, **right-click on empty space**
2. Select **"Create new room here"**
3. Fill in:
   - **Name**: `Forest Clearing`
   - **Description**: A vibrant description of the location
   - **Region**: Select `Mystical Forest`
4. Click **"Create Room"**

**Tip**: You can use the AI assistance buttons to generate names and descriptions!

### 4. Create Connected Rooms

1. **Click on your room node** to open the room editor
2. In the **"Exits"** section, click a direction (e.g., **North**)
3. Choose **"Generate New Room (AI)"** or **"Create Blank Room"**
4. Fill in details and click **"Create Room"**

### 5. Add NPCs (Optional)

1. Scroll to **"NPCs Management"**
2. Click **"Create New NPC"**
3. Fill in details and assign to a room
4. NPCs will respond to the `talk` command!

### 6. Test Your World

1. Navigate to `http://localhost:3000/play`
2. Click **"Create a new character"**
3. Enter a name and click **"Enter Arkyv as [name]"**
4. Use commands to explore:
   - `look` - View current room
   - `north` - Move north (or any direction)
   - `who` - See who's in the room
   - `talk [npc]` - Talk to an NPC
   - `help` - See all commands

---

## Managing Multiple Admins

**Using Table Editor (Easiest):**

1. Go to **Table Editor** → **profiles**
2. Find the user row
3. Click the `is_admin` checkbox to toggle it
4. Changes save automatically

**Using SQL (Alternative):**

```sql
-- Add admin access
UPDATE public.profiles 
SET is_admin = true 
WHERE user_id = 'another-user-uuid';

-- Remove admin access
UPDATE public.profiles 
SET is_admin = false 
WHERE user_id = 'user-uuid-to-demote';
```

---

## Deployment Options

### Option 1: Docker (Recommended for Self-Hosting)

**Prerequisites:** You must complete the [Supabase Setup](#2-set-up-supabase) and [Edge Functions deployment](#5-deploy-supabase-edge-functions) sections first. Docker only runs the Next.js app - Supabase is external.

**Quick Start with Docker:**

```bash
# 1. Clone the repo
git clone https://github.com/SeloSlav/arkyv-engine.git
cd arkyv-engine

# 2. Complete Supabase setup (see sections 3.1 - 3.4 below)
# - Create Supabase project
# - Run migration SQL (supabase/sql/migrate.sql)
# - Create storage buckets
# - Deploy edge functions

# 3. Create .env.local with your keys
cp .env.example .env.local
# Edit .env.local with your Supabase URL, keys, and AI provider key

# 4. Build and run with Docker Compose
docker-compose up -d

# Your MUD is now running at http://localhost:3000
```

**Manual Docker Build:**

```bash
# Build the image
docker build -t arkyv-engine .

# Run the container
docker run -p 3000:3000 --env-file .env.local arkyv-engine
```

**What Docker Handles:**
- ✅ Next.js application (frontend & API routes)
- ✅ Consistent Node.js environment
- ✅ Easy updates and restarts
- ✅ Works on any platform (Windows, Mac, Linux)

**What You Still Need to Set Up:**
- ⚠️ Supabase project (database, auth, storage, realtime) - **Free tier available**
- ⚠️ Supabase Edge Functions deployment (command processor)
- ⚠️ AI provider API key (OpenAI or Grok) - **Required for NPCs**
- ⚠️ RetroDiffusion API key (optional, for images)

**Why?** Supabase and AI APIs are external services that can't be containerized. Docker makes the app setup trivial, but you'll always need these external services (which offer free tiers).

---

### Option 2: Vercel (Recommended for Production)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com/)
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. In **"Environment Variables"**, add:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your_key
RETRO_DIFFUSION_API_KEY=your_key
```

5. Click **"Deploy"**

**Note**: Admin access is now managed via the database `is_admin` column, so no admin-specific environment variables are needed!

### 3. Update Supabase Settings

1. In Supabase, go to **Authentication** → **URL Configuration**
2. Add your Vercel URL to **"Site URL"**
3. Add `https://your-app.vercel.app/**` to **"Redirect URLs"**

---

## Project Structure

```
arkyv-engine/
├── pages/
│   ├── index.js           # Landing page
│   ├── play.js            # Main game interface
│   ├── admin.js           # World builder
│   ├── auth.js            # Authentication
│   ├── profile.js         # User settings
│   └── api/               # Next.js API routes
├── components/
│   ├── ArkyvTerminal.js   # Game terminal
│   ├── RoomChatWindow.js  # Region chat
│   ├── ArkyvAudioManager.js # Sound system
│   └── ...
├── supabase/
│   ├── sql/
│   │   └── migrate.sql    # Database schema
│   └── functions/
│       └── command-processor/
│           ├── index.ts   # Command handler
│           └── aiProvider.ts # AI integration
├── lib/
│   ├── supabaseClient.js  # Supabase client
│   └── aiProvider.js      # AI provider helper
└── styles/
    └── global.css         # Global styles
```

---

## Adding Music to Regions

Arkyv Engine supports background music for each region. Here's how to add it:

### 1. Create Region Folder

Create a folder in `public/audio/` matching your region name (lowercase with hyphens):

```bash
mkdir public/audio/my-region-name
```

### 2. Add Music Files

Place your `.mp3` files in the folder:

```
public/audio/my-region-name/
  ├── track1.mp3
  ├── track2.mp3
  └── track3.mp3
```

### 3. Update Playlist

Open `components/ArkyvAudioManager.js` and add your region to `STATIC_PLAYLISTS`:

```javascript
const STATIC_PLAYLISTS = {
    'my-region-name': [
        '/audio/my-region-name/track1.mp3',
        '/audio/my-region-name/track2.mp3',
        '/audio/my-region-name/track3.mp3',
    ],
};
```

**That's it!** Music will automatically play when players enter rooms in that region.

### Room-Specific Music Overrides

Want specific rooms to have different music than their region? Use room overrides!

**💡 Example Use Case:** Imagine you have a "Forest Region" with ambient nature sounds playing throughout. Most forest rooms use that regional playlist, but when players enter "The Tavern" room, you want lively medieval music instead. That's where room overrides shine! (Think *Elwynn Forest* ambient music vs *Goldshire Inn* tavern music if you're a WoW fan.)

**1. Create override folder:**

```bash
mkdir public/audio/override
```

**2. Get the room UUID:**
- Open the Admin Panel (`/admin`)
- Click on the room you want to customize
- Copy the UUID from the URL or room editor

**3. Add to `data/roomAudioOverrides.js`:**

```javascript
const ROOM_AUDIO_OVERRIDES = {
    'room-uuid-here': [
        '/audio/override/special-track.mp3',
        '/audio/override/another-track.mp3',
    ],
};
```

**Priority:** Room overrides take precedence over region playlists.

**Why Static Files?** We use static audio files for simplicity and performance. Audio files are large, and serving them statically from the CDN is much faster than database storage. In the future, we may add a UI to manage these mappings in the admin panel, but the actual audio files will remain static for optimal delivery.

---

## Commands Reference

### Movement
- `north`, `south`, `east`, `west` (or `n`, `s`, `e`, `w`)
- `up`, `down` (or `u`, `d`)
- `northeast`, `northwest`, `southeast`, `southwest` (or `ne`, `nw`, `se`, `sw`)

### Social
- `say <message>` - Speak to everyone in the room
- `whisper <character> <message>` - Private message to a character
- `look` - Examine current location
- `who` - See who's in the room
- `inspect <name>` - View character/NPC details
- `set handle <name>` - Set your display name (profile mode only)

### NPCs
- `talk <npc> <message>` - Start conversation with NPC
- `exit` - End current conversation

### Info
- `help` - Show all commands
- `exits` - View available exits

---

## Troubleshooting

### "Cannot find module 'tailwindcss'"
```bash
npm install -D tailwindcss postcss autoprefixer @tailwindcss/postcss
```

### "Supabase environment variables are missing"
Make sure `.env.local` has all required Supabase keys.

### "AI API error"
- Check your `AI_PROVIDER` is set to `"openai"` or `"grok"`
- Verify your API key is correct
- Ensure you have API credits/quota available

### Edge Function not working
```bash
# Check function logs
supabase functions serve command-processor

# Redeploy
supabase functions deploy command-processor
```

### Messages not appearing in terminal

If commands process but you don't see NPC responses or messages:

1. Go to **Table Editor** in Supabase Dashboard
2. For each table, click the **"Enable Realtime"** button (paper plane icon ✈️) at top right
3. Enable for these 5 tables: `room_messages`, `region_chats`, `characters`, `npcs`, `profiles`
4. Refresh your browser

### Commands not processing

If commands aren't being processed at all:

1. **Check Edge Function URL** - In Supabase Dashboard → Edge Functions → Logs, look for "URL: https://..." in the logs. It MUST match your project URL exactly (find your URL by clicking "Connect" in the dashboard header).
2. **Update the secrets (set BOTH):**
   ```bash
   supabase secrets set SUPABASE_URL=https://your-correct-url.supabase.co
   supabase secrets set EDGE_SUPABASE_URL=https://your-correct-url.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   supabase secrets set EDGE_SERVICE_ROLE_KEY=your_service_role_key
   ```
3. **Redeploy:**
   ```bash
   supabase functions deploy command-processor
   ```
4. Verify Edge Function has ALL required environment variables set:
   ```bash
   supabase secrets list
   ```
   You should see 10+ secrets including both EDGE_ prefixed and non-prefixed versions.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is open source and available under the [MIT License](LICENSE).

---

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/SeloSlav/arkyv-engine/issues)
- **Documentation**: Check this README and code comments
- **Community**: Star the repo to show support!

---

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Supabase](https://supabase.com/)
- AI by [OpenAI](https://openai.com/) / [Grok](https://x.ai/)
- Images by [RetroDiffusion](https://retrodiffusion.ai/)

---

**Happy world building!** 🎮✨
