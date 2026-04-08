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
@app.route('/api/search')
def search():
    q = request.args.get('q')
    if not q:
        return jsonify([])

    try:
        with yt_dlp.YoutubeDL({
            'quiet': True,
            'extract_flat': True,
            'socket_timeout': 2
        }) as ydl:
            info = ydl.extract_info(f"ytsearch2:{q}", download=False)

        return jsonify([
            {
                "id": e["id"],
                "title": e["title"],
                "thumbnail": f"https://i.ytimg.com/vi/{e['id']}/mqdefault.jpg",
                "url": f"https://youtu.be/{e['id']}"
            } for e in info.get("entries", [])
        ])

    except Exception as e:
        print("SEARCH ERROR:", str(e))
        return jsonify([])  # 🔥 절대 500 안터지게