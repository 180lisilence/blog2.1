/* ChatRecord 图表层：ECharts 封装 */
const Charts = (function () {
  'use strict';
  const instances = {};

  function get(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (!instances[id]) instances[id] = echarts.init(el);
    return instances[id];
  }

  const BASE = {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b93a7' }
  };

  /* 会话时序波形：x=消息序号，y=与上一条的间隔秒数 */
  function wave(containerId, msgs) {
    const chart = get(containerId);
    if (!chart) return;
    const xs = [];
    const ys = [];
    for (let i = 0; i < msgs.length; i++) {
      xs.push(i + 1);
      let gap = 0;
      if (i > 0) {
        gap = Math.round((msgs[i].ts - msgs[i - 1].ts) / 1000);
        if (gap <= 0) gap = 1;
        if (gap > 3600) gap = 3600; // 截断 1 小时
      }
      ys.push(gap);
    }
    chart.setOption(Object.assign({}, BASE, {
      grid: { left: 56, right: 20, top: 30, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        formatter: (p) => {
          const i = p[0].dataIndex;
          const m = msgs[i];
          return `#${i + 1} ${new Date(m.ts).toLocaleString('zh-CN', { hour12: false })}<br>${m.sender}: ${m.text.length > 24 ? m.text.slice(0, 24) + '…' : m.text}<br>间隔 ${p[0].value}s`;
        }
      },
      xAxis: {
        type: 'category', data: xs, name: '消息序号',
        axisLine: { lineStyle: { color: '#262e3d' } },
        axisLabel: { color: '#8b93a7', fontSize: 10 }
      },
      yAxis: {
        type: 'value', name: '间隔(秒)',
        splitLine: { lineStyle: { color: '#1c2330' } },
        axisLabel: { color: '#8b93a7' }
      },
      series: [{
        type: 'line', data: ys, showSymbol: false, smooth: true,
        lineStyle: { width: 2, color: '#4f8cff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(79,140,255,.35)' },
            { offset: 1, color: 'rgba(79,140,255,0)' }
          ])
        }
      }]
    }));
  }

  /* 消息量分布：按小时（0-23） */
  function hour(containerId, msgs) {
    const chart = get(containerId);
    if (!chart) return;
    const bucket = new Array(24).fill(0);
    msgs.forEach(m => {
      const h = new Date(m.ts).getHours();
      bucket[h]++;
    });
    chart.setOption(Object.assign({}, BASE, {
      grid: { left: 46, right: 16, top: 30, bottom: 40 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => (i < 10 ? '0' : '') + i + '时'),
        axisLine: { lineStyle: { color: '#262e3d' } },
        axisLabel: { color: '#8b93a7', fontSize: 10, interval: 1 }
      },
      yAxis: {
        type: 'value', name: '消息数',
        splitLine: { lineStyle: { color: '#1c2330' } },
        axisLabel: { color: '#8b93a7' }
      },
      series: [{
        type: 'bar', data: bucket, barWidth: '60%',
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#22d3a5' },
            { offset: 1, color: 'rgba(34,211,165,.15)' }
          ])
        }
      }]
    }));
  }

  /* 平均长度：按天折线 */
  function lengthByDay(containerId, msgs) {
    const chart = get(containerId);
    if (!chart) return;
    const map = new Map(); // dayKey -> {sum, n}
    msgs.forEach(m => {
      const d = new Date(m.ts);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (!map.has(key)) map.set(key, { sum: 0, n: 0 });
      const rec = map.get(key);
      rec.sum += (m.text || '').length;
      rec.n++;
    });
    const days = [...map.keys()].sort();
    const data = days.map(k => {
      const r = map.get(k);
      return +(r.sum / r.n).toFixed(1);
    });
    chart.setOption(Object.assign({}, BASE, {
      grid: { left: 46, right: 16, top: 30, bottom: 40 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category', data: days.map(d => d.slice(5)),
        axisLine: { lineStyle: { color: '#262e3d' } },
        axisLabel: { color: '#8b93a7', fontSize: 10 }
      },
      yAxis: {
        type: 'value', name: '字符/条',
        splitLine: { lineStyle: { color: '#1c2330' } },
        axisLabel: { color: '#8b93a7' }
      },
      series: [{
        type: 'line', data, smooth: true, showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2, color: '#7c5cff' },
        itemStyle: { color: '#7c5cff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(124,92,255,.3)' },
            { offset: 1, color: 'rgba(124,92,255,0)' }
          ])
        }
      }]
    }));
  }

  /* 消息量日历热力图（GitHub 贡献风格）：x=日期，y=消息量 */
  function heatCalendar(containerId, msgs) {
    const chart = get(containerId);
    if (!chart) return;
    const map = new Map();
    msgs.forEach(m => {
      const d = new Date(m.ts);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      map.set(key, (map.get(key) || 0) + 1);
    });
    const keys = [...map.keys()].sort();
    if (!keys.length) return;
    const start = keys[0];
    const end = keys[keys.length - 1];
    const data = keys.map(k => [k, map.get(k)]);
    const max = Math.max(...data.map(d => d[1]), 1);
    // 天数多时缩小格子，保证日历不超宽
    const span = (new Date(end) - new Date(start)) / 86400000 + 1;
    const cell = span > 60 ? 12 : (span > 30 ? 14 : 16);
    chart.setOption(Object.assign({}, BASE, {
      tooltip: { formatter: p => `${p.value[0]}<br>${p.value[1]} 条消息` },
      visualMap: {
        min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
        inRange: { color: ['#121a28', '#1f5fbf', '#4f8cff', '#22d3a5'] },
        textStyle: { color: '#8b93a7' }, show: true, itemHeight: 80
      },
      calendar: {
        top: 40, left: 30, right: 20, bottom: 60, cellSize: [cell, cell],
        range: [start, end],
        splitLine: { lineStyle: { color: '#1c2330' } },
        itemStyle: { color: '#121a28', borderWidth: 1, borderColor: '#1c2330' },
        yearLabel: { show: true, color: '#8b93a7', fontWeight: 600 },
        monthLabel: { color: '#8b93a7' },
        dayLabel: { color: '#8b93a7', firstDay: 1 }
      },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }]
    }));
  }

  /* 发送者消息量排行（横向条形） */
  function senderBar(containerId, msgs) {
    const chart = get(containerId);
    if (!chart) return;
    const map = new Map();
    msgs.forEach(m => map.set(m.sender, (map.get(m.sender) || 0) + 1));
    const arr = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const max = arr.length ? arr[0][1] : 1;
    chart.setOption(Object.assign({}, BASE, {
      grid: { left: 60, right: 40, top: 16, bottom: 30 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}<br>${p[0].value} 条` },
      xAxis: {
        type: 'value', max: Math.ceil(max * 1.15),
        splitLine: { lineStyle: { color: '#1c2330' } }, axisLabel: { color: '#8b93a7' }
      },
      yAxis: {
        type: 'category', data: arr.map(a => a[0]),
        axisLine: { lineStyle: { color: '#262e3d' } }, axisLabel: { color: '#c7cede' }
      },
      series: [{
        type: 'bar', data: arr.map(a => a[1]), barWidth: '55%',
        label: { show: true, position: 'right', color: '#8b93a7', fontSize: 11 },
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#f59e0b' }, { offset: 1, color: 'rgba(245,158,11,.25)' }
          ])
        }
      }]
    }));
  }

  /* 复读指数排行榜：重复文本（出现过 >=2 次）占其消息的比例 */
  function repeatRank(containerId, msgs) {
    const chart = get(containerId);
    if (!chart) return;
    const textCount = new Map();
    msgs.forEach(m => textCount.set(m.text, (textCount.get(m.text) || 0) + 1));
    const per = new Map();
    msgs.forEach(m => {
      if (!per.has(m.sender)) per.set(m.sender, { total: 0, repeat: 0 });
      const r = per.get(m.sender);
      r.total++;
      if (textCount.get(m.text) >= 2) r.repeat++;
    });
    const arr = [...per.entries()]
      .map(([name, r]) => ({ name, total: r.total, repeat: r.repeat, rate: r.total ? r.repeat / r.total : 0 }))
      .filter(x => x.repeat > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);
    if (!arr.length) {
      chart.clear();
      chart.setOption(Object.assign({}, BASE, {
        title: { text: '无重复消息', textStyle: { color: '#8b93a7', fontSize: 13, fontWeight: 'normal' }, left: 'center', top: 'middle' }
      }));
      return;
    }
    chart.setOption(Object.assign({}, BASE, {
      grid: { left: 60, right: 50, top: 16, bottom: 30 },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: p => `${p[0].name}<br>复读 ${p[0].value}% · ${arr[p[0].dataIndex].repeat}/${arr[p[0].dataIndex].total} 条`
      },
      xAxis: {
        type: 'value', max: 100, axisLabel: { color: '#8b93a7', formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#1c2330' } }
      },
      yAxis: {
        type: 'category', data: arr.map(a => a.name), inverse: true,
        axisLine: { lineStyle: { color: '#262e3d' } }, axisLabel: { color: '#c7cede' }
      },
      series: [{
        type: 'bar', data: arr.map(a => +(a.rate * 100).toFixed(1)), barWidth: '55%',
        label: { show: true, position: 'right', color: '#8b93a7', fontSize: 11, formatter: '{c}%' },
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#7c5cff' }, { offset: 1, color: 'rgba(124,92,255,.25)' }
          ])
        }
      }]
    }));
  }

  /* 周 × 小时活跃热力图 */
  function weekHourHeat(containerId, msgs) {
    const chart = get(containerId);
    if (!chart) return;
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
    msgs.forEach(m => {
      const d = new Date(m.ts);
      matrix[d.getDay()][d.getHours()]++;
    });
    const data = [];
    matrix.forEach((row, dow) => row.forEach((v, h) => { if (v) data.push([h, dow, v]); }));
    const max = Math.max(...data.map(d => d[2]), 1);
    chart.setOption(Object.assign({}, BASE, {
      tooltip: { formatter: p => `${days[p.value[1]]} ${p.value[0]}时<br>${p.value[2]} 条` },
      grid: { left: 46, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'category', data: Array.from({ length: 24 }, (_, i) => i + '时'),
        splitArea: { show: true, areaStyle: { color: ['rgba(255,255,255,.01)', 'rgba(255,255,255,.02)'] } },
        axisLabel: { color: '#8b93a7', fontSize: 10 }, axisLine: { lineStyle: { color: '#262e3d' } }
      },
      yAxis: {
        type: 'category', data: days, splitArea: { show: true },
        axisLabel: { color: '#c7cede' }, axisLine: { lineStyle: { color: '#262e3d' } }
      },
      visualMap: {
        min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
        inRange: { color: ['#121a28', '#1f5fbf', '#4f8cff', '#22d3a5'] },
        textStyle: { color: '#8b93a7' }, show: true, itemHeight: 80
      },
      series: [{ type: 'heatmap', data }]
    }));
  }

  return { wave, hour, lengthByDay, heatCalendar, senderBar, repeatRank, weekHourHeat };
})();
