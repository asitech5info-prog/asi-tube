import sys
import json
import yt_dlp

def extract(url):
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
        
        video_id = info.get('id', '')
        title = info.get('title', 'Video')
        uploader = info.get('uploader', 'Creator')
        duration = info.get('duration', 180)
        view_count = info.get('view_count', 0)
        thumbnail = info.get('thumbnail') or f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
        
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
        
        # Best audio url
        best_audio = sorted(audio_formats, key=lambda x: x.get('abr') or 0, reverse=True)
        best_audio_url = best_audio[0]['url'] if best_audio else None
        
        # Extract video streams prioritizing higher quality / bitrate
        video_streams = []
        seen_res = set()
        
        # Sort formats by resolution, fps, then bitrate/size descending
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

        video_streams = sorted(video_streams, key=lambda x: int(x['quality']), reverse=True)

        return {
            'id': video_id,
            'url': url,
            'title': title,
            'author': uploader,
            'duration': duration,
            'views': view_count,
            'thumbnail': thumbnail,
            'video_streams': video_streams,
            'audio_url': best_audio_url
        }

if __name__ == '__main__':
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
        try:
            res = extract(target_url)
            print(json.dumps(res))
        except Exception as e:
            print(json.dumps({'error': str(e)}))
