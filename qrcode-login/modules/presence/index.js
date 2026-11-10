/**
 * 在线状态 / 提示开关（presence）
 *
 * 目标：后台「强制下线」后，用户端能感知并弹窗「你已下线」；
 *       后台「提示开关」能与用户端同步（开关状态由主站持有，两端读取同一份）。
 *
 * 设计要点：
 *  1. session 是唯一真源：userToken 是否还有效，永远看 authSession.webSessions。
 *     本模块不复制会话表，只记「被管理员显式踢下线」的 token 凭据，
 *     用于区分「用户主动登出 / 会话自然过期 / 管理员强制下线」。
 *  2. 被踢记录有时效（KICK_TTL_MS），过期自动回收，避免 Map 无限增长。
 *  3. 提示开关持久化到 data/presence-settings.json（原子写），重启后仍保留；
 *     文件在 qrcode-login/data/ 下，静态服务访问不到。
 *  4. 所有对外输出脱敏：不返回 token、不返回 salt/hash、不返回用户数据。
 *
 * 依赖注入便于无 MySQL / 无 fs 的单元测试。
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,        // 总开关：关闭后用户端不再轮询提示，后台也不再弹上线提示
  onlineNotice: true,   // 用户登录时后台是否弹「用户 XXX 已上线」
  offlineNotice: true,  // 用户被下线时用户端是否弹「你已下线」
  offlineMessage: "你已被管理员强制下线，请重新登录。",
  pollMs: 8000          // 用户端轮询间隔（3s~60s）
});

const KICK_TTL_MS = 10 * 60 * 1000;   // 被踢记录保留 10 分钟
const MAX_KICKED = 5000;

function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function createPresence(deps = {}) {
  const logger = deps.logger || require("../../core/logger");
  const session = deps.session || require("../auth/session");
  const dataDir = deps.dataDir || path.join(__dirname, "..", "..", "data");
  const settingsFile = deps.settingsFile || path.join(dataDir, "presence-settings.json");
  const clock = deps.clock || (() => Date.now());
  const kickTtlMs = clampInt(deps.kickTtlMs, 1000, 24 * 3600 * 1000, KICK_TTL_MS);

  // token（不透明字符串）-> { username, reason, at }
  // 只由「管理员强制下线」写入；主动登出 / 过期不写。
  const kicked = new Map();

  let settings = loadSettings();

  function normalize(raw) {
    const out = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== "object") return out;
    if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
    if (typeof raw.onlineNotice === "boolean") out.onlineNotice = raw.onlineNotice;
    if (typeof raw.offlineNotice === "boolean") out.offlineNotice = raw.offlineNotice;
    if (typeof raw.offlineMessage === "string") {
      const s = raw.offlineMessage.trim().slice(0, 120);
      if (s) out.offlineMessage = s;
    }
    out.pollMs = clampInt(raw.pollMs, 3000, 60000, DEFAULT_SETTINGS.pollMs);
    return out;
  }

  function loadSettings() {
    try {
      return normalize(JSON.parse(fs.readFileSync(settingsFile, "utf8")));
    } catch (e) {
      if (e && e.code !== "ENOENT") {
        logger.warn("presence", "提示开关读取失败，使用默认值", e.message);
      }
      return { ...DEFAULT_SETTINGS };
    }
  }

  function persistSettings() {
    try {
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      const tmp = settingsFile + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), "utf8");
      fs.renameSync(tmp, settingsFile);
    } catch (e) {
      logger.warn("presence", "提示开关写入失败（内存仍生效）", e.message);
    }
  }

  function getSettings() {
    return { ...settings };
  }

  /** 更新提示开关：只接受白名单字段，非法值忽略，不抛错给调用方 */
  function updateSettings(patch = {}) {
    const next = normalize({ ...settings, ...(patch && typeof patch === "object" ? patch : {}) });
    settings = next;
    persistSettings();
    logger.info("presence", `提示开关更新: enabled=${settings.enabled} online=${settings.onlineNotice} offline=${settings.offlineNotice} pollMs=${settings.pollMs}`);
    return { ...settings };
  }

  /**
   * 标记 token 为「被管理员下线」。由 members-admin 在删除会话前调用，
   * 这样即使 token 已从 webSessions 移除，用户端仍能凭它查到被踢事实。
   */
  function markKicked(token, username, reason = "kick") {
    const t = String(token || "");
    if (!t) return false;
    // 容量保护：先清过期，仍超限则淘汰最早的
    const now = clock();
    if (kicked.size >= MAX_KICKED) {
      for (const [k, v] of kicked) if (now - v.at > kickTtlMs) kicked.delete(k);
      while (kicked.size >= MAX_KICKED) {
        const oldest = kicked.keys().next().value;
        if (oldest === undefined) break;
        kicked.delete(oldest);
      }
    }
    kicked.set(t, {
      username: String(username || ""),
      reason: String(reason || "kick").slice(0, 32),
      at: now
    });
    return true;
  }

  /**
   * 用户端轮询：传当前请求携带的 webToken。
   * 返回 JSON 可序列化对象，不含任何 token / 凭据 / 隐私数据。
   *
   * status 取值：
   *   - "off"       总开关关闭，前端应停止轮询
   *   - "anonymous" 匿名（无 token），无需提示
   *   - "online"    会话有效
   *   - "kicked"    被管理员强制下线 —— 前端据此弹窗
   *   - "expired"   会话过期 / 主动登出 / 被改密或删除（无踢标记）—— 前端静默跳登录
   */
  function state(token) {
    const base = { status: "off", pollMs: settings.pollMs, serverTs: clock() };
    if (!settings.enabled) return base;

    const t = String(token || "");
    if (!t) return { ...base, status: "anonymous" };

    const k = kicked.get(t);
    const now = clock();
    if (k && now - k.at <= kickTtlMs) {
      return {
        ...base,
        status: "kicked",
        reason: k.reason,
        message: settings.offlineNotice ? settings.offlineMessage : "",
        showDialog: Boolean(settings.offlineNotice),
        at: k.at
      };
    }
    if (k) kicked.delete(t); // 过期记录回收

    const s = session.getWebSession(t);
    if (s && Number(s.expireAt) > now) {
      return { ...base, status: "online" };
    }
    return { ...base, status: "expired" };
  }

  /**
   * 后台「某某已上线」提示的开关读取。
   * 后台实时流收到 login 事件后，按此开关决定是否弹提示。
   */
  function shouldNotifyOnline() {
    return Boolean(settings.enabled && settings.onlineNotice);
  }

  function shouldNotifyOffline() {
    return Boolean(settings.enabled && settings.offlineNotice);
  }

  function startCleanup() {
    const timer = setInterval(() => {
      const now = clock();
      let n = 0;
      for (const [k, v] of kicked) {
        if (now - v.at > kickTtlMs) { kicked.delete(k); n++; }
      }
      if (n) logger.debug("presence", `回收过期下线标记 ${n} 条`);
    }, 60 * 1000);
    timer.unref?.();
    return { stop: () => clearInterval(timer) };
  }

  function status() {
    return {
      settingsFile,
      kickedRecords: kicked.size,
      kickTtlMs,
      ...getSettings()
    };
  }

  return {
    getSettings,
    updateSettings,
    markKicked,
    state,
    shouldNotifyOnline,
    shouldNotifyOffline,
    startCleanup,
    status
  };
}

let singleton = null;
function getPresence(deps = {}) {
  if (!singleton) singleton = createPresence(deps);
  return singleton;
}
function resetPresenceForTest() {
  singleton = null;
}

module.exports = {
  createPresence,
  getPresence,
  resetPresenceForTest,
  DEFAULT_SETTINGS,
  KICK_TTL_MS
};
