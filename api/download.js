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

  if (directUrl && directUrl.startsWith('http')) {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(directUrl)}&filename=${encodeURIComponent(filename)}`;
    return res.status(200).json({
      status: 'success',
      downloadUrl: proxyUrl,
      directStreamUrl: directUrl,
      filename: filename,
      engine: 'direct-cdn'
    });
  }

  const pyData = await extractWithPython(cleanUrl);
  if (pyData) {
    let targetStreamUrl = null;
    if (isAudio) {
      targetStreamUrl = pyData.audio_url;
    } else {
      const match = (pyData.video_streams || []).find(v => v.quality === quality) || pyData.video_streams?.[0];
      targetStreamUrl = match?.url || pyData.audio_url;
    }

    if (targetStreamUrl) {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetStreamUrl)}&filename=${encodeURIComponent(filename)}`;
      return res.status(200).json({
        status: 'success',
        downloadUrl: proxyUrl,
        directStreamUrl: targetStreamUrl,
        filename: filename,
        engine: 'yt-dlp-live'
      });
    }
  }

  const cloudDownloadUrl = `https://loader.to/api/button/?url=${encodeURIComponent(cleanUrl)}&f=${isAudio ? 'mp3' : (quality || '1080')}`;
  
  return res.status(200).json({
    status: 'success',
    downloadUrl: cloudDownloadUrl,
    filename: filename,
    engine: 'cloud-gateway'
  });
}
