import sys
import json
import urllib.request
import urllib.parse
import re

# Ensure standard output uses UTF-8 to prevent charmap encoding errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def detect_platform(url):
    u = url.lower()
    if 'tiktok.com' in u:
        return 'tiktok'
    if 'facebook.com' in u or 'fb.watch' in u or 'fb.com' in u:
        return 'facebook'
    if 'instagram.com' in u:
        return 'instagram'
    if 'youtube.com' in u or 'youtu.be' in u:
        return 'youtube'
    return 'generic'

def extract_tiktok(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    }
    api_url = f'https://www.tikwm.com/api/?url={urllib.parse.quote(url)}'
    req = urllib.request.Request(api_url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode('utf-8', errors='ignore')
        data = json.loads(raw)
    
    if data.get('code') != 0 or not data.get('data'):
        raise Exception(data.get('msg') or 'Could not parse TikTok video from API')

    d = data['data']
    video_id = str(d.get('id', ''))
    title = d.get('title') or 'TikTok Video'
    author = d.get('author', {}).get('nickname') or d.get('author', {}).get('unique_id') or 'TikTok Creator'
    duration = d.get('duration') or 15
    views = d.get('play_count') or 0
    thumbnail = d.get('cover') or d.get('origin_cover') or ''
    music_url = d.get('music') or ''

    video_streams = []
    # Maximum quality without watermark (Full HD if available, otherwise HD play)
    if d.get('hdplay'):
        video_streams.append({
            'quality': '1080',
            'resolution': 'Maximum Quality - No Watermark (Full HD MP4)',
            'format': 'mp4',
            'fps': 60,
            'url': d['hdplay'],
            'filesize': d.get('hd_size') or d.get('size')
        })
    if d.get('play'):
        video_streams.append({
            'quality': '720',
            'resolution': 'HD Quality - No Watermark (MP4)',
            'format': 'mp4',
            'fps': 30,
            'url': d['play'],
            'filesize': d.get('size')
        })

    return {
        'id': video_id,
        'url': url,
        'platform': 'tiktok',
        'title': title,
        'description': title,
        'author': author,
        'duration': duration,
        'views': views,
        'thumbnail': thumbnail,
        'video_streams': video_streams,
        'audio_url': music_url
    }

def extract_ytdlp(url):
    import yt_dlp
    
    platform = detect_platform(url)
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'geo_bypass': True,
        'nocheckcertificate': True,
        'js_runtimes': {'node': {}},
        'remote_components': ['ejs:github']
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        video_id = str(info.get('id', ''))
        title = info.get('title') or (
            'Facebook Video' if platform == 'facebook' else
            'Instagram Reel' if platform == 'instagram' else
            'Video'
        )
        description = info.get('description') or ''
        uploader = info.get('uploader') or info.get('channel') or info.get('creator') or (
            'Facebook Creator' if platform == 'facebook' else
            'Instagram Creator' if platform == 'instagram' else
            'Creator'
        )
        duration = info.get('duration') or 60
        view_count = info.get('view_count') or info.get('like_count') or 0
        thumbnail = info.get('thumbnail') or ''
        
        formats_list = info.get('formats', [])
        
        # Extract audio streams
        audio_formats = []
        for f in formats_list:
            if f.get('vcodec') == 'none' and f.get('acodec') != 'none' and f.get('url'):
                audio_formats.append({
                    'format_id': f.get('format_id'),
                    'ext': f.get('ext'),
                    'abr': f.get('abr') or 128,
                    'url': f.get('url'),
                    'filesize': f.get('filesize') or f.get('filesize_approx')
                })
        
        best_audio = sorted(audio_formats, key=lambda x: x.get('abr') or 0, reverse=True)
        best_audio_url = best_audio[0]['url'] if best_audio else None

        video_streams = []

        # 1. Platform-Specific Formats handling
        if platform == 'facebook':
            # Facebook provides 'hd' and 'sd' formats
            fb_formats = [f for f in formats_list if f.get('url')]
            hd_format = next((f for f in fb_formats if f.get('format_id') == 'hd'), None)
            sd_format = next((f for f in fb_formats if f.get('format_id') == 'sd'), None)

            if hd_format:
                video_streams.append({
                    'quality': '1080',
                    'resolution': 'HD Quality (1080p / 720p Full HD MP4)',
                    'format': 'mp4',
                    'fps': hd_format.get('fps') or 30,
                    'url': hd_format.get('url'),
                    'filesize': hd_format.get('filesize') or hd_format.get('filesize_approx')
                })
            if sd_format:
                video_streams.append({
                    'quality': '480',
                    'resolution': 'SD Quality (Standard Definition 480p MP4)',
                    'format': 'mp4',
                    'fps': sd_format.get('fps') or 30,
                    'url': sd_format.get('url'),
                    'filesize': sd_format.get('filesize') or sd_format.get('filesize_approx')
                })
            
            # If no hd/sd found, grab any valid mp4 stream
            if not video_streams and fb_formats:
                best_fb = fb_formats[-1]
                video_streams.append({
                    'quality': '1080',
                    'resolution': 'HD Quality (High Definition MP4)',
                    'format': 'mp4',
                    'fps': 30,
                    'url': best_fb.get('url'),
                    'filesize': best_fb.get('filesize')
                })

        elif platform == 'instagram':
            # Instagram provides progressive MP4 streams
            ig_formats = [f for f in formats_list if f.get('url') and (f.get('ext') == 'mp4' or 'mp4' in (f.get('format_note') or ''))]
            if not ig_formats:
                ig_formats = [f for f in formats_list if f.get('url')]
            
            if ig_formats:
                # The highest quality is usually the last or highest bitrate
                best_ig = ig_formats[-1]
                video_streams.append({
                    'quality': '1080',
                    'resolution': 'Maximum Quality (Original HD MP4)',
                    'format': 'mp4',
                    'fps': best_ig.get('fps') or 30,
                    'url': best_ig.get('url'),
                    'filesize': best_ig.get('filesize') or best_ig.get('filesize_approx')
                })
                if len(ig_formats) > 1:
                    lower_ig = ig_formats[0]
                    video_streams.append({
                        'quality': '720',
                        'resolution': 'Standard Quality (HD 720p MP4)',
                        'format': 'mp4',
                        'fps': lower_ig.get('fps') or 30,
                        'url': lower_ig.get('url'),
                        'filesize': lower_ig.get('filesize')
                    })

        # 2. General / YouTube height-based formats
        if not video_streams:
            seen_res = set()
            valid_video = [
                f for f in formats_list
                if f.get('vcodec') != 'none' and f.get('height') and f.get('height') >= 144
            ]
            valid_video.sort(
                key=lambda x: (
                    x.get('height') or 0,
                    1 if (x.get('ext') == 'mp4' or 'avc' in (x.get('vcodec') or '')) else 0,
                    x.get('tbr') or x.get('vbr') or 0,
                    x.get('filesize') or x.get('filesize_approx') or 0
                ),
                reverse=True
            )

            for f in valid_video:
                height = f.get('height')
                if height not in seen_res:
                    seen_res.add(height)
                    fps = f.get('fps') or 30
                    fps_label = f"{fps}fps" if fps > 30 else ""
                    tag = " (4K)" if height >= 2160 else " (2K)" if height >= 1440 else " (Full HD)" if height >= 1080 else " (HD)" if height >= 720 else ""
                    resolution_str = f"{height}p{' ' + fps_label if fps_label else ''}{tag}"
                    
                    video_streams.append({
                        'quality': str(height),
                        'resolution': resolution_str,
                        'format': 'mp4',
                        'fps': fps,
                        'url': f.get('url'),
                        'filesize': f.get('filesize') or f.get('filesize_approx')
                    })

            # If still empty (e.g. progressive file with height=None)
            if not video_streams and formats_list:
                for f in reversed(formats_list):
                    if f.get('url'):
                        video_streams.append({
                            'quality': '1080',
                            'resolution': 'Best Available Quality (Original MP4)',
                            'format': 'mp4',
                            'fps': f.get('fps') or 30,
                            'url': f.get('url'),
                            'filesize': f.get('filesize')
                        })
                        break

        # Fallback thumbnail if empty and is YouTube
        if not thumbnail and platform == 'youtube' and video_id:
            thumbnail = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"

        return {
            'id': video_id,
            'url': url,
            'platform': platform,
            'title': title,
            'description': description,
            'author': uploader,
            'duration': duration,
            'views': view_count,
            'thumbnail': thumbnail,
            'video_streams': video_streams,
            'audio_url': best_audio_url
        }

def extract(url):
    platform = detect_platform(url)
    
    # TikTok: try TikWM first for watermark-free streams
    if platform == 'tiktok':
        try:
            return extract_tiktok(url)
        except Exception as e:
            # Fallback to yt-dlp
            pass

    return extract_ytdlp(url)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
        try:
            res = extract(target_url)
            print(json.dumps(res, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({'error': str(e)}, ensure_ascii=False))
