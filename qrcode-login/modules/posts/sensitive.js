/**
 * 敏感词分级引擎（3.1）
 *
 * 分三级处理，对应「快速审核」的三种结果：
 *   none   —— 未命中：系统即时发布（快速通过）
 *   medium —— 命中提示类词 / 广告引流 / 多链接：转人工快速审核
 *   high   —— 命中违禁类词：直接拦截，不进入公开列表
 *
 * 匹配前先做归一化：转小写、去掉零宽字符、去掉所有空白与标点。
 * 这样「赌 博」「赌-博」「赌.博」都会归一成「赌博」，能挡住最基础的变形绕过。
 * 归一化只用于命中判断，展示时仍使用词表原文。
 */

// 高危词：违法违规内容，命中直接拦截（rejected）
const BLOCK_WORDS = [
  // 毒品
  "毒品", "冰毒", "海洛因", "大麻", "摇头丸", "氯胺酮", "k粉", "芬太尼",
  "制毒", "贩毒", "吸毒工具",
  // 枪支弹药爆炸物
  "枪支", "弹药", "手枪", "步枪", "炸药", "炸弹", "雷管", "硝化甘油",
  "土制炸弹", "枪支零件",
  // 赌博
  "赌博", "博彩", "赌场", "六合彩", "时时彩", "百家乐", "外围赌球", "赌球",
  // 诈骗与黑产
  "电信诈骗", "刷单返利", "杀猪盘", "洗钱", "跑分", "钓鱼网站", "诈骗脚本",
  "假客服", "木马病毒", "勒索病毒", "撞库", "盗号", "免杀教程",
  "ddos攻击", "黑客攻击教程",
  // 色情与性暴力
  "色情", "裸聊", "约炮", "一夜情", "成人视频", "黄片", "嫖娼", "卖淫",
  "性交易", "迷奸", "强奸", "恋童",
  // 暴力与自伤
  "恐怖袭击", "爆炸袭击", "杀人教程", "自杀教程", "自残教程", "虐待儿童",
  // 违禁物品与证件
  "迷药", "听话水", "假币", "假钞", "伪造证件", "身份证代办",
  "银行卡买卖", "手机卡买卖"
];

// 提示词：粗俗辱骂、广告引流、金融黑产话术，命中转人工审核（pending）
const REVIEW_WORDS = [
  // 辱骂
  "傻逼", "煞笔", "脑残", "智障", "弱智", "废物", "去死", "贱人", "婊子",
  "杂种", "狗东西", "狗娘养", "草泥马", "尼玛", "你妈的", "操你妈", "他妈",
  "卧槽", "滚蛋",
  "fuck", "shit", "bitch", "asshole",
  // 广告引流
  "加微信", "加vx", "加v信", "加威信", "私聊", "代购", "刷单", "高薪兼职",
  "兼职日结", "躺赚", "稳赚", "内部渠道", "一手货源", "免费领取", "点击领取",
  "扫码领取", "优惠券群", "引流", "推广链接", "代理加盟",
  // 金融与传销
  "传销", "炒币", "挖矿", "原始股", "内幕消息", "稳赚不赔", "信用卡套现",
  "花呗套现", "无抵押贷款", "贷款秒批"
];

const MAX_TEXT = 30000;
const MAX_HITS = 20;

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const CONTACT_RE = /(?:微信|vx|v信|威信|扣扣|qq|电话|手机号|联系方式)\s*[：:]?\s*[a-z0-9_-]{5,}/gi;

/**
 * 归一化：只保留中文、字母、数字
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return String(text == null ? "" : text)
    .toLowerCase()
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "");
}

/**
 * 扫描一段文本
 * @param {string} text
 * @returns {{level:"none"|"medium"|"high", hits:Array, reasons:string[]}}
 */
function scan(text) {
  const raw = String(text == null ? "" : text).slice(0, MAX_TEXT);
  const norm = normalize(raw);

  const hits = [];
  const reasons = [];
  let level = "none";

  for (const word of BLOCK_WORDS) {
    const w = normalize(word);
    if (!w) continue;
    if (norm.includes(w)) {
      hits.push({ word, category: "block", level: "high" });
      level = "high";
    }
  }

  for (const word of REVIEW_WORDS) {
    const w = normalize(word);
    if (!w) continue;
    if (norm.includes(w)) {
      hits.push({ word, category: "review", level: "medium" });
      if (level !== "high") level = "medium";
    }
  }

  const urls = raw.match(URL_RE) || [];
  if (urls.length >= 3) {
    reasons.push(`包含 ${urls.length} 个链接，疑似引流`);
    if (level !== "high") level = "medium";
  }

  const contacts = raw.match(CONTACT_RE) || [];
  if (contacts.length > 0) {
    reasons.push("包含疑似联系方式，疑似广告");
    if (level !== "high") level = "medium";
  }

  // 同一个词命中多次只保留一条，避免审核页刷屏
  const seen = new Set();
  const uniqueHits = [];
  for (const h of hits) {
    if (seen.has(h.word)) continue;
    seen.add(h.word);
    uniqueHits.push(h);
    if (uniqueHits.length >= MAX_HITS) break;
  }

  return { level, hits: uniqueHits, reasons };
}

/**
 * 对标题 + 摘要 + 正文做整体判定
 * @param {{title?:string, summary?:string, content?:string}} parts
 * @returns {{level:string, action:"publish"|"review"|"reject", hits:Array, reasons:string[]}}
 */
function evaluate(parts) {
  const text = [parts && parts.title, parts && parts.summary, parts && parts.content]
    .filter(Boolean)
    .join("\n");
  const result = scan(text);
  let action = "publish";
  if (result.level === "high") action = "reject";
  else if (result.level === "medium") action = "review";
  return { ...result, action };
}

module.exports = {
  BLOCK_WORDS,
  REVIEW_WORDS,
  normalize,
  scan,
  evaluate
};
