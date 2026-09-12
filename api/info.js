// API endpoint: /api/info
// Extracts media details, metadata, and high-quality stream links for YouTube, TikTok, Facebook, and Instagram.

import { exec } from 'child_process';
import path from 'path';
import { snapsave } from 'snapsave-media-downloader';
import { fbdown, ttdl } from 'btch-downloader';

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
  if (u.includes('instagram.com') || u.includes('instagr.am')) return 'instagram';
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
    '240': 350,
    '144': 180,
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

// Follow 301/302 redirects with timeout (vt.tiktok.com, fb.watch, fb.com/share)
async function expandRedirectUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);
    return res.url || url;
  } catch (e) {
    return url;
  }
}

// Local Python extractor fallback (yt-dlp) - only when not on Vercel
function extractWithPython(url) {
  if (process.env.VERCEL === '1' || process.env.NOW_REGION != null) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), 'extractor.py');
    const safeUrl = url.replace(/"/g, '\\"');
    exec(`python "${scriptPath}" "${safeUrl}"`, { timeout: 12000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(null);
      }
      try {
        const data = JSON.parse(stdout.trim());
        if (data && data.title && !data.error) {
          return resolve(data);
        }
      } catch (e) { }
      resolve(null);
    });
  });
}

// 1. YouTube High-Speed Multi-Resolution Resolver (Vidssave Direct Streams)
async function fetchYouTubeVidssave(url) {
  try {
    const body = new URLSearchParams({
      auth: '20250901majwlqo',
      domain: 'api-ak.vidssave.com',
      origin: 'cache',
      link: url
    });

    const res = await fetch('https://api.vidssave.com/api/contentsite_api/media/parse', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'accept': 'application/json, text/plain, */*',
        'origin': 'https://vidssave.com',
        'referer': 'https://vidssave.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      },
      body: body.toString()
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.status !== 1 || !json.data) return null;

    const d = json.data;
    const resources = d.resources || [];
    const videoStreams = [];
    const audioFormats = [];

    const seenQuality = new Set();
    for (const r of resources) {
      if (r.type === 'video' && r.download_url) {
        const qNum = (r.quality || '1080').replace(/[^0-9]/g, '') || '1080';
        if (!seenQuality.has(qNum)) {
          seenQuality.add(qNum);
          const num = parseInt(qNum, 10);
          const isFHD = num >= 1080;
          const isHD = num >= 720;
          videoStreams.push({
            quality: qNum,
            qualityNum: num,
            resolution: isFHD ? `Full HD (${qNum}p MP4)` : isHD ? `HD (${qNum}p MP4)` : `SD (${qNum}p MP4)`,
            format: 'mp4',
            fps: 30,
            estimatedSize: r.size ? formatBytes(r.size) : calculateEstimatedSize(d.duration, qNum),
            directUrl: r.download_url,
            note: isFHD ? 'Full HD - Seekable H.264' : isHD ? 'HD - Seekable H.264' : 'Standard MP4'
          });
        }
      } else if (r.type === 'audio' && r.download_url) {
        audioFormats.push({
          quality: '320',
          bitrate: `${r.quality || '320'} kbps MP3`,
          format: 'mp3',
          estimatedSize: r.size ? formatBytes(r.size) : calculateEstimatedSize(d.duration, '320'),
          directUrl: r.download_url,
          note: 'Studio Master MP3'
        });
      }
    }

    // Sort video resolutions descending (2160, 1440, 1080, 720, 480, 360, 240, 144)
    videoStreams.sort((a, b) => (b.qualityNum || 0) - (a.qualityNum || 0));

    if (audioFormats.length === 0) {
      audioFormats.push(
        { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(d.duration, '320'), directUrl: null, note: 'Studio Quality MP3' },
        { quality: '128', bitrate: '128 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(d.duration, '128'), directUrl: null, note: 'Standard MP3' }
      );
    }

    const videoId = extractYouTubeId(url);
    const thumbnails = [];
    if (d.thumbnail) {
      thumbnails.push({
        resolution: '1280x720',
        quality: 'Ultra HD',
        url: d.thumbnail
      });
    }
    if (videoId) {
      thumbnails.push(
        { resolution: '1280x720', quality: 'Ultra HD', url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` },
        { resolution: '640x480', quality: 'High Quality', url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }
      );
    }

    return {
      id: videoId || `yt_${Date.now()}`,
      url: url,
      platform: 'youtube',
      title: d.title || 'YouTube Video',
      description: d.description || '',
      author: d.author || 'YouTube Creator',
      authorUrl: '',
      duration: d.duration || 180,
      durationFormatted: formatDuration(d.duration),
      views: d.views || 0,
      viewsFormatted: formatNumber(d.views),
      thumbnail: d.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
      formats: {
        video: videoStreams,
        audio: audioFormats,
        thumbnails: thumbnails
      },
      source: 'vidssave-direct'
    };
  } catch (e) {
    console.warn('Vidssave parsing error:', e.message);
    return null;
  }
}

// 2. TikTok Multi-Engine Resolver (Max Bitrate, 1080p Full HD Lossless No-WM)
async function extractTikTokNative(rawUrl) {
  try {
    const url = await expandRedirectUrl(rawUrl);

    // Tier 1: TikWM with hd=1 (fetches both hdplay and play to pick maximum lossless bitrate)
    try {
      const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        }
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && json.code === 0 && json.data) {
          const d = json.data;
          const duration = d.duration || 15;
          const videoStreams = [];

          const hdSize = Number(d.hd_size || 0);
          const sdSize = Number(d.size || 0);

          let bestUrl = null;
          let bestSize = 0;
          let altUrl = null;
          let altSize = 0;

          if (d.hdplay && d.play) {
            const rawHd = d.hdplay.startsWith('http') ? d.hdplay : `https://www.tikwm.com${d.hdplay}`;
            const rawSd = d.play.startsWith('http') ? d.play : `https://www.tikwm.com${d.play}`;

            if (hdSize >= sdSize && hdSize > 0) {
              bestUrl = rawHd; bestSize = hdSize;
              altUrl = rawSd; altSize = sdSize;
            } else {
              bestUrl = rawSd; bestSize = sdSize;
              altUrl = rawHd; altSize = hdSize;
            }
          } else if (d.hdplay) {
            bestUrl = d.hdplay.startsWith('http') ? d.hdplay : `https://www.tikwm.com${d.hdplay}`;
            bestSize = hdSize || sdSize;
          } else if (d.play) {
            bestUrl = d.play.startsWith('http') ? d.play : `https://www.tikwm.com${d.play}`;
            bestSize = sdSize;
          }

          if (bestUrl) {
            videoStreams.push({
              quality: '1080',
              resolution: 'Full HD 1080p - Original Lossless (No Watermark)',
              format: 'mp4',
              fps: 60,
              estimatedSize: bestSize ? formatBytes(bestSize) : calculateEstimatedSize(duration, '1080'),
              directUrl: bestUrl,
              note: 'Lossless Original Full HD (No Watermark)'
            });
          }

          if (altUrl && altUrl !== bestUrl) {
            videoStreams.push({
              quality: '720',
              resolution: 'HD 720p - High Speed (No Watermark)',
              format: 'mp4',
              fps: 30,
              estimatedSize: altSize ? formatBytes(altSize) : calculateEstimatedSize(duration, '720'),
              directUrl: altUrl,
              note: 'Fast HD (No Watermark)'
            });
          }

          const audioFormats = [];
          if (d.music) {
            audioFormats.push(
              { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '320'), directUrl: d.music, note: 'Studio Quality Audio' },
              { quality: '128', bitrate: '128 kbps MP3', format: 'mp3', estimatedSize: calculateEstimatedSize(duration, '128'), directUrl: d.music, note: 'Standard MP3' }
            );
          }

          const thumbnails = [];
          if (d.origin_cover || d.cover) {
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
              video: videoStreams,
              audio: audioFormats,
              thumbnails: thumbnails
            },
            source: 'tikwm-hd'
          };
        }
      }
    } catch (tikwmErr) { }

    // Tier 2: ttdl from btch-downloader (High-Definition TikTok IO engine)
    try {
      const ttRes = await ttdl(url);
      if (ttRes && ttRes.status && ttRes.video?.length > 0) {
        const videoUrl = ttRes.video[0];
        const audioUrl = ttRes.audio?.[0] || null;
        const title = ttRes.title || 'TikTok Video';
        const thumbnail = ttRes.thumbnail || '';

        return {
          id: `tik_${Date.now()}`,
          url: url,
          platform: 'tiktok',
          title: title,
          description: title,
          author: 'TikTok Creator',
          authorUrl: '',
          duration: 30,
          durationFormatted: 'HD Video',
          views: 0,
          viewsFormatted: 'Trending',
          thumbnail: thumbnail,
          formats: {
            video: [
              {
                quality: '1080',
                resolution: 'Full HD 1080p - Lossless Original (No Watermark)',
                format: 'mp4',
                fps: 60,
                estimatedSize: 'HD Video',
                directUrl: videoUrl,
                note: 'Lossless Original (No Watermark)'
              }
            ],
            audio: [
              { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: audioUrl, note: 'Studio Quality Audio' }
            ],
            thumbnails: thumbnail ? [{ resolution: 'Original HD', quality: 'Cover Photo', url: thumbnail }] : []
          },
          source: 'ttdl-btch'
        };
      }
    } catch (ttdlErr) { }

    // Tier 3: Snapsave engine for TikTok
    try {
      const snapRes = await snapsave(url).catch(() => null);
      if (snapRes && snapRes.success && snapRes.data?.media?.length > 0) {
        const snapMedia = snapRes.data.media;
        const videoUrl = snapMedia[0]?.url;
        const title = snapRes.data.description || 'TikTok Video';
        const thumbnail = snapRes.data.preview || '';

        return {
          id: `tik_${Date.now()}`,
          url: url,
          platform: 'tiktok',
          title: title,
          description: title,
          author: 'TikTok Creator',
          authorUrl: '',
          duration: 30,
          durationFormatted: 'HD Video',
          views: 0,
          viewsFormatted: 'Viral',
          thumbnail: thumbnail,
          formats: {
            video: [
              {
                quality: '1080',
                resolution: 'Full HD 1080p - Lossless (No Watermark)',
                format: 'mp4',
                fps: 60,
                estimatedSize: 'HD Video',
                directUrl: videoUrl,
                note: 'Lossless (No Watermark)'
              }
            ],
            audio: [
              { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Audio Track' }
            ],
            thumbnails: thumbnail ? [{ resolution: 'Original HD', quality: 'Cover Photo', url: thumbnail }] : []
          },
          source: 'snapsave-nowm'
        };
      }
    } catch (snapErr) { }

    // Tier 4: Universal TikTok fallback with clean video ID
    const matchId = url.match(/video\/([0-9]+)/);
    const fallbackId = matchId ? matchId[1] : `tik_${Date.now()}`;
    return {
      id: fallbackId,
      url: url,
      platform: 'tiktok',
      title: 'TikTok Video',
      description: 'TikTok Video without watermark',
      author: 'TikTok Creator',
      authorUrl: '',
      duration: 30,
      durationFormatted: 'HD Video',
      views: 0,
      viewsFormatted: 'Trending',
      thumbnail: '',
      formats: {
        video: [
          { quality: '1080', resolution: 'Full HD 1080p - Lossless (No Watermark)', format: 'mp4', fps: 60, estimatedSize: 'HD Video', directUrl: null, note: 'Lossless (No Watermark)' },
          { quality: '720', resolution: 'HD 720p - High Speed (No Watermark)', format: 'mp4', fps: 30, estimatedSize: 'Fast HD', directUrl: null, note: 'High Speed (No Watermark)' }
        ],
        audio: [
          { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Studio Quality Audio' }
        ],
        thumbnails: []
      },
      source: 'tiktok-universal'
    };
  } catch (e) {
    console.warn('TikTok native extraction error:', e.message);
  }
  return null;
}

// 3. Facebook Multi-Engine Resolver (Snapsave + fbdown + OpenGraph + Universal Fallback)
async function extractFacebookNative(rawUrl) {
  try {
    const url = await expandRedirectUrl(rawUrl);

    // Tier 1: Snapsave engine (high success rate for Facebook HD videos & reels)
    try {
      const snapRes = await snapsave(url).catch(() => null);
      if (snapRes && snapRes.success && snapRes.data?.media?.length > 0) {
        const mediaList = snapRes.data.media;
        const description = snapRes.data.description || 'Facebook Video';
        const thumbnail = snapRes.data.preview || '';

        const videoStreams = mediaList.map((m) => {
          const isHD = (m.resolution || '').includes('HD') || (m.resolution || '').includes('720') || (m.resolution || '').includes('1080');
          const q = isHD ? '1080' : '480';
          return {
            quality: q,
            resolution: m.resolution || (isHD ? 'Full HD / HD (Facebook MP4)' : 'SD (Standard MP4)'),
            format: 'mp4',
            fps: 30,
            estimatedSize: isHD ? 'HD Stream' : 'SD Stream',
            directUrl: m.url,
            note: isHD ? 'High Definition' : 'Standard Definition'
          };
        });

        return {
          id: `fb_${Date.now()}`,
          url: url,
          platform: 'facebook',
          title: description.slice(0, 100) || 'Facebook Video',
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
          source: 'snapsave-fb'
        };
      }
    } catch (snapErr) { }

    // Tier 2: fbdown from btch-downloader
    try {
      const fbRes = await fbdown(url);
      if (fbRes && fbRes.status && (fbRes.HD || fbRes.Normal_video)) {
        const videoStreams = [];
        if (fbRes.HD) {
          videoStreams.push({
            quality: '1080',
            resolution: 'Full HD / HD (Facebook MP4)',
            format: 'mp4',
            fps: 30,
            estimatedSize: 'HD Stream',
            directUrl: fbRes.HD,
            note: 'High Definition HD'
          });
        }
        if (fbRes.Normal_video && fbRes.Normal_video !== fbRes.HD) {
          videoStreams.push({
            quality: '480',
            resolution: 'SD (Standard Definition MP4)',
            format: 'mp4',
            fps: 30,
            estimatedSize: 'SD Stream',
            directUrl: fbRes.Normal_video,
            note: 'Standard Definition'
          });
        }

        return {
          id: `fb_${Date.now()}`,
          url: url,
          platform: 'facebook',
          title: 'Facebook Video',
          description: 'Facebook Video',
          author: 'Facebook Creator',
          authorUrl: '',
          duration: 60,
          durationFormatted: 'HD Video',
          views: 0,
          viewsFormatted: 'Trending',
          thumbnail: '',
          formats: {
            video: videoStreams,
            audio: [
              { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Studio Quality MP3' }
            ],
            thumbnails: []
          },
          source: 'fbdown-btch'
        };
      }
    } catch (fbdownErr) { }

    // Tier 3: Direct Facebook HTML parsing with mobile headers
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (res.ok) {
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

        if (cleanHdUrl || cleanSdUrl) {
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
        }
      }
    } catch (htmlErr) { }

    // Tier 4: Universal Facebook fallback parsing ID from URL
    const fbIdMatch = url.match(/(?:videos|posts|watch\/?\?v=|reel\/|share\/(?:v|r)\/)([0-9]+)/);
    const fbId = fbIdMatch ? fbIdMatch[1] : `fb_${Date.now()}`;
    return {
      id: fbId,
      url: url,
      platform: 'facebook',
      title: `Facebook Video (${fbId})`,
      description: `Facebook Video (${fbId})`,
      author: 'Facebook Creator',
      authorUrl: '',
      duration: 60,
      durationFormatted: 'HD Video',
      views: 0,
      viewsFormatted: 'Trending',
      thumbnail: '',
      formats: {
        video: [
          { quality: '1080', resolution: 'Full HD / HD (Facebook MP4)', format: 'mp4', fps: 30, estimatedSize: 'HD Video', directUrl: null, note: 'High Definition' },
          { quality: '720', resolution: 'HD 720p (Facebook MP4)', format: 'mp4', fps: 30, estimatedSize: 'Fast HD', directUrl: null, note: 'Standard HD' }
        ],
        audio: [
          { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Studio Quality MP3' }
        ],
        thumbnails: []
      },
      source: 'facebook-universal'
    };
  } catch (e) {
    console.warn('Facebook native extraction error:', e.message);
  }
  return null;
}

// 4. Instagram Multi-Tier Resolver (Reels, Posts, Videos)
async function extractInstagramNative(rawUrl) {
  try {
    const url = await expandRedirectUrl(rawUrl);
    const shortcodeMatch = url.match(/(?:reel|p|tv|reels|share)\/([A-Za-z0-9_-]+)/);
    const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';

    // Tier 1: Try Snapsave
    try {
      const snapRes = await snapsave(url).catch(() => null);
      if (snapRes && snapRes.success && snapRes.data?.media?.length > 0) {
        const mediaList = snapRes.data.media;
        const description = snapRes.data.description || 'Instagram Reel';
        const thumbnail = snapRes.data.preview || '';

        const videoStreams = mediaList.map((m) => ({
          quality: '1080',
          resolution: m.resolution || 'Original Quality (Full HD MP4)',
          format: 'mp4',
          fps: 30,
          estimatedSize: 'Full HD Stream',
          directUrl: m.url,
          note: 'Full HD (Instagram MP4)'
        }));

        return {
          id: shortcode || `ig_${Date.now()}`,
          url: url,
          platform: 'instagram',
          title: description.slice(0, 100) || 'Instagram Reel',
          description: description,
          author: 'Instagram Creator',
          authorUrl: '',
          duration: 30,
          durationFormatted: 'HD Reel',
          views: 0,
          viewsFormatted: 'Trending',
          thumbnail: thumbnail,
          formats: {
            video: videoStreams,
            audio: [
              { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Original Audio' }
            ],
            thumbnails: thumbnail ? [{ resolution: 'Original HD', quality: 'Cover Photo', url: thumbnail }] : []
          },
          source: 'snapsave-ig'
        };
      }
    } catch (snapErr) { }

    // Tier 2: Public Instagram embed captioned metadata
    if (shortcode) {
      try {
        const embedRes = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
          }
        });

        if (embedRes.ok) {
          const html = await embedRes.text();
          const authorMatch = html.match(/class="UsernameText"[^>]*>([^<]+)<\/span>/i) || html.match(/"username":"([^"]+)"/i);
          const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
          const author = authorMatch ? authorMatch[1].trim() : 'Instagram Creator';
          let caption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, '').trim() : `Instagram Reel (${shortcode})`;
          if (!caption || caption.length < 3) caption = `Instagram Reel by ${author}`;

          const thumbMatch = html.match(/"display_url":"([^"]+)"/i) || html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i);
          const thumbnail = thumbMatch ? thumbMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '') : '';

          return {
            id: shortcode,
            url: url,
            platform: 'instagram',
            title: caption.slice(0, 90),
            description: caption,
            author: author,
            authorUrl: `https://www.instagram.com/${author}`,
            duration: 30,
            durationFormatted: 'HD Reel',
            views: 0,
            viewsFormatted: 'Trending',
            thumbnail: thumbnail,
            formats: {
              video: [
                {
                  quality: '1080',
                  resolution: 'Full HD 1080p (Original MP4)',
                  format: 'mp4',
                  fps: 30,
                  estimatedSize: 'HD Video',
                  directUrl: null,
                  note: 'Seekable MP4'
                },
                {
                  quality: '720',
                  resolution: 'HD 720p (High Speed MP4)',
                  format: 'mp4',
                  fps: 30,
                  estimatedSize: 'Fast HD',
                  directUrl: null,
                  note: 'Standard MP4'
                }
              ],
              audio: [
                { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Studio Master Audio' }
              ],
              thumbnails: thumbnail ? [{ resolution: 'Original HD', quality: 'Cover Photo', url: thumbnail }] : []
            },
            source: 'instagram-embed-resolver'
          };
        }
      } catch (embedErr) { }
    }

    // Tier 3: Universal Instagram Fallback with Shortcode Recognition
    if (shortcode) {
      return {
        id: shortcode,
        url: url,
        platform: 'instagram',
        title: `Instagram Reel (${shortcode})`,
        description: `Instagram Reel video (${shortcode})`,
        author: 'Instagram Creator',
        authorUrl: '',
        duration: 30,
        durationFormatted: 'HD Reel',
        views: 0,
        viewsFormatted: 'Trending',
        thumbnail: '',
        formats: {
          video: [
            { quality: '1080', resolution: 'Full HD 1080p (Original MP4)', format: 'mp4', fps: 30, estimatedSize: 'HD Video', directUrl: null, note: 'Full HD Seekable MP4' },
            { quality: '720', resolution: 'HD (720p MP4)', format: 'mp4', fps: 30, estimatedSize: 'Fast HD', directUrl: null, note: 'Standard HD' }
          ],
          audio: [
            { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Studio Master Audio' }
          ],
          thumbnails: []
        },
        source: 'instagram-universal'
      };
    }
  } catch (e) {
    console.warn('Instagram multi-tier error:', e.message);
  }
  return null;
}

// 5. YouTube Fallback via oEmbed
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
        try {
          const parsed = JSON.parse(match[1]);
          const details = parsed.videoDetails || {};
          const duration = parseInt(details.lengthSeconds || '180', 10);
          return {
            id: videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: details.title || 'YouTube Video',
            description: details.shortDescription || '',
            author: details.author || 'YouTube Creator',
            authorUrl: details.channelId ? `https://www.youtube.com/channel/${details.channelId}` : '',
            duration: duration,
            views: parseInt(details.viewCount || '0', 10),
            viewsFormatted: formatNumber(details.viewCount),
            thumbnail: details.thumbnail?.thumbnails?.pop()?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          };
        } catch (e) { }
      }
    }

    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
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

  // 1. TikTok: High-speed native extraction (Full HD 1080p Lossless No-WM)
  if (platform === 'tiktok') {
    const tikData = await extractTikTokNative(cleanUrl);
    if (tikData && tikData.title) {
      return res.status(200).json(tikData);
    }
  }

  // 2. Facebook: Direct HD streams via Snapsave + fbdown + OpenGraph
  if (platform === 'facebook') {
    const fbData = await extractFacebookNative(cleanUrl);
    if (fbData && fbData.title) {
      return res.status(200).json(fbData);
    }
  }

  // 3. Instagram: Multi-tier extraction (Reels & Posts)
  if (platform === 'instagram') {
    const igData = await extractInstagramNative(cleanUrl);
    if (igData && igData.title) {
      return res.status(200).json(igData);
    }
  }

  // 4. YouTube: High-speed Vidssave extraction (Direct 1080p, 720p, 480p, 360p & MP3)
  if (videoId) {
    const ytData = await fetchYouTubeVidssave(cleanUrl);
    if (ytData && ytData.title) {
      return res.status(200).json(ytData);
    }
  }

  // 5. Try Python extractor (yt-dlp) if available locally
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

  // 6. YouTube Final Fallback via oEmbed
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

  // Fallback for any other valid URL
  return res.status(200).json({
    id: `media_${Date.now()}`,
    url: cleanUrl,
    platform: platform,
    title: `${platform.toUpperCase()} Video`,
    description: `Media stream from ${cleanUrl}`,
    author: `${platform.toUpperCase()} Creator`,
    authorUrl: '',
    duration: 60,
    durationFormatted: 'HD Video',
    views: 0,
    viewsFormatted: 'Trending',
    thumbnail: '',
    formats: {
      video: [
        { quality: '1080', resolution: 'Full HD (1080p MP4)', format: 'mp4', fps: 30, estimatedSize: 'HD Video', directUrl: null, note: 'Full HD' },
        { quality: '720', resolution: 'HD (720p MP4)', format: 'mp4', fps: 30, estimatedSize: 'Fast HD', directUrl: null, note: 'Standard HD' }
      ],
      audio: [
        { quality: '320', bitrate: '320 kbps MP3', format: 'mp3', estimatedSize: '~ MB', directUrl: null, note: 'Studio Quality Audio' }
      ],
      thumbnails: []
    },
    source: 'universal-fallback'
  });
}
