# -*- coding: utf-8 -*-
"""ChatRecord 本地 OCR 服务
基于 RapidOCR（PaddleOCR 模型 ONNX 版），识别效果远超 Tesseract，中文识别业界开源最强。

用法：
    python ocr_server.py          # 启动，监听 127.0.0.1:8765
接口：
    GET  /health                 → {"ok": true}
    POST /ocr  body: {"image": "<dataURL 或 base64>"}
                                 → {"width": W, "height": H, "items": [
                                      {"box": [[x,y]x4], "text": "...", "score": 0.9,
                                       "x0":..,"y0":..,"x1":..,"y1":..}, ... ]}
"""
import sys
import json
import base64
import io
from http.server import HTTPServer, BaseHTTPRequestHandler

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

PORT = 8765
engine = RapidOCR()


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/health'):
            body = json.dumps({'ok': True, 'engine': 'rapidocr'}).encode('utf-8')
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if not self.path.startswith('/ocr'):
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode('utf-8'))
            b64 = data.get('image', '')
            if ',' in b64:
                b64 = b64.split(',', 1)[1]
            img_bytes = base64.b64decode(b64)
            img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
            w, h = img.size
            arr = np.array(img)
            result, _ = engine(arr)
            items = []
            if result:
                for box, text, score in result:
                    xs = [p[0] for p in box]
                    ys = [p[1] for p in box]
                    items.append({
                        'box': box,
                        'text': text,
                        'score': float(score),
                        'x0': float(min(xs)), 'y0': float(min(ys)),
                        'x1': float(max(xs)), 'y1': float(max(ys))
                    })
            body = json.dumps({'width': w, 'height': h, 'items': items}, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({'error': str(e)}, ensure_ascii=False).encode('utf-8')
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print(f'ChatRecord OCR 服务已启动: http://127.0.0.1:{PORT}  (RapidOCR)')
    try:
        HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print('已停止')
