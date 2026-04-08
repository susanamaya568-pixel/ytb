from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
import yt_dlp
import re
import traceback
import requests

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


YDL_BASE_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'skip_download': True,
    'noplaylist': True,
    'socket_timeout': 10,
    'geo_bypass': True,
}


def get_stream_info(canonical, mode):
    client_lists = [
        ['web', 'android'],
        ['android'],
        ['tv_embedded'],
        ['web'],
    ]
    fmt = 'best[ext=mp4][height<=720]/best[ext=mp4]/best' if mode != 'music' else 'bestaudio/best'
    last_err = None
    for clients in client_lists:
        try:
            opts = {
                **YDL_BASE_OPTS,
                'format': fmt,
                'extractor_args': {
                    'youtube': {
                        'skip': ['hls', 'dash', 'translated_subs'],
                        'player_client': clients,
                    }
                },
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(canonical, download=False)
        except Exception as e:
            last_err = e
            continue
    raise last_err


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
        mode = data.get('mode', 'video')

        if not url:
            return jsonify({'error': 'URL이 없습니다'}), 400

        vid = extract_video_id(url)
        if not vid:
            return jsonify({'error': '유효하지 않은 YouTube URL'}), 400

        canonical = f'https://www.youtube.com/watch?v={vid}'

        info = get_stream_info(canonical, mode)

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
            'stream_url': f'/api/stream?v={vid}&mode=video',
            'audio_url':  f'/api/stream?v={vid}&mode=music',
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


@app.route('/api/stream', methods=['GET'])
def stream():
    vid = request.args.get('v', '').strip()
    mode = request.args.get('mode', 'video')

    if not vid:
        return jsonify({'error': 'v 파라미터 필요'}), 400

    canonical = f'https://www.youtube.com/watch?v={vid}'

    try:
        info = get_stream_info(canonical, mode)

        target_url = None
        if mode == 'music':
            for f in info.get('formats', []):
                if f.get('acodec') != 'none' and f.get('vcodec') == 'none' and f.get('url'):
                    target_url = f['url']
                    break

        if not target_url:
            target_url = info.get('url', '')
        if not target_url:
            for f in reversed(info.get('formats', [])):
                if f.get('url'):
                    target_url = f['url']
                    break

        if not target_url:
            return jsonify({'error': '스트림 URL 없음'}), 500

        range_header = request.headers.get('Range', '')
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.youtube.com/',
        }
        if range_header:
            headers['Range'] = range_header

        yt_resp = requests.get(target_url, headers=headers, stream=True, timeout=15)

        content_type = yt_resp.headers.get('Content-Type', 'video/mp4' if mode != 'music' else 'audio/mp4')

        resp_headers = {
            'Content-Type': content_type,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
        }
        if 'Content-Length' in yt_resp.headers:
            resp_headers['Content-Length'] = yt_resp.headers['Content-Length']
        if 'Content-Range' in yt_resp.headers:
            resp_headers['Content-Range'] = yt_resp.headers['Content-Range']

        status = yt_resp.status_code

        def generate():
            for chunk in yt_resp.iter_content(chunk_size=1024 * 64):
                if chunk:
                    yield chunk

        return Response(
            stream_with_context(generate()),
            status=status,
            headers=resp_headers,
        )

    except yt_dlp.utils.DownloadError as e:
        print(f"[stream DownloadError] {e}")
        return jsonify({'error': '영상을 가져올 수 없어요'}), 500
    except Exception as e:
        print(f"[stream error] {e}")
        traceback.print_exc()
        return jsonify({'error': '스트리밍 오류'}), 500


handler = app
