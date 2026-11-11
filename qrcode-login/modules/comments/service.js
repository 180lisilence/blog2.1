/**
 * 评论业务逻辑
 *
 * 设计要点：
 * 1. 文章标识 post_slug = blog/posts/<slug>.html 去掉扩展名。
 *    落库前必须校验该文章真实存在，避免评论写到任意 slug 上。
 * 2. 内容只存纯文本，渲染端统一转义，从根上杜绝评论 XSS。
 * 3. 软删除（status=0）：有回复的评论删掉后保留占位，回复链不断裂。
 * 4. 层级只做两级：顶层评论 + 一级回复。回复的回复会挂到同一顶层下，
 *    避免无限嵌套导致的渲染与查询复杂度爆炸。
 */
const fs = require("fs");
const path = require("path");
const config = require("../../config");
const logger = require("../../core/logger");

// 文章目录（只允许这个目录下的 slug）
const POSTS_DIR = path.join(config.blogContent, "posts");

// 内容约束
const MAX_LENGTH = 1000;
const MIN_LENGTH = 1;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

// 同一用户两次评论的最小间隔（毫秒），防刷屏
const RATE_LIMIT_MS = 10 * 1000;

/**
 * 校验 slug 合法性并确认文章存在
 * @returns {boolean}
 */
function isValidPost(slug) {
  if (typeof slug !== "string" || !slug) return false;
  // 只允许字母数字下划线中划线点，长度受限，天然挡住路径穿越
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(slug)) return false;
  try {
    const file = path.join(POSTS_DIR, `${slug}.html`);
    // 二次确认解析后的路径确实在 posts 目录内
    const resolved = path.resolve(file);
    if (!resolved.startsWith(path.resolve(POSTS_DIR) + path.sep)) return false;
    return fs.existsSync(resolved);
  } catch (e) {
    return false;
  }
}

/**
 * 列出所有文章 slug（用于前端校验与管理端展示）
 */
function listPosts() {
  try {
    if (!fs.existsSync(POSTS_DIR)) return [];
    return fs
      .readdirSync(POSTS_DIR)
      .filter(f => f.endsWith(".html"))
      .map(f => f.slice(0, -5))
      .filter(s => /^[A-Za-z0-9_-]{1,100}$/.test(s));
  } catch (e) {
    logger.error("comments-service", "读取文章目录失败", e);
    return [];
  }
}

/**
 * 规范化内容：统一换行、去掉首尾空白、压缩过多连续空行
 */
function normalizeContent(raw) {
  let s = String(raw == null ? "" : raw);
  // 统一换行符
  s = s.replace(/\r\n?/g, "\n");
  // 去掉零宽字符与 BOM，防止绕过长度/重复检测
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // 连续 3 个以上换行压成 2 个
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/**
 * 校验评论内容
 * @returns {{ok:boolean, msg?:string, content?:string}}
 */
function validateContent(raw) {
  // B2-02：旧版用 String(raw) 兜底，传对象会被静默变成
  // "[object Object]"、传数组变成 "x,y" 并成功落库，属于输入类型混淆。
  // 评论内容只接受字符串，其它一律显式 400 拒绝。
  if (typeof raw !== "string") {
    return { ok: false, msg: "评论内容必须是字符串" };
  }
  const content = normalizeContent(raw);
  if (content.length < MIN_LENGTH) {
    return { ok: false, msg: "评论内容不能为空" };
  }
  if (content.length > MAX_LENGTH) {
    return { ok: false, msg: `评论最多 ${MAX_LENGTH} 个字符，当前 ${content.length} 个` };
  }
  // 纯空白/纯标点堆砌不算有效评论
  if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(content)) {
    return { ok: false, msg: "评论内容需要包含文字或数字" };
  }
  return { ok: true, content };
}

/**
 * 把数据库行转成前端需要的结构
 *
 * @param {object} row      数据库行
 * @param {object} viewer   查看者信息 { name: string|null, isAdmin: boolean }
 *   - name：当前登录用户名（未登录为 null）
 *   - isAdmin：是否为内置管理员（builtin）。删除权限只认 builtin 管理员，
 *     普通访客即便评论是自己的也不能删 —— 判断依据见 routes.js 的说明。
 */
function toDTO(row, viewer) {
  const v = viewer && typeof viewer === "object" ? viewer : { name: viewer || null, isAdmin: false };
  const deleted = row.status === 0;
  return {
    id: Number(row.id),
    postSlug: row.post_slug,
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    username: deleted ? null : row.username,
    content: deleted ? "" : row.content,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    deleted,
    // 前端据此决定是否显示删除按钮。
    // 2.2.8：删除权限收紧为「仅内置管理员」。旧口径是「评论作者本人」，
    // 等于任何访客都能删自己的评论 —— 与站内权限模型不符。
    // 注意必须用 Boolean() 包一层：viewer.name 为 null 时
    // `null && ...` 会短路返回 null，前端拿到 null 虽能当假值用但不干净。
    canDelete: Boolean(!deleted && v.isAdmin)
  };
}

/**
 * 把扁平列表组装成树：顶层评论带 replies 数组
 */
function buildTree(rows, viewer) {
  const map = new Map();
  const roots = [];

  for (const row of rows) {
    const dto = toDTO(row, viewer);
    dto.replies = [];
    map.set(dto.id, dto);
  }
  for (const row of rows) {
    const dto = map.get(Number(row.id));
    const pid = row.parent_id === null ? null : Number(row.parent_id);
    if (pid === null) {
      roots.push(dto);
    } else if (map.has(pid)) {
      // 父评论在同一页内：挂到父节点下
      map.get(pid).replies.push(dto);
    } else {
      // 父评论不在本页（分页边界）：降级成顶层，保证不丢评论
      dto.parentIdOutsidePage = pid;
      roots.push(dto);
    }
  }
  return roots;
}

module.exports = {
  POSTS_DIR,
  MAX_LENGTH,
  MIN_LENGTH,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  RATE_LIMIT_MS,
  isValidPost,
  listPosts,
  normalizeContent,
  validateContent,
  toDTO,
  buildTree
};
