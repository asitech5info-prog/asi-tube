import sys
import json
import yt_dlp

def extract(url):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False
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
        
        # Extract audio stream
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
        
        # Extract video streams
        video_streams = []
        seen_res = set()
        for f in reversed(formats_list):
            if f.get('vcodec') != 'none' and f.get('url'):
                height = f.get('height') or 0
                res_label = f"{height}p" if height else "HD"
                if height >= 144 and height not in seen_res:
                    seen_res.add(height)
                    video_streams.append({
                        'quality': str(height),
                        'resolution': f"{height}p" + (" (4K)" if height >= 2160 else " (2K)" if height >= 1440 else " (Full HD)" if height >= 1080 else " (HD)" if height >= 720 else ""),
                        'format': 'mp4' if f.get('ext') == 'mp4' else 'webm',
                        'fps': f.get('fps') or 30,
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
