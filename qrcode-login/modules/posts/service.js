/**
 * 文章业务逻辑（3.1）
 *
 * 约束：
 * - 正文按纯文本存储，渲染端统一转义，从根上杜绝文章 XSS
 * - 标题 2-80 字，正文 10-20000 字，摘要 ≤150 字，标签 ≤20 字
 * - 同一用户 60 秒内只能发一篇，24 小时最多 10 篇
 */
const crypto = require("crypto");

const RATE_LIMIT_MS = 60 * 1000;
const DAILY_MAX = 10;
const TITLE_MIN = 2;
const TITLE_MAX = 80;
const SUMMARY_MAX = 150;
const CONTENT_MIN = 10;
const CONTENT_MAX = 20000;
const TAG_MAX = 20;

/**
 * 统一换行、去掉零宽字符、压缩过多空行
 */
function normalizeText(raw) {
  let s = String(raw == null ? "" : raw);
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/**
 * 校验并规范化发帖输入
 * @param {object} body
 * @returns {{ok:boolean, msg?:string, input?:object}}
 */
function validateInput(body) {
  const b = body && typeof body === "object" ? body : {};
  if (typeof b.title !== "string" || typeof b.content !== "string") {
    return { ok: false, msg: "标题和正文必须是字符串" };
  }

  const title = normalizeText(b.title).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return { ok: false, msg: `标题需要 ${TITLE_MIN}-${TITLE_MAX} 个字符，当前 ${title.length} 个` };
  }

  const content = normalizeText(b.content);
  if (content.length < CONTENT_MIN || content.length > CONTENT_MAX) {
    return { ok: false, msg: `正文需要 ${CONTENT_MIN}-${CONTENT_MAX} 个字符，当前 ${content.length} 个` };
  }
  if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(content)) {
    return { ok: false, msg: "正文需要包含文字或数字" };
  }

  let summary = "";
  if (b.summary !== undefined && b.summary !== null) {
    if (typeof b.summary !== "string") return { ok: false, msg: "摘要必须是字符串" };
    summary = normalizeText(b.summary).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    if (summary.length > SUMMARY_MAX) {
      return { ok: false, msg: `摘要最多 ${SUMMARY_MAX} 个字符，当前 ${summary.length} 个` };
    }
  }

  let tag = "";
  if (b.tag !== undefined && b.tag !== null) {
    if (typeof b.tag !== "string") return { ok: false, msg: "标签必须是字符串" };
    tag = b.tag.replace(/^#+/, "").replace(/\s+/g, " ").trim();
    if (tag.length > TAG_MAX) {
      return { ok: false, msg: `标签最多 ${TAG_MAX} 个字符，当前 ${tag.length} 个` };
    }
  }

  return { ok: true, input: { title, summary, content, tag } };
}

/**
 * 生成 ASCII 安全的 slug（可被评论模块的白名单正则接受）
 */
function generateSlug() {
  return `u-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

function parseHits(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

/**
 * 列表 DTO（不含正文）
 */
function toListDTO(row) {
  return {
    id: Number(row.id),
    slug: row.slug,
    url: `/p/${row.slug}`,
    author: row.author,
    title: row.title,
    summary: row.summary || "",
    tag: row.tag || "",
    status: row.status,
    riskLevel: row.risk_level,
    autoPassed: Boolean(row.auto_passed),
    createdAt: Number(row.created_at)
  };
}

/**
 * 详情 DTO（含正文，仅已发布内容对访客开放）
 */
function toDetailDTO(row) {
  return {
    ...toListDTO(row),
    content: row.content
  };
}

/**
 * 我的文章 DTO：带审核状态、命中词与审核意见，便于作者知道为什么没过
 */
function toMineDTO(row) {
  return {
    ...toListDTO(row),
    content: row.content,
    hits: parseHits(row.sensitive_hits),
    reviewNote: row.review_note || "",
    reviewedBy: row.reviewed_by || "",
    reviewedAt: Number(row.reviewed_at || 0),
    updatedAt: Number(row.updated_at)
  };
}

/**
 * 待审 DTO：给管理员看全文 + 命中词
 */
function toPendingDTO(row) {
  return {
    ...toDetailDTO(row),
    hits: parseHits(row.sensitive_hits),
    reviewNote: row.review_note || "",
    createdAt: Number(row.created_at)
  };
}

module.exports = {
  RATE_LIMIT_MS,
  DAILY_MAX,
  TITLE_MIN,
  TITLE_MAX,
  SUMMARY_MAX,
  CONTENT_MIN,
  CONTENT_MAX,
  TAG_MAX,
  normalizeText,
  validateInput,
  generateSlug,
  parseHits,
  toListDTO,
  toDetailDTO,
  toMineDTO,
  toPendingDTO
};
