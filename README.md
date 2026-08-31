# ASI TUBE ⚡ - Next-Gen Video & Audio Downloader

> **Fast, Free, and Zero-Bot-Error Online Video & Audio Downloader** built for 100% compatibility with **Vercel Serverless Hosting** and **Local Node.js Environments**.

---

## 🌟 Highlights & Features

- **🛡️ Zero Bot Errors**: Built with a multi-engine fallback architecture (Multi-Mirror Cobalt API, Invidious & Piped anti-bot proxies, and YouTube oEmbed stream resolvers) to prevent "Sign in to confirm you're not a bot" and HTTP 429 datacenter rate limits on cloud hosting.
- **🎬 Ultra HD Video Downloads**: 4K Ultra HD (2160p), 2K Quad HD (1440p), 1080p Full HD (60fps), 720p HD, 480p, and 360p in MP4 format with audio merged.
- **🎵 Master Quality Audio Extraction**: Convert YouTube videos into MP3 (320kbps Studio Quality, 256kbps, 192kbps, 128kbps), M4A/AAC, WAV, and FLAC.
- **⚡ In-App Video Search & Discovery**: Search YouTube directly on ASI TUBE with video cards, duration badges, and 1-click download shortcuts.
- **📱 1,000+ Platforms Supported**: YouTube, Shorts, TikTok (without watermark), Instagram Reels, Twitter/X, Twitch, SoundCloud, Vimeo, and Reddit.
- **🌓 Modern Aesthetics & Theme**: Responsive glassmorphism interface with dark mode and light mode toggle, glowing neon gradients, and instant clipboard paste support.
- **🚀 100% Vercel Serverless Ready**: Zero heavy background binary bottlenecks, lightweight Node.js Serverless Functions in `/api`, and clean static delivery via `/public`.

---

## 🛠️ Architecture

```
asi-tube/
├── api/
│   ├── info.js        # Serverless Function: extracts media info & format matrix
│   ├── download.js    # Serverless Function: anti-bot multi-mirror download link resolver
│   ├── search.js      # Serverless Function: in-app YouTube video search
│   └── proxy.js       # Serverless Function: stream & CORS proxy
├── public/
│   ├── index.html     # Responsive Single-Page Application
│   ├── favicon.svg    # ASI TUBE neon brand icon
│   ├── css/
│   │   └── style.css  # Dark/Light theme glassmorphism design system
│   └── js/
│       ├── api.js     # Multi-engine client API layer
│       ├── ui.js      # UI renderer, format tables, modals & toasts
│       └── app.js     # Controller, clipboard auto-paste & event bindings
├── server.js          # Local Express development server with exact Vercel parity
├── vercel.json        # Vercel deployment configuration
├── package.json       # Node.js project manifest
└── README.md          # Documentation
```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm start
```

Open your browser at **`http://localhost:3000`** to enjoy ASI TUBE!

---

## ☁️ Deploy to Vercel in 1-Click

1. Push this repository to your **GitHub** account.
2. Go to [vercel.com/new](https://vercel.com/new) and import your `asi-tube` repository.
3. Keep default settings (Framework Preset: **Other**).
4. Click **Deploy**. Your site will be live worldwide in seconds!

---

## 📜 License
MIT License. Created with ❤️ for personal and educational use.
