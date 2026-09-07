# -*- coding: utf-8 -*-
"""测试 RapidOCR 对真实微信截图的识别效果"""
import sys, json
sys.stdout.reconfigure(encoding='utf-8')
from rapidocr_onnxruntime import RapidOCR

img = r"D:\xwechat_files\wxid_lrwd927yolcl22_d861\temp\RWTemp\2026-08\ff403355a09aee050b5dbf5adfbe0649\ac3bcbd65d09d271819ed996107bdf08.jpg"

print("加载 RapidOCR 引擎...")
engine = RapidOCR()
print("引擎加载完成")
result, elapse = engine(img)
print("elapse:", elapse)

if not result:
    print("无识别结果")
    sys.exit(0)

print("识别项数:", len(result))
print("--- 每项: box[4点] text score ---")
for item in result:
    box = item[0]
    text = item[1]
    score = item[2]
    # box: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    xs = [p[0] for p in box]; ys = [p[1] for p in box]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    print(f"({x0:.0f},{y0:.0f})-({x1:.0f},{y1:.0f}) [{score}] {text}")
