#!/usr/bin/env python3
"""
YouTube Ad-Free Player — Vercel Serverless Function
"""

import json
import re
import os
from http.server import BaseHTTPRequestHandler

try:
    import yt_dlp
except ImportError:
    yt_dlp = None


def extract_video_id(url):
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def get_quality_format(quality):
    """Return yt-dlp format string based on quality selection."""
    formats = {
        '1080': 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best',
        '720':  'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best',
        '480':  'bestvideo[ext=mp4][height<=480]+bestaudio[ext=m4a]/best[ext=mp4][height<=480]/best',
        '360':  'bestvideo[ext=mp4][height<=360]+bestaudio[ext=m4a]/best[ext=mp4][height<=360]/best',
        'audio':'bestaudio[ext=m4a]/bestaudio',
    }
    return formats.get(quality, formats['720'])


def resolve_video(url, quality='720'):
    vid = extract_video_id(url)
    if not vid:
        return None, '유효한 YouTube URL이 아닙니다'

    canonical = f'https://www.youtube.com/watch?v={vid}'

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'format': get_quality_format(quality),
        'noplaylist': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(canonical, download=False)

        stream_url = None
        audio_url = None

        if 'url' in info:
            stream_url = info['url']
        elif 'formats' in info:
            # find best combined mp4
            for fmt in reversed(info['formats']):
                if (fmt.get('ext') == 'mp4'
                        and fmt.get('url')
                        and fmt.get('acodec') != 'none'
                        and fmt.get('vcodec') != 'none'):
                    stream_url = fmt['url']
                    break
            # find best audio only
            best_audio_bitrate = 0
            for fmt in info['formats']:
                if (fmt.get('url')
                        and fmt.get('acodec') != 'none'
                        and fmt.get('vcodec') == 'none'):
                    abr = fmt.get('abr') or fmt.get('tbr') or 0
                    if abr > best_audio_bitrate:
                        best_audio_bitrate = abr
                        audio_url = fmt['url']
            if not stream_url:
                for fmt in reversed(info['formats']):
                    if fmt.get('url'):
                        stream_url = fmt['url']
                        break

        if not stream_url:
            return None, '스트림 URL을 가져올 수 없습니다'

        # get available qualities
        available_heights = set()
        for fmt in info.get('formats', []):
            h = fmt.get('height')
            if h and fmt.get('vcodec') != 'none':
                available_heights.add(h)
        quality_list = sorted([h for h in available_heights if h in [360,480,720,1080]], reverse=True)

        thumbnail = info.get('thumbnail', '')
        thumbnails = info.get('thumbnails', [])
        for t in thumbnails:
            if t.get('id') == 'mqdefault' or '320' in str(t.get('width', '')):
                thumbnail = t['url']
                break

        return {
            'id':            vid,
            'title':         info.get('title', '제목 없음'),
            'channel':       info.get('uploader', '알 수 없음'),
            'duration':      info.get('duration', 0),
            'thumbnail':     thumbnail,
            'stream_url':    stream_url,
            'audio_url':     audio_url or stream_url,
            'qualities':     quality_list,
        }, None

    except Exception as e:
        msg = str(e)
        if 'Private video' in msg:
            return None, '비공개 영상입니다'
        if 'Video unavailable' in msg:
            return None, '재생할 수 없는 영상입니다'
        return None, f'영상을 가져오지 못했습니다: {msg[:120]}'


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        try:
            data = json.loads(body)
        except Exception:
            self._json({'error': 'Invalid JSON'}, 400)
            return

        url     = data.get('url', '').strip()
        quality = data.get('quality', '720')

        if not url:
            self._json({'error': 'URL이 비어있습니다'}, 400)
            return

        if yt_dlp is None:
            self._json({'error': 'yt-dlp not installed'}, 500)
            return

        result, error = resolve_video(url, quality)
        if error:
            self._json({'error': error}, 400)
        else:
            self._json(result, 200)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
