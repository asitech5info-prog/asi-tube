// API endpoint: /api/download
// Generates direct high-speed video/audio download links.

import { exec } from 'child_process';
import path from 'path';

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

function extractWithPython(url) {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'extractor.py');
    exec(`python "${scriptPath}" "${url}"`, { timeout: 15000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      try {
        const data = JSON.parse(stdout.trim());
        if (data && data.title && !data.error) return resolve(data);
      } catch (e) {}
      resolve(null);
    });
  });
}

// Background server-side resolver for Vercel Serverless & cloud hosting
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
      return {
        downloadUrl: pData.download_url,
        title: pData.title || data.title
      };
    }
  }
  throw new Error('Timeout waiting for stream');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const params = req.method === 'POST' ? req.body : req.query;
  const { url, quality = '1080', format = 'mp4', audioOnly = false, title, directUrl } = params || {};

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }

  const cleanUrl = url.trim();
  const videoId = extractYouTubeId(cleanUrl);
  const isAudio = audioOnly === true || audioOnly === 'true' || ['mp3', 'm4a', 'wav', 'flac'].includes(format);
  const fileExt = isAudio ? (format === 'mp3' ? 'mp3' : 'm4a') : (format || 'mp4');
  
  const cleanTitle = (title || `asi_tube_${videoId || Date.now()}`).replace(/[^a-zA-Z0-9_ -]/g, '').trim().replace(/\s+/g, '_');
  const filename = `${cleanTitle}.${fileExt}`;

  // 1. If running in cloud/Vercel (or VERCEL env variable is set), resolve high-speed direct CDN link
  try {
    const cloudStream = await resolveCloudStream(cleanUrl, fileExt, quality, isAudio);
    if (cloudStream && cloudStream.downloadUrl) {
      return res.status(200).json({
        status: 'success',
        downloadUrl: cloudStream.downloadUrl,
        filename: filename,
        engine: 'cloud-cdn'
      });
    }
  } catch (err) {
    console.warn('Cloud resolver fallback to local stream endpoint...', err.message);
  }

  // 2. Local / VPS stream endpoint
  const streamDownloadUrl = `/api/stream?url=${encodeURIComponent(cleanUrl)}&quality=${encodeURIComponent(quality)}&format=${encodeURIComponent(fileExt)}&audioOnly=${isAudio}&title=${encodeURIComponent(cleanTitle)}`;

  return res.status(200).json({
    status: 'success',
    downloadUrl: streamDownloadUrl,
    filename: filename,
    engine: 'on-site-stream'
  });
}
