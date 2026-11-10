/**
 * 评论数据访问层
 * 所有 SQL 集中在这里，routes 不直接碰数据库
 */
const pool = require("../../db/pool");

/**
 * 分页查询某篇文章的评论（顶层评论分页，回复全量带出）
 *
 * 分页策略：先按顶层评论分页，再把本页顶层评论的所有回复一次捞出。
 * 这样既不会因为回复多而撑爆单页，也不会出现"父评论不在本页"的断裂。
 *
 * 可见顶层评论的判定（关键）：
 *   status = 1                              —— 正常评论
 *   OR 存在 status = 1 的子回复              —— 已被软删除但底下还有活着的回复
 *
 * 第二条不能省。父评论被软删除时（status=0，content 已清空），如果这里只认
 * status=1，它的 id 就进不了 topIds，后面 parent_id IN (...) 自然也捞不到子回复，
 * 结果是"接口返回 soft:true 说回复会保留"、"用户却一条都看不到"。加上这条
 * EXISTS 之后，软删的父评论会以占位形态留在时间线里（DTO 层把内容置空并标
 * deleted，前端渲染成"该评论已删除"），回复链才真正保住。
 *
 * @param {string} postSlug
 * @param {number} page   1-based
 * @param {number} size
 * @returns {Promise<{rows:Array, total:number, totalPages:number}>}
 */
async function listByPost(postSlug, page, size) {
  // 参数已在上层做过 Number 取整与范围钳制，这里再兜一层，保证拼进 SQL 的一定是整数
  const safeSize = Math.min(Math.max(parseInt(size, 10) || 20, 1), 50);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeSize;

  // 可见顶层评论的统一筛选条件，计数与取 id 必须用同一套，否则总页数会算歪
  const VISIBLE_TOP = `post_slug = ? AND parent_id IS NULL AND (
      status = 1
      OR EXISTS (SELECT 1 FROM comments c2 WHERE c2.parent_id = comments.id AND c2.status = 1)
    )`;

  // 顶层评论总数
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS c FROM comments WHERE ${VISIBLE_TOP}`,
    [postSlug]
  );
  const total = Number(countRows[0]?.c || 0);
  const totalPages = Math.max(1, Math.ceil(total / safeSize));

  // 取本页顶层评论 id
  // 注意：LIMIT/OFFSET 在某些 MySQL 版本下无法用占位符绑定，
  // 这里已验证过是整数，直接拼接。
  const [topRows] = await pool.query(
    `SELECT id FROM comments
     WHERE ${VISIBLE_TOP}
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeSize} OFFSET ${offset}`,
    [postSlug]
  );

  if (topRows.length === 0) {
    return { rows: [], total, totalPages };
  }

  const topIds = topRows.map(r => Number(r.id));
  const placeholders = topIds.map(() => "?").join(",");

  // 顶层评论本体 + 其下全部回复（回复按时间正序，符合阅读习惯）
  const [rows] = await pool.query(
    `SELECT * FROM comments
     WHERE (id IN (${placeholders}))
        OR (parent_id IN (${placeholders}))
     ORDER BY created_at ASC, id ASC`,
    [...topIds, ...topIds]
  );

  return { rows, total, totalPages };
}

/**
 * 按 id 取单条
 */
async function getById(id) {
  const [rows] = await pool.query("SELECT * FROM comments WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

/**
 * 新增评论
 * @returns {Promise<number>} 新评论 id
 */
async function create({ postSlug, parentId, username, content, ip, userAgent }) {
  const now = Date.now();
  const [result] = await pool.execute(
    `INSERT INTO comments
       (post_slug, parent_id, username, content, status, ip, user_agent, created_at, updated_at)
     VALUES (?,?,?,?,1,?,?,?,?)`,
    [postSlug, parentId, username, content, ip || null, (userAgent || "").slice(0, 255), now, now]
  );
  return Number(result.insertId);
}

/**
 * 软删除：status 置 0，内容清空，保留行以维系回复链
 */
async function softDelete(id) {
  await pool.execute(
    "UPDATE comments SET status = 0, content = '', updated_at = ? WHERE id = ?",
    [Date.now(), id]
  );
}

/**
 * 硬删除（仅用于没有任何回复的叶子评论，保持库干净）
 */
async function hardDelete(id) {
  await pool.execute("DELETE FROM comments WHERE id = ?", [id]);
}

/**
 * 统计某条评论的直接回复数
 */
async function countReplies(id) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS c FROM comments WHERE parent_id = ? AND status = 1",
    [id]
  );
  return Number(rows[0]?.c || 0);
}

/**
 * 取某用户最近一条评论的时间，用于频率限制
 */
async function lastCommentAt(username) {
  const [rows] = await pool.query(
    "SELECT created_at FROM comments WHERE username = ? ORDER BY created_at DESC LIMIT 1",
    [username]
  );
  return rows[0] ? Number(rows[0].created_at) : 0;
}

/**
 * 全站评论总数与按文章统计（管理/统计用）
 */
async function stats() {
  const [rows] = await pool.query(
    `SELECT post_slug, COUNT(*) AS c FROM comments
     WHERE status = 1 GROUP BY post_slug ORDER BY c DESC`
  );
  const byPost = {};
  let all = 0;
  for (const r of rows) {
    byPost[r.post_slug] = Number(r.c);
    all += Number(r.c);
  }
  return { total: all, byPost };
}

/**
 * 某篇文章的评论数（列表页显示用）
 */
async function countByPost(postSlug) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS c FROM comments WHERE post_slug = ? AND status = 1",
    [postSlug]
  );
  return Number(rows[0]?.c || 0);
}

/**
 * 批量取多篇文章的评论数（首页列表用，避免 N+1 查询）
 */
async function countsByPosts(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return {};
  const placeholders = slugs.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT post_slug, COUNT(*) AS c FROM comments
     WHERE status = 1 AND post_slug IN (${placeholders})
     GROUP BY post_slug`,
    slugs
  );
  const out = {};
  for (const s of slugs) out[s] = 0;
  for (const r of rows) out[r.post_slug] = Number(r.c);
  return out;
}

module.exports = {
  listByPost,
  getById,
  create,
  softDelete,
  hardDelete,
  countReplies,
  lastCommentAt,
  stats,
  countByPost,
  countsByPosts
};
