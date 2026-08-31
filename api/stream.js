// API endpoint: /api/stream
// Direct high-speed on-site video/audio streaming and downloading pipeline.

import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';

function extractYouTubeId(url) {
  if (!url) return null;
  const str = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/
  ];
  for (const regex of patterns) {
    const match = str.match(regex);
    if (match && match[1]) return match[1];
  }
  return null;
}

function sanitizeFilename(name, ext) {
  let clean = (name || 'video')
    .replace(/[^\w\s.-]/gi, '')
    .trim()
    .replace(/\s+/g, '_');
  if (!clean) clean = 'video_' + Date.now();
  if (!clean.endsWith(`.${ext}`)) {
    clean += `.${ext}`;
  }
  return clean;
}

// Background server-side resolver for Vercel Serverless
async function resolveCloudStream(url, format, quality, isAudio) {
  let f = isAudio ? 'mp3' : (quality || '1080');
  if (['320', '256', '192', '128'].includes(quality)) f = 'mp3';
  if (format === 'm4a') f = 'm4a';

  const initUrl = 'https://loader.to/ajax/download.php?button=1&start=1&end=1&format=' + encodeURIComponent(f) + '&url=' + encodeURIComponent(url);
  const res = await fetch(initUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://loader.to/'
    }
  });
  if (!res.ok) throw new Error('Init failed');
  const data = await res.json();
  if (!data.id) throw new Error('No conversion ID');

  const progressUrl = data.progress_url || ('https://loader.to/ajax/progress.php?id=' + data.id);
  
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1200));
    const pRes = await fetch(progressUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://loader.to/'
      }
    });
    if (!pRes.ok) continue;
    const pData = await pRes.json();
    if (pData.download_url && pData.download_url.startsWith('http')) {
      return pData.download_url;
    }
  }
  throw new Error('Timeout waiting for stream');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const params = req.method === 'POST' ? req.body : req.query;
  const {
    url,
    quality = '1080',
    format = 'mp4',
    audioOnly = false,
    title = ''
  } = params || {};

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).send('Error: Valid video URL is required.');
  }

  const cleanUrl = url.trim();
  const isAudio = audioOnly === true || audioOnly === 'true' || ['mp3', 'm4a', 'wav', 'flac'].includes(format);
  const fileExt = isAudio ? (format === 'mp3' ? 'mp3' : (format || 'mp3')) : (format || 'mp4');
  const filename = sanitizeFilename(title || `asi_tube_${extractYouTubeId(cleanUrl) || Date.now()}`, fileExt);

  // Content type mapping
  const contentTypes = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    flac: 'audio/flac'
  };
  const contentType = contentTypes[fileExt] || (isAudio ? 'audio/mpeg' : 'video/mp4');

  // Try local yt-dlp first (if installed in local environment)
  let localSpawnWorked = false;
  try {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=ios,android,web,tv_embedded',
      '--geo-bypass'
    ];

    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      args.push('--ffmpeg-location', ffmpegPath);
    }

    if (isAudio) {
      args.push('-x');
      args.push('--audio-format', fileExt === 'mp3' ? 'mp3' : fileExt);
      const audioBitrate = quality && ['320', '256', '192', '128'].includes(quality) ? `${quality}k` : '320k';
      args.push('--audio-quality', audioBitrate);
    } else {
      const maxH = parseInt(quality, 10) || 1080;
      args.push('-f', `bestvideo[height<=${maxH}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${maxH}]+bestaudio/best[height<=${maxH}]/best`);
      args.push('--postprocessor-args', 'ffmpeg:-movflags frag_keyframe+empty_moov+default_base_moof');
    }

    args.push('-o', '-');
    args.push(cleanUrl);

    const proc = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.on('error', async () => {
      // Local yt-dlp binary missing (e.g. on Vercel) -> Fallback to cloud CDN stream
      if (!res.headersSent) {
        try {
          const directCdn = await resolveCloudStream(cleanUrl, fileExt, quality, isAudio);
          return res.redirect(302, directCdn);
        } catch (cloudErr) {
          return res.status(500).send('Download stream could not be generated.');
        }
      }
    });

    proc.stdout.once('data', (chunk) => {
      localSpawnWorked = true;
      if (!res.headersSent) {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Transfer-Encoding': 'chunked'
        });
      }
      res.write(chunk);
      proc.stdout.pipe(res);
    });

    res.on('close', () => {
      if (!res.writableEnded && !proc.killed) {
        try { proc.kill(); } catch (e) {}
      }
    });

    return;
  } catch (err) {
    console.warn('Local spawn failed, using cloud stream pipeline...', err.message);
  }

  // Fallback for pure serverless environments (Vercel)
  try {
    const directCdn = await resolveCloudStream(cleanUrl, fileExt, quality, isAudio);
    return res.redirect(302, directCdn);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).send(`Stream resolution failed: ${err.message}`);
    }
  }
}
