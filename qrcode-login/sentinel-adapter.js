/**
 * blog-sentinel 审计适配器转发层
 *
 * 真正实现位于 ../blog-sentinel/integration/sentinel-adapter.js，
 * 这里只做一层薄转发，保证实现只有一份、便于升级。
 *
 * 在 server.js 中：
 *   const sentinel = require("./sentinel-adapter");
 *   sentinel.install(app, authSession, { key: process.env.INGEST_KEY, ... });
 */
module.exports = require("../blog-sentinel/integration/sentinel-adapter");
