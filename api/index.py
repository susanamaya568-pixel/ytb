from flask import Flask, jsonify, request, Response, stream_with_context, make_response
from flask_cors import CORS
import yt_dlp
import re
import traceback
import requests
import os

app = Flask(__name__)
CORS(app, resources={r"/api/*": {
    "origins": "*",
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

COOKIE_FILE = os.path.join(os.path.dirname(__file__), '..', 'cookies.txt')

YDL_BASE_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'skip_download': True,
    'noplaylist': True,
    'socket_timeout': 15,
    'geo_bypass': True,
    'cookiefile': COOKIE_FILE if os.path.exists(COOKIE_FILE) else None,
}


@app.before_request
def handle_options():
    if request.method == "OPTIONS":
        res = make_response()
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        res.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return res, 200


def extract_video_id(url):
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})'
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


CLIENT_FALLBACKS = [
    (['tv_embedded'],        {'skip': ['hls', 'dash', 'translated_subs']}),
    (['ios'],                {'skip': ['hls', 'dash', 'translated_subs']}),
    (['android_vr'],         {'skip': ['hls', 'dash', 'translated_subs']}),
    (['mweb'],               {'skip': ['hls', 'dash', 'translated_subs']}),
    (['web_creator'],        {'skip': ['hls', 'dash', 'translated_subs']}),
    (['android_embedded'],   {'skip': ['hls', 'dash', 'translated_subs']}),
    (['web', 'android'],     {'skip': ['hls', 'dash', 'translated_subs']}),
]


def get_stream_info(canonical, mode):
    fmt = (
        'bestaudio[ext=m4a]/bestaudio/best'
        if mode == 'music'
        else 'best[ext=mp4][height<=720]/best[ext=mp4]/best[height<=720]/best'
    )
    last_err = None
    for clients, extra in CLIENT_FALLBACKS:
        try:
            opts = {
                **YDL_BASE_OPTS,
                'format': fmt,
                'extractor_args': {
                    'youtube': {
                        **extra,
                        'player_client': clients,
                    }
                },
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(canonical, download=False)
                if info:
                    return info
        except yt_dlp.utils.DownloadError as e:
            msg = str(e)
            if any(k in msg for k in ['Sign in', 'age', 'private', 'Private', 'members']):
                raise
            last_err = e
            continue
        except Exception as e:
            last_err = e
            continue
    raise last_err or Exception('모든 클라이언트 시도 실패')


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
        'socket_timeout': 10,
        'cookiefile': COOKIE_FILE if os.path.exists(COOKIE_FILE) else None,
        'extractor_args': {
            'youtube': {
                'player_client': ['tv_embedded'],
                'skip': ['hls', 'dash', 'translated_subs'],
            }
        },
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch10:{query_str}", download=False)
            results = []
            for e in info.get('entries', []):
                if not e:
                    continue
                vid_id = e.get('id', '')
                results.append({
                    'id':        vid_id,
                    'title':     e.get('title', ''),
                    'channel':   e.get('uploader') or e.get('channel', ''),
                    'thumbnail': f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg",
                    'url':       f"https://www.youtube.com/watch?v={vid_id}",
                })
            return jsonify(results)
    except Exception as e:
        print(f"[search error] {e}")
        traceback.print_exc()
        return jsonify([])


@app.route('/api/resolve', methods=['POST', 'OPTIONS'])
def resolve():
    if request.method == 'OPTIONS':
        res = make_response()
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        res.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return res, 200

    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': '요청 데이터 없음'}), 400

        url  = data.get('url',  '').strip()
        mode = data.get('mode', 'video')

        if not url:
            return jsonify({'error': 'URL이 없습니다'}), 400

        vid = extract_video_id(url)
        if not vid:
            return jsonify({'error': '유효하지 않은 YouTube URL'}), 400

        canonical = f'https://www.youtube.com/watch?v={vid}'
        info      = get_stream_info(canonical, mode)

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
            if (
                f.get('acodec') != 'none'
                and f.get('vcodec') == 'none'
                and f.get('url')
            ):
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
        if any(k in msg for k in ['Sign in', 'age']):
            return jsonify({'error': '연령 제한 또는 로그인이 필요한 영상입니다'}), 403
        if any(k in msg for k in ['Private', 'private']):
            return jsonify({'error': '비공개 영상입니다'}), 403
        if 'members' in msg:
            return jsonify({'error': '멤버십 전용 영상입니다'}), 403
        return jsonify({'error': f'영상을 가져올 수 없어요: {msg[:120]}'}), 500

    except Exception as e:
        print(f"[resolve error] {e}")
        traceback.print_exc()
        return jsonify({'error': f'서버 오류: {str(e)[:120]}'}), 500


@app.route('/api/stream', methods=['GET'])
def stream():
    vid  = request.args.get('v',    '').strip()
    mode = request.args.get('mode', 'video')

    if not vid:
        return jsonify({'error': 'v 파라미터 필요'}), 400

    canonical = f'https://www.youtube.com/watch?v={vid}'

    try:
        info = get_stream_info(canonical, mode)

        target_url = None
        if mode == 'music':
            for f in info.get('formats', []):
                if (
                    f.get('acodec') != 'none'
                    and f.get('vcodec') == 'none'
                    and f.get('url')
                ):
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
        req_headers = {
            'User-Agent': (
                'Mozilla/5.0 (Linux; Android 11; Pixel 5) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/90.0.4430.91 Mobile Safari/537.36'
            ),
            'Referer': 'https://www.youtube.com/',
            'Origin':  'https://www.youtube.com',
        }
        if range_header:
            req_headers['Range'] = range_header

        yt_resp = requests.get(target_url, headers=req_headers, stream=True, timeout=20)

        content_type = yt_resp.headers.get(
            'Content-Type',
            'audio/mp4' if mode == 'music' else 'video/mp4'
        )
        resp_headers = {
            'Content-Type':                 content_type,
            'Accept-Ranges':                'bytes',
            'Access-Control-Allow-Origin':  '*',
            'Cache-Control':                'no-cache',
        }
        if 'Content-Length' in yt_resp.headers:
            resp_headers['Content-Length'] = yt_resp.headers['Content-Length']
        if 'Content-Range' in yt_resp.headers:
            resp_headers['Content-Range']  = yt_resp.headers['Content-Range']

        def generate():
            for chunk in yt_resp.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

        return Response(
            stream_with_context(generate()),
            status=yt_resp.status_code,
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
