# Chorus Lab - Local & Supabase Setup Guide

## 🚀 Quick Start (Local Storage Only)

### 1. Install Dependencies
```bash
npm install
# or
pnpm install
```

### 2. Run the Development Server
```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Default Test User
- **Email**: `test@example.com`
- **Password**: `password123`
- **Username**: `TestUser`

All audio files and data are stored locally in the `local-data/` directory.

---

## 📁 Local Storage Structure

The app automatically creates and manages these directories:

```
local-data/
├── audio/              # Uploaded audio files
├── downloads/          # YouTube downloaded audio
├── clips.json          # Audio clips metadata
├── preferences.json    # User preferences
├── stars.json          # Starred clips
└── votes.json          # Vote history
```

**Features:**
- ✅ Works completely offline
- ✅ No internet required
- ✅ Fast local file access
- ✅ Data persists between sessions
- ✅ Perfect for development and testing

---

## ☁️ Setup with Supabase (Optional)

### Prerequisites
- Supabase project ([Create one here](https://app.supabase.com))
- PostgreSQL database (included with Supabase)
- Supabase Storage bucket

### Step 1: Get Your Supabase Credentials

1. Go to [app.supabase.com](https://app.supabase.com)
2. Create a new project or select existing one
3. Click **Settings** → **API**
4. Copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 2: Update `.env.local`

```bash
# Uncomment and update these in .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
```

### Step 3: Run Database Migrations

Apply the database schema:

```bash
# Connect to your Supabase database and run these migrations:
# migrations/add_discovery_features.sql
# migrations/add_filter_preferences.sql
```

Or use the Supabase dashboard:
1. Go to **SQL Editor**
2. Create a new query
3. Copy and paste the SQL from the migrations folder
4. Run

### Step 4: Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Create a new bucket named `audio-clips`
3. Set policies to allow public read access

### Step 5: Run the App

```bash
npm run dev
```

---

## 🔄 Switching Between Local & Supabase

### Use Local Storage Only:
Comment out all Supabase variables in `.env.local`:
```bash
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### Use Supabase:
Uncomment and fill in the variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The app automatically detects which backend to use!

---

## 🎥 YouTube Download Setup

### Without Authentication (Limited):
- Some YouTube videos may require cookies
- Download quality may be limited

### With YouTube Cookies (Recommended):

1. **Get Your YouTube Cookies:**
   - Install [EditThisCookie extension](https://chrome.google.com/webstore)
   - Visit [youtube.com](https://youtube.com)
   - Click extension → Export cookies
   - Save as `youtube-cookies.txt`

2. **Place in Project Root:**
```bash
cp ~/Downloads/youtube-cookies.txt ./youtube-cookies.txt
```

3. **Upload via UI:**
   - Go to Clip Creator page
   - Click "Upload Cookies"
   - Select your cookies file

---

## 📊 Audio Processing

### Local Processing:
- Audio stored in `local-data/audio/`
- Metadata in `clips.json`
- No cloud processing needed

### Waveform Generation:
- **Optional:** Install `audiowaveform` for visual waveforms
  ```bash
  # macOS
  brew install audiowaveform
  
  # Ubuntu/Debian
  sudo apt-get install audiowaveform
  
  # CentOS/RHEL
  sudo yum install audiowaveform
  ```
- If not installed, app still works - just without waveform visuals

---

## 🐳 Docker Setup

### Local Storage with Docker:

```bash
# Build and run with local storage
docker compose up --build

# Access at http://localhost:3000
```

### With Supabase Backend:

1. Update `.env.local` with Supabase credentials
2. Run:
```bash
docker compose up --build
```

---

## 🐛 Troubleshooting

### "Cannot find module" errors
```bash
npm install  # Reinstall dependencies
npm run build  # Build the project
```

### Port 3000 already in use
```bash
# Find and kill the process
lsof -i :3000
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

### YouTube download fails
- Check if `youtube-cookies.txt` exists
- Cookies may be expired - get fresh ones
- Some videos require authentication

### Supabase connection errors
- Verify environment variables in `.env.local`
- Check Supabase project is running
- Ensure API keys are correct
- Check network connectivity

### Audio file not found
- Ensure `local-data/` directory has write permissions
- Check disk space is available
- Download should appear in `local-data/downloads/`

---

## 📚 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── youtube-download/  # YouTube download API
│   │   ├── upload/            # File upload API
│   │   └── clips/             # Clips management API
│   ├── clip-creator/          # Clip creation UI
│   └── library/               # Audio library UI
├── lib/
│   ├── supabase.ts            # Supabase client
│   ├── local-database.ts      # Local storage
│   └── auth-*.tsx             # Authentication
└── components/
    └── audio/                 # Audio components
```

---

## 🔐 Authentication

### Local Auth:
- Username/password stored locally
- Test user: `test@example.com` / `password123`
- No cloud authentication needed

### Supabase Auth:
- Managed by Supabase
- Support for multiple auth methods
- Secure password hashing

---

## 🚢 Production Deployment

### Vercel (Recommended for Next.js):
1. Push to GitHub
2. Connect to Vercel
3. Set environment variables
4. Deploy

### Docker:
```bash
docker build -t chorus-lab .
docker run -p 3000:3000 -e NEXT_PUBLIC_SUPABASE_URL=... chorus-lab
```

---

## 📞 Support

For issues, check:
- `/health-report` endpoint for system status
- Browser console for errors
- Server logs in terminal

---

**Happy Chorusing! 🎵**
