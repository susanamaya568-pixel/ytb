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
        'noplaylist': True,
        'extract_flat': True,
        'socket_timeout': 8,
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
        traceback.print_exc()
        return jsonify([])

@app.route('/api/resolve', methods=['POST'])
def resolve():
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': '요청 데이터 없음'}), 400

        url = data.get('url', '').strip()
        quality = data.get('quality', '720')

        if not url:
            return jsonify({'error': 'URL이 없습니다'}), 400

        vid = extract_video_id(url)
        if not vid:
            return jsonify({'error': '유효하지 않은 YouTube URL'}), 400

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'socket_timeout': 10,
            # 화질 선택: 지정 화질 mp4 우선, 없으면 best
            'format': (
                f'bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]'
                f'/bestvideo[height<={quality}]+bestaudio'
                f'/best[height<={quality}]'
                f'/best'
            ),
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={vid}",
                download=False
            )

        formats = info.get('formats', [])

        # stream_url: 영상+오디오가 합쳐진 URL (또는 best)
        stream_url = info.get('url', '')

        # audio_url: 오디오만 있는 포맷 우선 추출
        audio_url = ''
        for f in formats:
            if f.get('acodec') != 'none' and f.get('vcodec') == 'none':
                audio_url = f.get('url', '')
                break
        if not audio_url:
            audio_url = stream_url

        return jsonify({
            'id': vid,
            'title': info.get('title', ''),
            'channel': info.get('uploader') or info.get('channel', ''),
            'thumbnail': info.get('thumbnail', f'https://i.ytimg.com/vi/{vid}/maxresdefault.jpg'),
            'stream_url': stream_url,
            'audio_url': audio_url,
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

# Vercel Serverless: handler 노출
# Flask app이 handler 역할
handler = app