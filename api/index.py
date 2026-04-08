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

def get_quality_format(quality):
    # 사용자가 선택한 화질에 따른 yt-dlp 포맷 스트링
    formats = {
        '1080': 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best',
        '720':  'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best',
        '480':  'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]/best',
        '360':  'bestvideo[ext=mp4][height<=360]+bestaudio[ext=m4a]/best[ext=mp4][height<=360]/best'
    }
    return formats.get(quality, formats['720'])

@app.route('/api/resolve', methods=['POST'])
def resolve():
    data = request.get_json()
    url = data.get('url', '').strip()
    quality = data.get('quality', '720')

    if not url: return jsonify({'error': 'URL이 없습니다'}), 400
    vid = extract_video_id(url)
    if not vid: return jsonify({'error': '유효하지 않은 URL'}), 400

    ydl_opts = {
        'quiet': True, 'skip_download': True, 'noplaylist': True,
        'format': get_quality_format(quality)
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
        
        # 고음질 오디오 스트림 추출 (m4a 추천)
        audio_url = None
        for f in info.get('formats', []):
            if f.get('acodec') != 'none' and f.get('vcodec') == 'none' and f.get('ext') == 'm4a':
                audio_url = f.get('url')
                break

        return jsonify({
            'id': vid,
            'title': info.get('title'),
            'channel': info.get('uploader'),
            'thumbnail': info.get('thumbnail'),
            'duration': info.get('duration'),
            'stream_url': info.get('url'),  # 선택 화질 비디오
            'audio_url': audio_url or info.get('url') # 오디오 전용
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500