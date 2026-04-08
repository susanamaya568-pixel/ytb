from flask import Flask, jsonify, request
from flask_cors import CORS
import yt_dlp, re, signal

app = Flask(__name__)
CORS(app)

def extract_video_id(url):
    m = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None

class TimeoutException(Exception): pass
def handler(signum, frame): raise TimeoutException()

@app.route('/api/resolve', methods=['POST'])
def resolve():
    data = request.get_json()
    vid = extract_video_id(data.get("url",""))

    if not vid:
        return jsonify({"type":"iframe","url":""})

    try:
        signal.signal(signal.SIGALRM, handler)
        signal.alarm(3)

        with yt_dlp.YoutubeDL({
            'quiet': True,
            'skip_download': True,
            'format': 'worst'
        }) as ydl:
            info = ydl.extract_info(f"https://youtube.com/watch?v={vid}", download=False)

        signal.alarm(0)

        return jsonify({
            "type":"stream",
            "title": info.get("title"),
            "stream_url": info.get("url")
        })

    except:
        return jsonify({
            "type":"iframe",
            "url": f"https://www.youtube.com/embed/{vid}?autoplay=1&playsinline=1"
        })