// API endpoint: /api/stream
// Direct high-speed on-site video/audio streaming and downloading pipeline.
// Produces 100% Facebook & WhatsApp compatible H.264 (AVC) + AAC MP4 videos with +faststart seeking.

import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// Active download tasks to prevent duplicate downloads for the same media
const activeJobs = new Map();

// Local cache directory for fast serving and seekable range requests
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create local temp dir, falling back to os tmpdir', e.message);
  }
}

const STORAGE_DIR = fs.existsSync(TEMP_DIR) ? TEMP_DIR : path.join(os.tmpdir(), 'asi_tube');
if (!fs.existsSync(STORAGE_DIR)) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch (e) {}
}

// Clean up cached files older than 1 hour to avoid filling disk
function cleanupOldCache() {
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(STORAGE_DIR, f);
      try {
        const stats = fs.statSync(fp);
        if (now - stats.mtimeMs > 3600 * 1000) {
          fs.unlinkSync(fp);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// Periodically run cleanup every 30 minutes
setInterval(cleanupOldCache, 30 * 60 * 1000);

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

// Background cloud resolver fallback for pure serverless environments (Vercel)
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

// Serve a fully rendered file with HTTP Range and Content-Length support
function serveCompleteFile(req, res, filePath, filename, contentType) {
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const safeFilename = encodeURIComponent(filename);
    const disposition = `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, {
          'Content-Range': `bytes */${fileSize}`,
          'Content-Type': contentType
        });
        return res.end();
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=3600'
      });

      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=3600'
      });

      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('Error streaming cached file:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal error streaming file.');
    }
  }
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
  const videoId = extractYouTubeId(cleanUrl);
  const isAudio = audioOnly === true || audioOnly === 'true' || ['mp3', 'm4a', 'wav', 'flac'].includes(format);
  const fileExt = isAudio ? (format === 'mp3' ? 'mp3' : (format || 'mp3')) : (format || 'mp4');
  const filename = sanitizeFilename(title || `asi_tube_${videoId || Date.now()}`, fileExt);

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

  // Compute unique hash key for this media file
  const hashKey = crypto
    .createHash('md5')
    .update(`${videoId || cleanUrl}_${quality}_${fileExt}_${isAudio}`)
    .digest('hex')
    .substring(0, 16);

  const targetFilePath = path.join(STORAGE_DIR, `${hashKey}.${fileExt}`);

  // 1. If file already exists and is complete (>10KB), serve it directly
  if (fs.existsSync(targetFilePath)) {
    try {
      const stats = fs.statSync(targetFilePath);
      if (stats.size > 10240) {
        return serveCompleteFile(req, res, targetFilePath, filename, contentType);
      } else {
        fs.unlinkSync(targetFilePath);
      }
    } catch (e) {}
  }

  // 2. If a download task for this exact file is currently in progress, wait for it
  if (activeJobs.has(hashKey)) {
    try {
      await activeJobs.get(hashKey);
      if (fs.existsSync(targetFilePath)) {
        return serveCompleteFile(req, res, targetFilePath, filename, contentType);
      }
    } catch (err) {
      console.warn('Existing active job failed:', err.message);
    }
  }

  // 3. Download & process video using yt-dlp + ffmpeg
  const jobPromise = (async () => {
    const tempPartPath = `${targetFilePath}.part`;
    if (fs.existsSync(tempPartPath)) {
      try { fs.unlinkSync(tempPartPath); } catch (e) {}
    }

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
      args.push('-o', tempPartPath);
    } else {
      const maxH = parseInt(quality, 10) || 1080;

      // Facebook & WhatsApp video standard:
      // 1. Strictly prioritize H.264 (avc1) video and AAC (m4a) audio
      // 2. Fall back to best video + best audio and recode if necessary
      // 3. Merge output into standard MP4
      // 4. Apply +faststart to move moov atom to beginning of file for instant forward/seeking
      args.push('-S', `res:${maxH},vcodec:h264,acodec:m4a`);
      args.push(
        '-f',
        `bestvideo[height<=${maxH}][vcodec^=avc1]+bestaudio[ext=m4a]/` +
        `bestvideo[height<=${maxH}][vcodec^=avc]+bestaudio[acodec^=mp4a]/` +
        `bestvideo[height<=${maxH}]+bestaudio/best[height<=${maxH}]/best`
      );
      args.push('--merge-output-format', 'mp4');
      args.push('--recode-video', 'mp4');
      args.push('--postprocessor-args', 'ffmpeg:-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart');
      args.push('-o', tempPartPath);
    }

    args.push(cleanUrl);

    return new Promise((resolve, reject) => {
      const proc = spawn('yt-dlp', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderrLog = '';
      proc.stderr.on('data', (d) => {
        stderrLog += d.toString();
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Check if yt-dlp output to tempPartPath or tempPartPath.mp4
          let finalGeneratedPath = tempPartPath;
          if (!fs.existsSync(finalGeneratedPath)) {
            const possibleNames = [
              `${tempPartPath}.${fileExt}`,
              tempPartPath.replace(/\\.part$/, `.${fileExt}`),
              `${tempPartPath}.mp4`,
              `${tempPartPath}.mp3`,
              `${tempPartPath}.m4a`
            ];
            for (const p of possibleNames) {
              if (fs.existsSync(p)) {
                finalGeneratedPath = p;
                break;
              }
            }
          }

          if (fs.existsSync(finalGeneratedPath)) {
            try {
              if (finalGeneratedPath !== targetFilePath) {
                fs.renameSync(finalGeneratedPath, targetFilePath);
              }
              return resolve(targetFilePath);
            } catch (renameErr) {
              return resolve(finalGeneratedPath);
            }
          }
          reject(new Error('Processed file not found on disk: ' + stderrLog.slice(-300)));
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderrLog.slice(-300)}`));
        }
      });
    });
  })();

  activeJobs.set(hashKey, jobPromise);

  try {
    await jobPromise;
    activeJobs.delete(hashKey);

    if (fs.existsSync(targetFilePath)) {
      return serveCompleteFile(req, res, targetFilePath, filename, contentType);
    } else {
      throw new Error('Completed file could not be verified on disk');
    }
  } catch (err) {
    activeJobs.delete(hashKey);
    console.warn('Local yt-dlp generation failed or unavailable:', err.message);

    // Fallback for cloud/serverless environment (Vercel) without local yt-dlp
    try {
      const directCdn = await resolveCloudStream(cleanUrl, fileExt, quality, isAudio);
      return res.redirect(302, directCdn);
    } catch (cloudErr) {
      if (!res.headersSent) {
        res.status(500).send(`Video stream generation failed: ${err.message}`);
      }
    }
  }
}
