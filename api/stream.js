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

  // Build yt-dlp arguments
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

  // Stream output to stdout
  args.push('-o', '-');
  args.push(cleanUrl);

  // Set HTTP headers for direct browser download
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Transfer-Encoding': 'chunked'
  });

  const proc = spawn('yt-dlp', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let errorOutput = '';

  // Pipe stdout directly into response stream with backpressure handling
  proc.stdout.pipe(res);

  proc.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  proc.on('error', (err) => {
    console.error('yt-dlp stream process error:', err);
    if (!res.headersSent) {
      res.status(500).send(`Failed to start download stream: ${err.message}`);
    } else {
      res.end();
    }
  });

  proc.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) {
      console.warn(`yt-dlp stream process exited with code ${code}: ${errorOutput}`);
    }
  });

  // Only terminate process if client connection explicitly disconnected prematurely
  res.on('close', () => {
    if (!res.writableEnded && !proc.killed) {
      try {
        proc.kill();
      } catch (e) {}
    }
  });
}
