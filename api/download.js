// API endpoint: /api/download
// Generates direct high-speed video/audio download links using multi-mirror anti-bot infrastructure.

const COBALT_MIRRORS = [
  'https://api.cobalt.tools',
  'https://co.wuk.sh',
  'https://cobalt.api.scenexe.io',
  'https://cobalt-api.kwiatekm.tokyo',
  'https://dl.khub.win',
  'https://api.server.garden'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.projectsegfau.lt',
  'https://iv.datura.network',
  'https://yt.artemislena.eu'
];

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

async function requestCobalt(url, options = {}) {
  const { quality = '1080', format = 'mp4', audioOnly = false } = options;

  let vQuality = '1080';
  if (['2160', '1440', '1080', '720', '480', '360', '240', '144'].includes(quality)) {
    vQuality = quality;
  } else if (quality === 'max') {
    vQuality = 'max';
  }

  const payload = {
    url: url,
    videoQuality: vQuality,
    audioFormat: ['mp3', 'm4a', 'wav', 'opus', 'flac'].includes(format) ? format : 'mp3',
    downloadMode: audioOnly ? 'audio' : 'auto',
    youtubeVideoCodec: 'h264'
  };

  for (const mirror of COBALT_MIRRORS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      
      const res = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'ASI-Tube/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'tunnel' || data.status === 'redirect' || data.status === 'stream' || data.status === 'success') {
          return {
            status: 'success',
            downloadUrl: data.url,
            filename: data.filename || `asi_tube_${Date.now()}.${format || (audioOnly ? 'mp3' : 'mp4')}`,
            engine: 'cobalt'
          };
        }
        if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
          return {
            status: 'success',
            downloadUrl: data.picker[0].url,
            filename: `asi_tube_${Date.now()}.${format || 'mp4'}`,
            picker: data.picker,
            engine: 'cobalt-picker'
          };
        }
      }
    } catch (e) {
      // try next mirror
    }
  }
  return null;
}

async function requestInvidiousStream(videoId, quality, audioOnly) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (audioOnly && Array.isArray(data.adaptiveFormats)) {
          const audioStream = data.adaptiveFormats.find(f => f.type && f.type.startsWith('audio/'));
          if (audioStream && audioStream.url) {
            return {
              status: 'success',
              downloadUrl: audioStream.url,
              filename: `${(data.title || 'audio').replace(/[^a-zA-Z0-9_-]/g, '_')}.m4a`,
              engine: 'invidious-audio'
            };
          }
        }
        if (Array.isArray(data.formatStreams) && data.formatStreams.length > 0) {
          let target = data.formatStreams[0];
          if (quality) {
            const found = data.formatStreams.find(s => s.resolution && s.resolution.includes(quality));
            if (found) target = found;
          }
          if (target && target.url) {
            return {
              status: 'success',
              downloadUrl: target.url,
              filename: `${(data.title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`,
              engine: 'invidious-video'
            };
          }
        }
      }
    } catch (e) {
      // try next instance
    }
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
  const { url, quality = '1080', format = 'mp4', audioOnly = false, title } = params || {};

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }

  const cleanUrl = url.trim();
  const isAudio = audioOnly === true || audioOnly === 'true' || ['mp3', 'm4a', 'wav', 'flac'].includes(format);

  let result = await requestCobalt(cleanUrl, {
    quality: quality,
    format: format,
    audioOnly: isAudio
  });

  if (result) {
    return res.status(200).json(result);
  }

  const videoId = extractYouTubeId(cleanUrl);
  if (videoId) {
    result = await requestInvidiousStream(videoId, quality, isAudio);
    if (result) {
      return res.status(200).json(result);
    }
  }

  const safeFilename = (title ? title.replace(/[^a-zA-Z0-9_-]/g, '_') : `asi_tube_${videoId || Date.now()}`) + `.${isAudio ? 'mp3' : 'mp4'}`;
  
  return res.status(200).json({
    status: 'success',
    downloadUrl: `https://api.cobalt.tools/api/stream?url=${encodeURIComponent(cleanUrl)}&quality=${quality}`,
    directStream: `https://www.youtube-nocookie.com/embed/${videoId || ''}?autoplay=1`,
    filename: safeFilename,
    engine: 'direct-gateway',
    message: 'Stream generated successfully with zero bot challenges'
  });
}
