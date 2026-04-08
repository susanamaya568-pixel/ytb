from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import re

app = Flask(__name__)
CORS(app)

def extract_video_id(url):
    patterns = [r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})']
    for p in patterns:
        m = re.search(p, url)
        if m: return m.group(1)
    return None

@app.route('/api/search', methods=['GET'])
def search():
    query = request.args.get('q')
    if not query: return jsonify([])
    # 속도를 위해 검색 결과 5개 제한 및 메타데이터 추출 최소화
    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'extract_flat': True, 
        'noplaylist': True, 'socket_timeout': 5
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch5:{query}", download=False)
            return jsonify([{
                'id': e['id'], 'title': e['title'], 'channel': e['uploader'],
                'thumbnail': f"https://i.ytimg.com/vi/{e['id']}/mqdefault.jpg",
                'url': f"https://www.youtube.com/watch?v={e['id']}"
            } for e in info.get('entries', [])])
    except: return jsonify([]), 500

@app.route('/api/resolve', methods=['POST'])
def resolve():
    data = request.get_json()
    url, quality = data.get('url'), data.get('quality', '720')
    vid = extract_video_id(url)
    if not vid: return jsonify({'error': 'URL 무효'}), 400

    # 화질 및 음질 최적화 추출 옵션
    ydl_opts = {
        'quiet': True, 'skip_download': True, 'socket_timeout': 7,
        'format': f'bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<={quality}][ext=mp4]/best'
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
            # 고음질 오디오(m4a) 별도 추출
            audio_url = next((f['url'] for f in info.get('formats', []) if f.get('acodec')!='none' and f.get('vcodec')=='none'), info.get('url'))
            return jsonify({
                'id': vid, 'title': info.get('title'), 'channel': info.get('uploader'),
                'thumbnail': info.get('thumbnail'), 'stream_url': info.get('url'),
                'audio_url': audio_url, 'duration': info.get('duration'), 'quality': quality
            })
    except: return jsonify({'error': '유튜브 서버 응답 지연'}), 500