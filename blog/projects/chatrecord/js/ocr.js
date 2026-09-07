/* ChatRecord OCR 模块：识别聊天截图 → 结构化消息
 * 双引擎：
 *   1. 本地 RapidOCR 服务（优先，识别效果好、零噪声）：http://127.0.0.1:8765
 *      —— 启动方式：运行 start-ocr.bat（或 python backend/ocr_server.py）
 *   2. Tesseract.js（回退，纯前端、离线，精度一般）
 * 布局解析（共用）：
 *   1. 用 OCR 拿到每个词的坐标
 *   2. 按 y 聚类成"行"，行内按 x 中心判断左/右（对方/我）
 *   3. 识别时间戳行（HH:MM / 上午/下午 / 昨天/今天/刚刚）
 *   4. 输出 [{ ts, sender, text }]，与 ChatData 格式一致
 */
const ChatOCR = (function () {
  'use strict';

  // OCR 走 blog 后端代理（后端自动拉起 Python RapidOCR 服务）
  const OCR_SERVER = '/api/chatrecord';

  let worker = null;
  let workerLoading = null;

  /* 干扰词：底部输入栏 / 表情栏 / 状态栏 / 标题栏，不当作消息 */
  const JUNK_RE = /发消息|按住说话|打招呼|比心|捂脸|可点亮|对方正在输入|输入中|^赞$|^玫瑰?$|^赞赞$|撤回了一条消息|以上是打招呼/i;

  /* 12/24 小时制时间词 */
  const TIME_RE = /(上午|早上|中午|下午|晚上|凌晨)?\s*(\d{1,2})[:：](\d{2})/;
  const REL_RE = /^(昨天|今天|刚刚|前天)$/;

  /* 懒加载 worker（首次识别时初始化） */
  function ensureWorker(onStatus) {
    if (worker) return Promise.resolve(worker);
    if (workerLoading) return workerLoading;
    workerLoading = (async () => {
      onStatus && onStatus('正在加载识别引擎（首次约 10~30 秒）...');
      worker = await Tesseract.createWorker('chi_sim', 1, {
        workerPath: 'libs/tesseract/worker.min.js',
        corePath: 'libs/tesseract/',
        langPath: 'libs/tesseract/lang/'
      });
      return worker;
    })();
    return workerLoading;
  }

  /* 识别单张图片，返回 Tesseract 的 data */
  async function recognizeData(img, onStatus) {
    const w = await ensureWorker(onStatus);
    onStatus && onStatus('正在识别图片文字...');
    const { data } = await w.recognize(img, {}, { blocks: true });
    return data;
  }

  /* ---------- 布局解析 ---------- */

  /* 解析一行内的词 → 判定是时间戳行还是消息行 */
  function classifyLine(words, W, H, now, opts) {
    const text = words.map(w => w.t).join('').replace(/\s+/g, '');
    // 时间戳行：词少、字数少、含时间模式或相对时间词
    const tm = text.match(TIME_RE);
    if ((words.length <= 3 && text.length <= 8) && (tm || REL_RE.test(text))) {
      return { type: 'time', text, raw: tm };
    }
    return { type: 'msg', words };
  }

  /* 解析 HH:MM 到当天时间戳；支持上午/下午 */
  function parseClock(raw, baseDate) {
    const [, amp, hh, mm] = raw;
    let h = parseInt(hh, 10);
    const m = parseInt(mm, 10);
    if (amp) {
      if ((amp === '下午' || amp === '晚上' || amp === '中午') && h < 12) h += 12;
      if (amp === '凌晨' || amp === '上午') { /* 原样 */ }
    } else if (h < 7) {
      // 24h 制但像 "9:41" 无前缀 → 按字面；若 h<7 且接近半夜，可能实际是下午，不猜，按字面
    }
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  /* 从 Tesseract data 中提取所有词（v6 结构：blocks → paragraphs → lines → words） */
  function collectWords(data) {
    const words = [];
    (data.blocks || []).forEach(b => {
      (b.paragraphs || []).forEach(p => {
        (p.lines || []).forEach(l => {
          (l.words || []).forEach(w => {
            if (w && w.text) words.push({ t: String(w.text).trim(), c: w.confidence, b: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 } });
          });
        });
      });
    });
    return words.filter(w => w.t);
  }

  /* 主解析：words + 图片尺寸 → 消息数组 */
  function parseLayout(data, imgW, imgH, opts) {
    opts = opts || {};
    const otherName = opts.otherName || '对方';
    const myName = opts.myName || '我';
    const W = imgW || 1080;
    const H = imgH || 2400;
    const midX = W * 0.5;

    const rawWords = collectWords(data);

    /* 1. 过滤干扰区域 */
    const keep = rawWords.filter(w => {
      const x0 = w.b.x0, y0 = w.b.y0, x1 = w.b.x1, y1 = w.b.y1;
      if (y1 < H * 0.045) return false;   // 顶部状态栏（时间/电量）
      if (y0 > H * 0.94) return false;    // 底部输入栏/安全区
      if (y0 > H * 0.88 && y1 < H * 0.96) return false;  // 表情栏/快捷栏横条
      if (w.c != null && w.c < 20) return false;  // 置信度过低的识别噪声
      if (JUNK_RE.test(w.t)) return false;
      // 左侧头像区单字噪声（如 OCR 把头像读成"总/必"）
      if (x1 < W * 0.16 && w.t.length <= 1) return false;
      // 顶部导航栏（昵称/返回按钮等非消息区）：y < 13% 且不是时间词 → 过滤
      const isTimeWord = TIME_RE.test(w.t) || REL_RE.test(w.t);
      if (y0 < H * 0.13 && !isTimeWord && w.t.length <= 12) return false;
      return true;
    });

    /* 2. 按 y 聚类成行 */
    const lines = [];
    for (const w of keep) {
      const { x0, y0, x1, y1 } = w.b;
      const placed = lines.find(l =>
        y0 < l.yMax && y1 > l.yMin          // y 重叠
      );
      if (placed) {
        placed.words.push(w);
        placed.yMin = Math.min(placed.yMin, y0);
        placed.yMax = Math.max(placed.yMax, y1);
      } else {
        lines.push({ words: [w], yMin: y0, yMax: y1 });
      }
    }
    lines.sort((a, b) => (a.yMin + a.yMax) / 2 - (b.yMin + b.yMax) / 2);

    /* 3. 逐行判定 + 时间戳推进 */
    const now = new Date();
    let baseDate = new Date(now);
    if (opts.baseDate) {
      const dp = String(opts.baseDate).split('-').map(Number);
      if (dp.length === 3 && !isNaN(dp[0]) && !isNaN(dp[1]) && !isNaN(dp[2])) {
        baseDate = new Date(dp[0], dp[1] - 1, dp[2]);   // 本地时区
      }
    }
    let lastTs = baseDate.getTime();
    lastTs = lastTs - 86400000; // 初始为昨天，保证第一天有时间时能正确前移

    const msgs = [];
    let id = 1;
    let seq = 0;

    for (const line of lines) {
      // 行内词按 x 排序拼接
      line.words.sort((a, b) => (a.b.x0 + a.b.x1) / 2 - (b.b.x0 + b.b.x1) / 2);
      const cls = classifyLine(line.words, W, H, now, opts);

      if (cls.type === 'time') {
        // 更新时间基准
        const rel = cls.text.match(REL_RE);
        if (rel) {
          if (rel[1] === '昨天') baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          else if (rel[1] === '前天') baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
          else if (rel[1] === '今天') baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          else if (rel[1] === '刚刚') { baseDate = new Date(now); lastTs = now.getTime(); continue; }
          // 保留当前时刻，时间戳仍沿用上一个
          if (rel[1] !== '刚刚') lastTs = baseDate.getTime();
        } else if (cls.raw) {
          lastTs = parseClock(cls.raw, baseDate);
        }
        seq = 0;
        continue;
      }

      /* 消息行：按行中心 x 判定发送者 */
      const lineCx = line.words.reduce((s, w) => s + (w.b.x0 + w.b.x1) / 2, 0) / line.words.length;
      const sender = lineCx < midX ? otherName : myName;
      const text = line.words.map(w => w.t).join('').replace(/\s+/g, '').trim();
      if (!text) continue;

      // 时间：同一时间戳多条时递增 2 秒，避免完全相同
      const ts = lastTs + seq * 2000;
      seq++;
      msgs.push({ id: id++, ts, sender, text });
    }

    msgs.sort((a, b) => a.ts - b.ts);
    return msgs;
  }

  /* 识别前预处理：放大 2x；若为深色主题则反色（深底白字 → 白底黑字，Tesseract 识别更准）
   * 返回 canvas，其宽高用于布局坐标 */
  async function preprocess(img) {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const avg = sum / (d.length / 4);
    if (avg < 130) {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return canvas;
  }

  /* 批量识别多张图（Tesseract 引擎，回退路径）→ 合并消息（按时间排序） */
  async function batchRecognizeTesseract(files, opts, onStatus) {
    onStatus && onStatus('准备识别 ' + files.length + ' 张截图...');
    const all = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      onStatus && onStatus('正在识别第 ' + (i + 1) + '/' + files.length + ' 张：' + f.name);
      const url = URL.createObjectURL(f);
      try {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        const canvas = await preprocess(img);
        const data = await recognizeData(canvas, onStatus);
        const msgs = parseLayout(data, canvas.width, canvas.height, opts);
        all.push(...msgs);
      } catch (e) {
        onStatus && onStatus('第 ' + (i + 1) + ' 张识别失败：' + e.message);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    all.sort((a, b) => a.ts - b.ts);
    // 重新编号
    all.forEach((m, i) => { m.id = i + 1; });
    return all;
  }

  /* ---------- 本地 RapidOCR 服务（优先引擎） ---------- */

  /* 探测本地 OCR 服务是否可用 */
  async function rapidHealth() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(OCR_SERVER + '/ocr/health', { signal: ctrl.signal });
      clearTimeout(timer);
      return r.ok;
    } catch (e) {
      return false;
    }
  }

  /* 调用本地 OCR 服务识别一张图（dataURL） */
  async function rapidRecognize(dataURL) {
    const r = await fetch(OCR_SERVER + '/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataURL })
    });
    if (!r.ok) throw new Error('OCR 服务返回 ' + r.status);
    return await r.json();
  }

  /* 把 RapidOCR 返回的 items 包装成 parseLayout 兼容的 Tesseract data 结构
   * 注意：RapidOCR score 为 0~1，需换算成 0~100 与 Tesseract confidence 统一 */
  function rapidToData(json) {
    const words = (json.items || []).map(it => ({
      text: it.text,
      bbox: { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 },
      confidence: (it.score != null) ? it.score * 100 : 100
    }));
    return { blocks: [{ paragraphs: [{ lines: [{ words }] }] }] };
  }

  /* File → dataURL */
  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error('读取文件失败'));
      fr.readAsDataURL(file);
    });
  }

  /* 批量识别多张图（RapidOCR 服务引擎） */
  async function batchRecognizeRapid(files, opts, onStatus) {
    onStatus && onStatus('已连接本地 OCR 服务（RapidOCR，识别更准）...');
    const all = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      onStatus && onStatus('正在识别第 ' + (i + 1) + '/' + files.length + ' 张：' + f.name);
      try {
        const dataURL = await fileToDataURL(f);
        const json = await rapidRecognize(dataURL);
        const msgs = parseLayout(rapidToData(json), json.width, json.height, opts);
        all.push(...msgs);
      } catch (e) {
        onStatus && onStatus('第 ' + (i + 1) + ' 张识别失败：' + e.message);
      }
    }
    all.sort((a, b) => a.ts - b.ts);
    all.forEach((m, i) => { m.id = i + 1; });
    return all;
  }

  /* 批量识别主入口：优先本地 RapidOCR 服务，不可用则回退 Tesseract */
  async function batchRecognize(files, opts, onStatus) {
    onStatus && onStatus('准备识别 ' + files.length + ' 张截图...');
    const rapidOk = await rapidHealth();
    if (rapidOk) {
      return await batchRecognizeRapid(files, opts, onStatus);
    }
    onStatus && onStatus('未检测到本地 OCR 服务，改用基础识别（Tesseract）。建议运行 start-ocr.bat 获得更准效果');
    return await batchRecognizeTesseract(files, opts, onStatus);
  }

  /* 消息数组 → 可编辑文本行（ChatData.parseText 兼容格式） */
  function toTextLines(msgs) {
    const pad = n => String(n).padStart(2, '0');
    return msgs.map(m => {
      const d = new Date(m.ts);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
        ' ' + m.sender + ': ' + m.text;
    }).join('\n');
  }

  /* 资源释放 */
  async function dispose() {
    if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; workerLoading = null; }
  }

  return { ensureWorker, recognizeData, parseLayout, batchRecognize, rapidHealth, toTextLines, dispose };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = ChatOCR; }
