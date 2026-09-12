// API endpoint: /api/download
// Generates direct high-speed video/audio download links.
// Guarantees +faststart seekable MP4 (moov atom at byte 0) and ID3v2 seekable MP3.
// Resolves timeline seeking (forward/backward) and prevents "unsupported format" errors when uploading.

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

  const rawTitle = (title || `asi_tube_${videoId || Date.now()}`)
    .replace(/[^a-zA-Z0-9_ -]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const cleanTitle = rawTitle && rawTitle.length > 0 ? rawTitle : `asi_tube_${Date.now()}`;
  const filename = `${cleanTitle}.${fileExt}`;

  // All downloads (YouTube, TikTok, Facebook, Instagram) route through /api/stream.
  // /api/stream applies ensureUniversalMp4 with -movflags +faststart, placing the moov atom at the front.
  // This guarantees smooth scrubbing (back and forth) and passes upload validation on Instagram, TikTok, and WhatsApp.
  const directParam = directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')
    ? `&directUrl=${encodeURIComponent(directUrl)}`
    : '';

  const streamDownloadUrl = `/api/stream?url=${encodeURIComponent(cleanUrl)}&quality=${encodeURIComponent(quality)}&format=${encodeURIComponent(fileExt)}&audioOnly=${isAudio}&title=${encodeURIComponent(cleanTitle)}${directParam}`;

  return res.status(200).json({
    status: 'success',
    downloadUrl: streamDownloadUrl,
    filename: filename,
    engine: 'universal-faststart-stream'
  });
}
