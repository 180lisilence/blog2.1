/**
 * 文章数据访问层（3.1）
 * 所有 SQL 集中在这里，routes 不直接碰数据库
 */
const pool = require("../../db/pool");

const LIST_FIELDS = "id, slug, author, title, summary, tag, status, risk_level, auto_passed, created_at, updated_at";

/**
 * 新增文章
 * @param {object} p
 * @returns {Promise<number>} 新文章 id
 */
async function create(p) {
  const now = Date.now();
  const [result] = await pool.execute(
    `INSERT INTO posts
       (slug, author, title, summary, content, tag, status, risk_level,
        auto_passed, sensitive_hits, review_note, reviewed_by, reviewed_at,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      p.slug,
      p.author,
      p.title,
      p.summary || "",
      p.content,
      p.tag || "",
      p.status,
      p.riskLevel || "none",
      p.autoPassed ? 1 : 0,
      JSON.stringify(p.hits || []),
      p.reviewNote || "",
      p.reviewedBy || "",
      p.reviewedAt || 0,
      now,
      now
    ]
  );
  return Number(result.insertId);
}

/**
 * 已发布文章分页列表（公开）
 */
async function listPublished(page, size) {
  const safeSize = Math.min(Math.max(parseInt(size, 10) || 10, 1), 50);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeSize;

  const [countRows] = await pool.query("SELECT COUNT(*) AS c FROM posts WHERE status = 'published'");
  const total = Number(countRows[0]?.c || 0);

  const [rows] = await pool.query(
    `SELECT ${LIST_FIELDS} FROM posts
     WHERE status = 'published'
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeSize} OFFSET ${offset}`
  );

  return { rows, total, page: safePage, size: safeSize, totalPages: Math.max(1, Math.ceil(total / safeSize)) };
}

/**
 * 按 slug 取已发布文章（含正文）
 */
async function getPublishedBySlug(slug) {
  const [rows] = await pool.query(
    "SELECT * FROM posts WHERE slug = ? AND status = 'published' LIMIT 1",
    [slug]
  );
  return rows[0] || null;
}

/**
 * 按 id 取单篇
 */
async function getById(id) {
  const [rows] = await pool.query("SELECT * FROM posts WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

/**
 * 某作者的全部文章（含正文，仅本人可见）
 */
async function listByAuthor(author) {
  const [rows] = await pool.query(
    "SELECT * FROM posts WHERE author = ? ORDER BY created_at DESC, id DESC",
    [author]
  );
  return rows;
}

/**
 * 待审核队列（管理员）
 */
async function listPending() {
  const [rows] = await pool.query(
    "SELECT * FROM posts WHERE status = 'pending' ORDER BY created_at ASC, id ASC"
  );
  return rows;
}

/**
 * 审核结果落库
 */
async function review(id, { status, note, reviewedBy }) {
  await pool.execute(
    `UPDATE posts
     SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ?`,
    [status, String(note || "").slice(0, 500), reviewedBy, Date.now(), Date.now(), id]
  );
}

/**
 * 删除文章
 */
async function remove(id) {
  await pool.execute("DELETE FROM posts WHERE id = ?", [id]);
}

/**
 * 某用户最近一次发帖时间（频率限制）
 */
async function lastPostAt(author) {
  const [rows] = await pool.query(
    "SELECT created_at FROM posts WHERE author = ? ORDER BY created_at DESC LIMIT 1",
    [author]
  );
  return rows[0] ? Number(rows[0].created_at) : 0;
}

/**
 * 某用户从某时刻起的发帖数（每日配额）
 */
async function countSince(author, since) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS c FROM posts WHERE author = ? AND created_at >= ?",
    [author, since]
  );
  return Number(rows[0]?.c || 0);
}

/**
 * 状态统计（管理端展示）
 */
async function stats() {
  const [rows] = await pool.query("SELECT status, COUNT(*) AS c FROM posts GROUP BY status");
  const out = { published: 0, pending: 0, rejected: 0, total: 0 };
  for (const r of rows) {
    const n = Number(r.c);
    if (out[r.status] !== undefined) out[r.status] = n;
    out.total += n;
  }
  return out;
}

module.exports = {
  create,
  listPublished,
  getPublishedBySlug,
  getById,
  listByAuthor,
  listPending,
  review,
  remove,
  lastPostAt,
  countSince,
  stats
};
