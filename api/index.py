from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import re
import traceback

app = Flask(__name__)
CORS(app)


def extract_video_id(url):
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})'
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


@app.route('/api/search', methods=['GET'])
def search():
    query_str = request.args.get('q', '').strip()
    if not query_str:
        return jsonify([])

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'noplaylist': True,
        'socket_timeout': 5,  # 8 → 5
        'format': 'best[ext=mp4]/best' if mode != 'music' else 'bestaudio/best',
        'extractor_args': {
            'youtube': {
                'skip': ['hls', 'dash', 'translated_subs'],
                'player_client': ['android'],  # ← 이거 추가, android가 제일 빠름
            }
        },
        'geo_bypass': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch8:{query_str}", download=False)
            results = []
            for e in info.get('entries', []):
                if not e:
                    continue
                results.append({
                    'id': e.get('id', ''),
                    'title': e.get('title', ''),
                    'channel': e.get('uploader') or e.get('channel', ''),
                    'thumbnail': f"https://i.ytimg.com/vi/{e.get('id','')}/mqdefault.jpg",
                    'url': f"https://www.youtube.com/watch?v={e.get('id','')}",
                })
            return jsonify(results)
    except Exception as e:
        print(f"[search error] {e}")
        return jsonify([])


@app.route('/api/resolve', methods=['POST'])
def resolve():
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': '요청 데이터 없음'}), 400

        url = data.get('url', '').strip()
        mode = data.get('mode', 'video')

        if not url:
            return jsonify({'error': 'URL이 없습니다'}), 400

        vid = extract_video_id(url)
        if not vid:
            return jsonify({'error': '유효하지 않은 YouTube URL'}), 400

        canonical = f'https://www.youtube.com/watch?v={vid}'

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'noplaylist': True,
            'socket_timeout': 8,
            # best[ext=mp4]/best 로 포맷 하나만 → 처리 최소화
            'format': 'best[ext=mp4][height<=720]/best[ext=mp4]/best' if mode != 'music' else 'bestaudio/best',
            'extractor_args': {
                'youtube': {
                    'skip': ['hls', 'dash', 'translated_subs'],
                    #'player_skip': ['webpage', 'configs', 'js'],
                }
            },
            'geo_bypass': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(canonical, download=False)

        stream_url = info.get('url', '')
        if not stream_url:
            for f in reversed(info.get('formats', [])):
                if f.get('url'):
                    stream_url = f['url']
                    break

        if not stream_url:
            return jsonify({'error': '스트림 URL을 가져올 수 없습니다'}), 500

        audio_url = stream_url
        for f in info.get('formats', []):
            if f.get('acodec') != 'none' and f.get('vcodec') == 'none' and f.get('url'):
                audio_url = f['url']
                break

        return jsonify({
            'id':         vid,
            'title':      info.get('title', ''),
            'channel':    info.get('uploader') or info.get('channel', ''),
            'thumbnail':  info.get('thumbnail', f'https://i.ytimg.com/vi/{vid}/mqdefault.jpg'),
            'stream_url': stream_url,
            'audio_url':  audio_url,
        })

    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        print(f"[resolve DownloadError] {msg}")
        if 'Sign in' in msg or 'age' in msg.lower():
            return jsonify({'error': '연령 제한 또는 로그인 필요 영상입니다'}), 403
        if 'Private' in msg or 'private' in msg:
            return jsonify({'error': '비공개 영상입니다'}), 403
        return jsonify({'error': '영상을 가져올 수 없어요'}), 500

    except Exception as e:
        print(f"[resolve error] {e}")
        traceback.print_exc()
        return jsonify({'error': '서버 오류가 발생했어요'}), 500


handler = app
