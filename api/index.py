from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp
import re

app = Flask(__name__)
CORS(app)

def extract_video_id(url):
    patterns = [r'(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})']
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None

@app.route('/api/search')
def search():
    q = request.args.get('q')
    if not q:
        return jsonify([])

    try:
        with yt_dlp.YoutubeDL({
            'quiet': True,
            'extract_flat': True,
            'socket_timeout': 3
        }) as ydl:
            info = ydl.extract_info(f"ytsearch2:{q}", download=False)

        return jsonify([
            {
                "id": e["id"],
                "title": e["title"],
                "channel": e.get("uploader"),
                "thumbnail": f"https://i.ytimg.com/vi/{e['id']}/mqdefault.jpg",
                "url": f"https://youtu.be/{e['id']}"
            } for e in info["entries"]
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/resolve', methods=['POST'])
def resolve():
    data = request.get_json()
    url = data.get("url")

    vid = extract_video_id(url)
    if not vid:
        return jsonify({"error": "invalid url"}), 400

    try:
        with yt_dlp.YoutubeDL({
            'quiet': True,
            'skip_download': True,
            'format': 'best',
            'socket_timeout': 3
        }) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)

        return jsonify({
            "id": vid,
            "title": info.get("title"),
            "channel": info.get("uploader"),
            "thumbnail": info.get("thumbnail"),
            "stream_url": info.get("url")
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500