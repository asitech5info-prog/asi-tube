// API endpoint: /api/info
// Extracts full media details and direct stream links for YouTube, Facebook, Instagram Reels, and TikTok (watermark-free).

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

function detectPlatform(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  return 'generic';
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'HD';
  const sec = parseInt(seconds, 10);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatNumber(num) {
  if (!num || isNaN(num)) return 'Trending';
  const n = parseInt(num, 10);
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B views';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M views';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K views';
  return n.toLocaleString() + ' views';
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '~ MB';
  const b = parseInt(bytes, 10);
  if (b >= 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  return (b / 1024).toFixed(0) + ' KB';
}

function calculateEstimatedSize(durationSeconds, quality) {
  const d = durationSeconds || 180;
  const bitrates = {
    '2160': 18000,
    '1440': 9000,
    '1080': 4500,
    '720': 2200,
    '480': 1100,
    '360': 600,
    '320': 320,
    '256': 256,
    '192': 192,
    '128': 128
  };
  const kbps = bitrates[quality] || 1500;
  const mb = (kbps * d) / (8 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  return mb.toFixed(1) + ' MB';
}

function extractWithPython(url) {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'extractor.py');
    // Escape double quotes inside url parameter safely
    const safeUrl = url.replace(/"/g, '\\"');
    exec(`python "${scriptPath}" "${safeUrl}"`, { timeout: 35000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err || !stdout) {
        console.warn('Python extractor warning:', err?.message || stderr);
        return resolve(null);
      }
      try {
        const data = JSON.parse(stdout.trim());
        if (data && data.title && !data.error) {
          return resolve(data);
        }
      } catch (e) {
        console.warn('Failed to parse Python extractor JSON output:', e.message);
      }
      resolve(null);
    });
  });
}

async function extractTikTokNative(url) {
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== 0 || !json.data) return null;

    const d = json.data;
    const duration = d.duration || 15;
    const videoStreams = [];

    if (d.hdplay) {
      videoStreams.push({
        quality: '1080',
        resolution: 'Full HD (1080p) - No Watermark',
        format: 'mp4',
        fps: 60,
        estimatedSize: d.hd_size ? formatBytes(d.hd_size) : calculateEstimatedSize(duration, '1080'),
        directUrl: d.hdplay,
        note: 'Full HD No-WM'
      });
    }

    if (d.play) {
      videoStreams.push({
        quality: '720',
        resolution: 'HD (720p) - No Watermark',
        format: 'mp4',
        fps: 30,
        estimatedSize: d.size ? formatBytes(d.size) : calculateEstimatedSize(duration, '720'),
        directUrl: d.play,
        note: 'HD No-WM'
      });
    }

    const audioFormats = [];
    if (d.music) {
      audioFormats.push(
        { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '320'), directUrl: d.music, note: 'Studio Quality' },
        { quality: '128', bitrate: '128 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '128'), directUrl: d.music, note: 'Standard MP3' }
      );
    }

    const thumbnails = [];
    if (d.cover || d.origin_cover) {
      thumbnails.push({
        resolution: 'Original HD',
        quality: 'TikTok Cover Art',
        url: d.origin_cover || d.cover
      });
    }

    return {
      id: String(d.id || Date.now()),
      url: url,
      platform: 'tiktok',
      title: d.title || 'TikTok Video',
      description: d.title || '',
      author: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
      authorUrl: d.author?.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : '',
      duration: duration,
      durationFormatted: formatDuration(duration),
      views: d.play_count || 0,
      viewsFormatted: formatNumber(d.play_count),
      thumbnail: d.cover || d.origin_cover || '',
      formats: {
        video: videoStreams.length > 0 ? videoStreams : [
          { quality: '720', resolution: 'HD (720p)', format: 'mp4', fps: 30, estimatedSize: '~ MB', directUrl: d.play, note: 'HD MP4' }
        ],
        audio: audioFormats,
        thumbnails: thumbnails
      },
      source: 'tikwm-native'
    };
  } catch (e) {
    console.warn('TikWM native extraction error:', e.message);
    return null;
  }
}

async function extractFacebookNative(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const videoMatch = html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i) || html.match(/<meta\s+property="og:video:url"\s+content="([^"]+)"/i);
    const hdMatch = html.match(/browser_native_hd_url["':\s]+([^"'\s}]+)/i);
    const sdMatch = html.match(/browser_native_sd_url["':\s]+([^"'\s}]+)/i);

    const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'") : 'Facebook Video';
    const description = descMatch ? descMatch[1].replace(/&amp;/g, '&') : '';
    const thumbnail = thumbMatch ? thumbMatch[1].replace(/&amp;/g, '&') : '';

    const cleanHdUrl = hdMatch ? hdMatch[1].replace(/\\/g, '') : (videoMatch ? videoMatch[1].replace(/&amp;/g, '&') : null);
    const cleanSdUrl = sdMatch ? sdMatch[1].replace(/\\/g, '') : null;

    if (!cleanHdUrl && !cleanSdUrl && !videoMatch) return null;

    const videoStreams = [];
    if (cleanHdUrl) {
      videoStreams.push({
        quality: '1080',
        resolution: 'Full HD / HD (Facebook MP4)',
        format: 'mp4',
        fps: 30,
        estimatedSize: 'HD Stream',
        directUrl: cleanHdUrl,
        note: 'High Definition'
      });
    }
    if (cleanSdUrl && cleanSdUrl !== cleanHdUrl) {
      videoStreams.push({
        quality: '480',
        resolution: 'SD Quality (Standard Definition MP4)',
        format: 'mp4',
        fps: 30,
        estimatedSize: 'SD Stream',
        directUrl: cleanSdUrl,
        note: 'Standard Definition'
      });
    }

    return {
      id: `fb_${Date.now()}`,
      url: url,
      platform: 'facebook',
      title: title,
      description: description,
      author: 'Facebook Creator',
      authorUrl: '',
      duration: 60,
      durationFormatted: 'HD Video',
      views: 0,
      viewsFormatted: 'Trending',
      thumbnail: thumbnail,
      formats: {
        video: videoStreams,
        audio: [
          { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Studio Quality MP3' },
          { quality: '128', bitrate: '128 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Standard MP3' }
        ],
        thumbnails: thumbnail ? [{ resolution: 'Original HD', quality: 'Cover Image', url: thumbnail }] : []
      },
      source: 'facebook-native'
    };
  } catch (e) {
    console.warn('Facebook native extraction error:', e.message);
    return null;
  }
}

async function extractInstagramNative(url) {
  try {
    const oembedUrl = `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (res.ok) {
      const data = await res.json();
      return {
        id: `ig_${Date.now()}`,
        url: url,
        platform: 'instagram',
        title: data.title || (data.author_name ? `Instagram Reel by ${data.author_name}` : 'Instagram Reel'),
        description: data.title || '',
        author: data.author_name || 'Instagram Creator',
        authorUrl: data.author_url || '',
        duration: 30,
        durationFormatted: 'HD Reel',
        views: 0,
        viewsFormatted: 'Viral',
        thumbnail: data.thumbnail_url || '',
        formats: {
          video: [
            { quality: '1080', resolution: 'Original Quality (Full HD MP4)', format: 'mp4', fps: 30, estimatedSize: 'HD Video', directUrl: null, note: 'Full HD' }
          ],
          audio: [
            { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Audio Track' }
          ],
          thumbnails: data.thumbnail_url ? [{ resolution: 'Original', quality: 'Cover Photo', url: data.thumbnail_url }] : []
        },
        source: 'instagram-oembed'
      };
    }
  } catch (e) {
    console.warn('Instagram native extraction error:', e.message);
  }
  return null;
}

async function fetchFromOEmbed(videoId, rawUrl) {
  try {
    const videoUrl = rawUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (match) {
        const pData = JSON.parse(match[1]);
        const details = pData.videoDetails || {};
        const duration = parseInt(details.lengthSeconds || '180', 10);
        const thumbs = details.thumbnail?.thumbnails || [];
        const bestThumb = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        return {
          id: videoId,
          url: videoUrl,
          title: details.title || 'YouTube Video',
          author: details.author || 'YouTube Creator',
          authorUrl: `https://www.youtube.com/channel/${details.channelId || ''}`,
          duration: duration,
          durationFormatted: formatDuration(duration),
          views: parseInt(details.viewCount || '0', 10),
          viewsFormatted: formatNumber(details.viewCount),
          thumbnail: bestThumb,
          description: details.shortDescription || '',
          publishedAt: ''
        };
      }
    }

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const data = await res.json();
      return {
        id: videoId,
        url: videoUrl,
        title: data.title || 'YouTube Video',
        author: data.author_name || 'YouTube Creator',
        authorUrl: data.author_url || '',
        duration: 180,
        durationFormatted: 'HD Video',
        views: 0,
        viewsFormatted: 'Viral',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        description: '',
        publishedAt: ''
      };
    }
  } catch (e) { }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = (req.method === 'POST' ? req.body?.url : req.query?.url) || '';

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Please provide a valid video URL' });
  }

  const cleanUrl = url.trim();
  const platform = detectPlatform(cleanUrl);
  const videoId = extractYouTubeId(cleanUrl);

  // 1. TikTok: Fast native extraction via TikWM (watermark-free Full HD)
  if (platform === 'tiktok') {
    const tikData = await extractTikTokNative(cleanUrl);
    if (tikData && tikData.title) {
      return res.status(200).json(tikData);
    }
  }

  // 2. Try Python extractor (yt-dlp) if available locally
  let pyData = await extractWithPython(cleanUrl);

  if (pyData && pyData.title) {
    const duration = pyData.duration || 60;
    const detectedPlatform = pyData.platform || platform;

    const videoFormats = (pyData.video_streams || []).map(vs => ({
      quality: vs.quality,
      resolution: vs.resolution,
      format: vs.format || 'mp4',
      fps: vs.fps || 30,
      estimatedSize: vs.filesize ? formatBytes(vs.filesize) : calculateEstimatedSize(duration, vs.quality),
      directUrl: detectedPlatform === 'youtube' ? null : vs.url,
      note: vs.quality >= 1080 ? (detectedPlatform === 'tiktok' ? 'No Watermark Full HD' : 'Full HD') : 'HD'
    }));

    const directAudio = detectedPlatform === 'youtube' ? null : pyData.audio_url;
    const audioFormats = [
      { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '320'), directUrl: directAudio, note: 'Studio Quality' },
      { quality: '256', bitrate: '256 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '256'), directUrl: directAudio, note: 'High Definition' },
      { quality: '128', bitrate: '128 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '128'), directUrl: directAudio, note: 'Standard MP3' },
      { quality: 'm4a', bitrate: 'Original Audio Stream', format: 'm4a', estimatedSize: calculateEstimatedSize(duration, '192'), directUrl: directAudio, note: 'Native Audio' }
    ];

    const thumbnails = [];
    if (pyData.thumbnail) {
      thumbnails.push({
        resolution: 'Original HD',
        quality: 'Cover Art / Thumbnail',
        url: pyData.thumbnail
      });
    }
    if (videoId) {
      thumbnails.push(
        { resolution: '1280x720', quality: 'Ultra HD', url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` },
        { resolution: '640x480', quality: 'High Quality', url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }
      );
    }

    return res.status(200).json({
      id: pyData.id || videoId || `media_${Date.now()}`,
      url: cleanUrl,
      platform: detectedPlatform,
      title: pyData.title,
      description: pyData.description || '',
      author: pyData.author,
      authorUrl: '',
      duration: duration,
      durationFormatted: formatDuration(duration),
      views: pyData.views || 0,
      viewsFormatted: formatNumber(pyData.views),
      thumbnail: pyData.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : ''),
      formats: {
        video: videoFormats.length > 0 ? videoFormats : [
          { quality: '1080', resolution: 'Full HD (1080p)', format: 'mp4', fps: 30, estimatedSize: calculateEstimatedSize(duration, '1080'), directUrl: null },
          { quality: '720', resolution: 'HD (720p)', format: 'mp4', fps: 30, estimatedSize: calculateEstimatedSize(duration, '720'), directUrl: null }
        ],
        audio: audioFormats,
        thumbnails: thumbnails
      },
      source: detectedPlatform === 'tiktok' ? 'tikwm-nowm' : 'yt-dlp'
    });
  }

  // 3. Facebook Native Fallback for Vercel / serverless
  if (platform === 'facebook') {
    const fbData = await extractFacebookNative(cleanUrl);
    if (fbData && fbData.title) {
      return res.status(200).json(fbData);
    }
  }

  // 4. Instagram Native Fallback for Vercel / serverless
  if (platform === 'instagram') {
    const igData = await extractInstagramNative(cleanUrl);
    if (igData && igData.title) {
      return res.status(200).json(igData);
    }
  }

  // 5. YouTube Fallback for Vercel / serverless
  if (videoId) {
    const oembedData = await fetchFromOEmbed(videoId, cleanUrl);
    const duration = oembedData?.duration || 180;
    return res.status(200).json({
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      platform: 'youtube',
      title: oembedData?.title || `YouTube Video (${videoId})`,
      description: oembedData?.description || '',
      author: oembedData?.author || 'YouTube Creator',
      authorUrl: oembedData?.authorUrl || '',
      duration: duration,
      durationFormatted: formatDuration(duration),
      views: oembedData?.views || 0,
      viewsFormatted: oembedData?.viewsFormatted || 'Trending',
      thumbnail: oembedData?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      formats: {
        video: [
          { quality: '1080', resolution: 'Full HD (1080p60)', format: 'mp4', fps: 60, estimatedSize: calculateEstimatedSize(duration, '1080'), directUrl: null },
          { quality: '720', resolution: 'HD (720p)', format: 'mp4', fps: 30, estimatedSize: calculateEstimatedSize(duration, '720'), directUrl: null },
          { quality: '480', resolution: 'SD (480p)', format: 'mp4', fps: 30, estimatedSize: calculateEstimatedSize(duration, '480'), directUrl: null },
          { quality: '360', resolution: 'Mobile (360p)', format: 'mp4', fps: 30, estimatedSize: calculateEstimatedSize(duration, '360'), directUrl: null }
        ],
        audio: [
          { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '320'), directUrl: null },
          { quality: '128', bitrate: '128 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '128'), directUrl: null },
          { quality: 'm4a', bitrate: 'Original M4A', format: 'm4a', estimatedSize: calculateEstimatedSize(duration, '192'), directUrl: null }
        ],
        thumbnails: [
          { resolution: '1280x720', quality: 'Ultra HD', url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` },
          { resolution: '640x480', quality: 'High Quality', url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }
        ]
      },
      source: 'native-resolver'
    });
  }

  return res.status(400).json({
    error: `Could not retrieve video details from this link. Please verify that the ${platform !== 'generic' ? platform : ''} video is public.`
  });
}
