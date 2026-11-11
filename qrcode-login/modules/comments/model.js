/**
 * 评论数据访问层
 * 所有 SQL 集中在这里，routes 不直接碰数据库
 */
const pool = require("../../db/pool");

/**
 * 可见顶层评论的统一筛选条件（计数与取 id 必须共用同一份，否则总页数会算歪）
 *
 * 口径变更（2.2.8 修复「计数与列表不同步」）：
 *   旧口径 = status=1 OR EXISTS(活着的子回复)
 *   新口径 = status=1
 *
 * 旧口径的问题：一条被软删的父评论（status=0）只要底下还有活着的子回复，
 * 就会被计入 total，于是页面显示「评论 1」，点进去看到的却是一个
 * 「该评论已删除」的占位 —— 用户看到的计数与列表完全对不上。
 * 典型现场：生产 comments 表里 woldvein-project 只有两行
 *   id=1（顶层，status=0，已软删）
 *   id=2（回复 id=1，status=1，真实存在）
 * 旧口径 total=1，列表里那条顶层却是已删除的占位，真实回复 id=2 被算作
 * 「回复」挂在占位下面 —— 计数 1 指的是一个已删除的评论。
 *
 * 新口径下「计数 = 列表里真实存在的顶层评论数」，删除后立即同步。
 * 子回复不丢：softDelete 会把子回复提升为顶层（见 promoteReplies），
 * 所以不会出现「回复的父被删 → 回复变孤儿 → 回复也不显示」。
 */
const VISIBLE_TOP = `post_slug = ? AND parent_id IS NULL AND status = 1`;

/**
 * 分页查询某篇文章的评论（顶层评论分页，回复全量带出）
 *
 * 分页策略：先按顶层评论分页，再把本页顶层评论的所有回复一次捞出。
 * 这样既不会因为回复多而撑爆单页，也不会出现"父评论不在本页"的断裂。
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
 *
 * 2.2.8：软删的父评论不再计入列表与计数（口径见 VISIBLE_TOP），
 * 所以它的子回复必须被"提升"成顶层，否则回复会因为父评论不在可见集合里
 * 而一起从页面上消失（用户会看到"删了父评论，回复也没了"）。
 *
 * promoteReplies 把直接子回复的 parent_id 置为 NULL（提升为顶层）。
 * 只做一层：回复的回复在入库时已被统一挂到顶层（见 routes.js 的 parentId 归一），
 * 所以直接子回复就是这一条链上的全部下游，提升一层即可覆盖。
 */
async function softDelete(id) {
  await promoteReplies(id);
  await pool.execute(
    "UPDATE comments SET status = 0, content = '', updated_at = ? WHERE id = ?",
    [Date.now(), id]
  );
}

/**
 * 把某条评论的直接子回复提升为顶层评论（parent_id 置 NULL）
 */
async function promoteReplies(id) {
  await pool.execute(
    "UPDATE comments SET parent_id = NULL, updated_at = ? WHERE parent_id = ? AND status = 1",
    [Date.now(), id]
  );
}

/**
 * 修复存量孤儿回复：父评论已被软删（status=0）或行已不存在，
 * 但子回复仍是 status=1 且 parent_id 仍指向那个已删父评论。
 *
 * 2.2.8 起软删父评论不再计入可见集合，这些回复若不提升就会一起从页面消失。
 * 启动时跑一次即可把存量数据归位（幂等，重复执行无副作用）。
 *
 * 生产实证：woldvein-project 只有两行 —— id=1（顶层，status=0）、
 * id=2（parent_id=1，status=1），修复后 id=2 提升为顶层并正常计数/显示。
 */
async function repairOrphanReplies() {
  const [result] = await pool.execute(
    `UPDATE comments c
     JOIN comments p ON p.id = c.parent_id
     SET c.parent_id = NULL, c.updated_at = ?
     WHERE c.status = 1 AND c.parent_id IS NOT NULL AND p.status = 0`,
    [Date.now()]
  );
  return Number(result?.affectedRows || 0);
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
 *
 * 2.2.8：口径与 listByPost 的 total 对齐 —— 统计「真实可见的顶层评论」。
 * 旧口径 status=1（含回复）会把回复也算进去，和列表里显示的条目数对不上；
 * 旧口径同时也没排除软删父评论。现在两者完全一致：列表显示几条，计数就是几。
 */
async function countByPost(postSlug) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM comments WHERE ${VISIBLE_TOP}`,
    [postSlug]
  );
  return Number(rows[0]?.c || 0);
}

/**
 * 批量取多篇文章的评论数（首页列表用，避免 N+1 查询）
 * 口径与 countByPost / listByPost 完全一致。
 */
async function countsByPosts(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return {};
  const placeholders = slugs.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT post_slug, COUNT(*) AS c FROM comments
     WHERE ${VISIBLE_TOP.replace("post_slug = ?", `post_slug IN (${placeholders})`)}
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
  promoteReplies,
  repairOrphanReplies,
  hardDelete,
  countReplies,
  lastCommentAt,
  stats,
  countByPost,
  countsByPosts
};
