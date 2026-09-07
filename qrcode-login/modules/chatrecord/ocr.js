/**
 * ChatRecord OCR 服务
 * 优先本地 RapidOCR（127.0.0.1:8765），未启动回退 Tesseract.js（前端处理）
 */
const http = require("http");
const config = require("../../config");
const logger = require("../../core/logger");

const OCR_PORT = config.chatrecord.ocrPort;
const OCR_URL = `http://127.0.0.1:${OCR_PORT}`;

// 检查 OCR 服务健康状态
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${OCR_URL}/health`, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ available: true, engine: json.engine || "RapidOCR", version: json.version });
        } catch {
          resolve({ available: true, engine: "RapidOCR" });
        }
      });
    });
    req.on("error", () => resolve({ available: false }));
    req.on("timeout", () => { req.destroy(); resolve({ available: false }); });
  });
}

// 调用 OCR 识别
function recognize(imageDataURL) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ image: imageDataURL });
    const req = http.request(
      `${OCR_URL}/ocr`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData)
        },
        timeout: 30000
      },
      (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            // RapidOCR 返回 {width,height,items:[{box,text,score}]}
            // score 是 0~1，需要转成 0~100
            if (json.items && Array.isArray(json.items)) {
              json.items = json.items.map(item => ({
                ...item,
                score: typeof item.score === "number" && item.score <= 1 ? item.score * 100 : item.score
              }));
            }
            resolve(json);
          } catch (e) {
            logger.error("chatrecord-ocr", "OCR 响应解析失败", e.message);
            reject(new Error("OCR 响应解析失败"));
          }
        });
      }
    );
    req.on("error", (e) => {
      logger.warn("chatrecord-ocr", "OCR 服务不可用", e.message);
      reject(new Error("OCR 服务不可用"));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("OCR 识别超时"));
    });
    req.write(postData);
    req.end();
  });
}

module.exports = { checkHealth, recognize, OCR_URL };
