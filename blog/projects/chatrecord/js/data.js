/* ChatRecord 数据层：示例数据生成 + 导入解析
 * 消息统一结构: { id, ts(毫秒时间戳), sender, text }
 */
const ChatData = (function () {
  'use strict';

  function randomInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function pick(arr) { return arr[randomInt(0, arr.length - 1)]; }

  /* ---------- 生成示例数据（7 天、多人、时段活跃差异） ---------- */
  function generateSampleData() {
    const msgs = [];
    const people = ['阿明', '小苏', '大伟', '浅浅', '老王'];
    const topics = [
      '今天项目上线顺利吗', '晚上吃什么', '这个 bug 终于修好了', '周末去爬山吗',
      '你看到新版本了吗', '加班太累了', '下午开会记得提前到', '这个设计稿我觉得可以',
      '服务器又报警了', '我这边数据拉通了', '下周排期出来了吗', '中午一起吃饭',
      '需求文档我发你了', '线上环境挂了！', '我刚提交了一版', '测试结果出来了'
    ];
    const tails = ['嗯嗯', '好的', '哈哈', '收到', '？', '！', '马上来', '可以啊', '再想想', 'okk'];
    const startDay = Date.now() - 7 * 24 * 3600 * 1000;
    let id = 1;

    for (let day = 0; day < 7; day++) {
      const dayStart = startDay + day * 24 * 3600 * 1000;
      const msgsPerDay = randomInt(40, 130);
      let t = dayStart + randomInt(7, 9) * 3600 * 1000 + randomInt(0, 3600 * 1000);
      for (let i = 0; i < msgsPerDay; i++) {
        // 每 5 条出现一次较长间隔（沉默期 3-25 分钟），其余密集（5-60 秒）
        const base = (i % 5 === 0)
          ? randomInt(3, 25) * 60 * 1000
          : randomInt(5, 60) * 1000;
        t += base;
        // 超过当天 23 点则跳转到次日清晨
        if (t > dayStart + 23 * 3600 * 1000) {
          t = dayStart + 24 * 3600 * 1000 + randomInt(7, 9) * 3600 * 1000 + randomInt(0, 600 * 1000);
        }
        const sender = pick(people);
        const text = pick(topics) + ' ' + pick(tails);
        msgs.push({ id: id++, ts: t, sender, text });
      }
    }
    msgs.sort((a, b) => a.ts - b.ts);
    return msgs;
  }

  /* ---------- 解析文本 ----------
   * 完整行: 2026-08-20 12:30:00 发送者: 内容   (24h)
   * 简写行(依赖上一个完整行的日期): 12:30 发送者: 内容
   */
  function parseText(text) {
    const msgs = [];
    const lines = String(text || '').split(/\r?\n/);
    let id = 1;
    let lastDate = null;
    const reFull = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?)\s+([^:：]+)[:：]\s*(.*)$/;
    const reShort = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+([^:：]+)[:：]\s*(.*)$/;

    function toTs(dateStr, timeStr) {
      const dp = dateStr.split('-').map(Number);
      const tp = timeStr.split(':').map(Number);
      return new Date(dp[0], dp[1] - 1, dp[2], tp[0] || 0, tp[1] || 0, tp[2] || 0).getTime();
    }

    for (const raw of lines) {
      const s = raw.trim();
      if (!s) continue;
      let m = s.match(reFull);
      if (m) {
        const ts = toTs(m[1], m[2]);
        if (!isNaN(ts)) {
          msgs.push({ id: id++, ts, sender: m[3].trim(), text: m[4].trim() });
          lastDate = m[1];
        }
        continue;
      }
      m = s.match(reShort);
      if (m && lastDate) {
        const ts = toTs(lastDate, m[1]);
        if (!isNaN(ts)) {
          msgs.push({ id: id++, ts, sender: m[2].trim(), text: m[3].trim() });
        }
      }
    }
    msgs.sort((a, b) => a.ts - b.ts);
    return msgs;
  }

  /* ---------- 解析 JSON 数组 ---------- */
  function parseJSON(json) {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) throw new Error('JSON 必须是数组');
    const msgs = [];
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i] || {};
      const raw = it.ts ?? it.time ?? it.timestamp ?? it.date;
      const ts = new Date(raw).getTime();
      if (isNaN(ts)) continue;
      msgs.push({
        id: i + 1,
        ts,
        sender: String(it.sender || it.from || it.user || it.name || '未知'),
        text: String(it.text || it.content || it.msg || '')
      });
    }
    msgs.sort((a, b) => a.ts - b.ts);
    return msgs;
  }

  return { generateSampleData, parseText, parseJSON };
})();

/* 兼容 node 环境做数据层单测 */
if (typeof module !== 'undefined' && module.exports) { module.exports = ChatData; }
