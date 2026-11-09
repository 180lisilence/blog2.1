/**
 * 友链（外部作品）业务逻辑
 * - 读取 links.json
 * - 字段校验 + URL 白名单（防 javascript: 注入）
 * - 按 order 排序，坏条目跳过不阻塞
 */
const fs = require("fs");
const path = require("path");
const config = require("../../config");
const logger = require("../../core/logger");

// 只允许指向本人的 GitHub 仓库与 GitHub Pages，杜绝 javascript:/data: 等协议注入
const REPO_RE = /^https:\/\/github\.com\/180lisilence\/[A-Za-z0-9._-]+\/?$/;
const DEMO_RE = /^https:\/\/([A-Za-z0-9-]+\.)?github\.io\/[A-Za-z0-9._~%\-/]*$/;
// 2.3 阶段的本地镜像路径，只允许站内绝对路径
const MIRROR_RE = /^\/blog\/projects\/[A-Za-z0-9_-]+\/[A-Za-z0-9._~%\-/]+$/;

const VALID_COLORS = config.projects.validColors;

// 校验单条友链，返回 { link, errors }
function validateLink(raw, index) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return { link: null, errors: [`第 ${index + 1} 条不是有效对象`] };
  }
  if (!raw.id || typeof raw.id !== "string") errors.push("缺少 id");
  if (!raw.name || typeof raw.name !== "string" || !raw.name.trim()) errors.push("缺少 name");
  if (!raw.repo || typeof raw.repo !== "string") {
    errors.push("缺少 repo");
  } else if (!REPO_RE.test(raw.repo)) {
    errors.push(`repo 不在白名单内: ${raw.repo}`);
  }
  if (raw.demo !== null && raw.demo !== undefined) {
    if (typeof raw.demo !== "string" || !DEMO_RE.test(raw.demo)) {
      errors.push(`demo 不在白名单内: ${raw.demo}`);
    }
  }
  if (raw.mirror !== null && raw.mirror !== undefined) {
    if (typeof raw.mirror !== "string" || !MIRROR_RE.test(raw.mirror)) {
      errors.push(`mirror 不是合法的站内路径: ${raw.mirror}`);
    }
  }
  if (raw.color && !VALID_COLORS.includes(raw.color)) {
    errors.push(`color 必须是 ${VALID_COLORS.join("/")} 之一`);
  }
  if (raw.tags !== undefined && !Array.isArray(raw.tags)) errors.push("tags 必须是数组");

  if (errors.length) return { link: null, errors };

  return {
    link: {
      id: raw.id.trim(),
      name: raw.name.trim(),
      desc: typeof raw.desc === "string" ? raw.desc.trim() : "",
      repo: raw.repo,
      demo: raw.demo || null,
      mirror: raw.mirror || null,
      icon: typeof raw.icon === "string" && raw.icon ? raw.icon : "🔗",
      color: raw.color || "c1",
      tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === "string").slice(0, 3) : [],
      stack: typeof raw.stack === "string" ? raw.stack : "",
      size: typeof raw.size === "string" ? raw.size : "",
      updated: typeof raw.updated === "string" ? raw.updated : "",
      order: Number.isFinite(raw.order) ? raw.order : 999
    },
    errors: []
  };
}

// 读取全部友链（跳过坏条目，按 order 升序）
function getLinks() {
  let raw;
  try {
    if (!fs.existsSync(config.linksFile)) {
      logger.warn("links-service", "links.json 不存在，返回空列表");
      return [];
    }
    raw = JSON.parse(fs.readFileSync(config.linksFile, "utf-8"));
  } catch (e) {
    logger.error("links-service", "读取 links.json 失败", e);
    return [];
  }
  if (!Array.isArray(raw)) {
    logger.error("links-service", "links.json 根节点不是数组");
    return [];
  }

  const links = [];
  raw.forEach((item, i) => {
    const { link, errors } = validateLink(item, i);
    if (link) {
      links.push(link);
    } else {
      logger.warn("links-service", `跳过第 ${i + 1} 条友链: ${errors.join("；")}`);
    }
  });
  return links.sort((a, b) => a.order - b.order);
}

module.exports = { getLinks, validateLink, REPO_RE, DEMO_RE, MIRROR_RE };
