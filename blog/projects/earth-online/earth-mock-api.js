/* earth-mock-api.js - EarthOrbit 纯前端 Mock API 层
 * 用 localStorage 模拟所有后端接口，使游戏可在静态环境运行
 */
(function() {
  'use strict';

  // ========== 数据存储工具（接入博客后端，按登录账号隔离持久化到 MySQL） ==========
  // 优先使用全站存储层 BS；若 BS 未加载则回退 localStorage，保证游戏仍可运行
  var store = (typeof BS !== 'undefined' && BS) ? BS : {
    get: function(k) { try { return JSON.parse(localStorage.getItem(k)) || null; } catch(e) { return null; } },
    set: function(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} },
    remove: function(k) { try { localStorage.removeItem(k); } catch(e) {} }
  };
  function DB(key, def) {
    var ck = 'eo:' + key;
    return {
      get: function() {
        var v = null;
        try { v = store.get(ck); } catch(e) { v = null; }
        if (v === null || v === undefined) {
          // 首次访问：从旧 localStorage 迁移一次
          try {
            var old = localStorage.getItem('eo_' + key);
            if (old) { v = JSON.parse(old); store.set(ck, v); }
          } catch(e) {}
        }
        if (v === null || v === undefined) v = def;
        return v;
      },
      set: function(v) { store.set(ck, v); },
      update: function(fn) { var v = this.get(); v = fn(v) || v; this.set(v); return v; }
    };
  }

  var usersDB = DB('users', []);
  var charactersDB = DB('characters', {});
  var chatDB = DB('chat', []);
  var friendsDB = DB('friends', {});
  var friendReqDB = DB('friendRequests', []);
  var inventoryDB = DB('inventory', {});
  var jobsDB = DB('jobs', {});
  var mapDB = DB('map', {});
  var marriageDB = DB('marriage', {});
  var npcRelDB = DB('npcRelations', {});
  var statusDB = DB('status', {});
  var walletDB = DB('wallet', {});
  var achievementDB = DB('achievements', {});

  // 当前用户
  var currentUser = null;

  // ========== 通用响应 ==========
  function ok(data) { return Promise.resolve({ code: 200, data: data, msg: 'success' }); }
  function fail(msg, code) { return Promise.resolve({ code: code || 400, data: null, msg: msg }); }

  // ========== 模拟数据 ==========
  var JOB_LIST = [
    { id: 'student', name: '学生', icon: '📚', coreAttr: 'intelligence', dailyIncome: 0, desc: '学习提升等级，毕业转职' },
    { id: 'worker', name: '打工人', icon: '💼', coreAttr: 'strength', dailyIncome: [100, 300], desc: '加班可加倍收入但消耗体力' },
    { id: 'boss', name: '老板', icon: '🏢', coreAttr: 'charm', dailyIncome: [500, 2000], desc: '投资理财，雇员管理' },
    { id: 'doctor', name: '医生', icon: '⚕️', coreAttr: 'intelligence', dailyIncome: [300, 800], desc: '自制药品，治疗他人' },
    { id: 'chef', name: '厨师', icon: '🍳', coreAttr: 'perception', dailyIncome: [200, 600], desc: '制作高级食物' },
    { id: 'engineer', name: '工程师', icon: '🔧', coreAttr: 'intelligence', dailyIncome: [300, 1000], desc: '制造装备道具' }
  ];

  var NPC_LIST = [
    { npcId: 'npc_lin', id: 'npc_lin', name: '林小雨', gender: 'female', age: 22, job: '学生', personality: '温柔善良', avatar: '👩', description: '温柔善良的大学生，喜欢阅读和音乐' },
    { npcId: 'npc_zhang', id: 'npc_zhang', name: '张大力', gender: 'male', age: 25, job: '打工人', personality: '豪爽直率', avatar: '👨', description: '豪爽直率的打工人，喜欢运动和聚会' },
    { npcId: 'npc_wang', id: 'npc_wang', name: '王医生', gender: 'male', age: 35, job: '医生', personality: '严谨负责', avatar: '👨‍⚕️', description: '严谨负责的医生，医术精湛' },
    { npcId: 'npc_li', id: 'npc_li', name: '李厨师', gender: 'female', age: 28, job: '厨师', personality: '热情开朗', avatar: '👩‍🍳', description: '热情开朗的厨师，做得一手好菜' },
    { npcId: 'npc_chen', id: 'npc_chen', name: '陈老板', gender: 'male', age: 40, job: '老板', personality: '精明干练', avatar: '🧑‍💼', description: '精明干练的商人，事业有成' },
    { npcId: 'npc_zhao', id: 'npc_zhao', name: '赵工', gender: 'male', age: 30, job: '工程师', personality: '沉默寡言', avatar: '👨‍🔧', description: '沉默寡言的工程师，技术大牛' }
  ];

  var SHOP_ITEMS = [
    { id: 'food_bread', name: '面包', category: '食物', price: 10, effect: { hunger: 20 }, icon: '🍞' },
    { id: 'food_rice', name: '米饭', category: '食物', price: 15, effect: { hunger: 30 }, icon: '🍚' },
    { id: 'food_meal', name: '大餐', category: '食物', price: 50, effect: { hunger: 80, health: 10 }, icon: '🍱' },
    { id: 'med_cold', name: '感冒药', category: '药品', price: 30, effect: { cure: 'cold' }, icon: '💊' },
    { id: 'med_pain', name: '止痛药', category: '药品', price: 25, effect: { cure: 'pain' }, icon: '💉' },
    { id: 'med_vitamin', name: '维生素', category: '药品', price: 40, effect: { health: 30 }, icon: '🧪' },
    { id: 'tool_lucky', name: '幸运符', category: '道具', price: 100, effect: { buff: 'luck', duration: 3600 }, icon: '🍀' },
    { id: 'tool_xp', name: '经验加成卡', category: '道具', price: 200, effect: { buff: 'xp', duration: 3600 }, icon: '⭐' },
    { id: 'tool_ticket', name: '传送券', category: '道具', price: 150, effect: { teleport: true }, icon: '🎫' },
    { id: 'equip_shirt', name: '休闲T恤', category: '装备', price: 80, effect: { charm: 5 }, icon: '👕' },
    { id: 'equip_watch', name: '手表', category: '装备', price: 300, effect: { charm: 15 }, icon: '⌚' },
    { id: 'equip_tool', name: '工具箱', category: '装备', price: 250, effect: { strength: 10 }, icon: '🧰' }
  ];

  var DISEASE_LIST = [
    { id: 'cold', name: '感冒', severity: '轻度', effect: { stamina: -10 }, curePrice: 30 },
    { id: 'pain', name: '头痛', severity: '轻度', effect: { intelligence: -5 }, curePrice: 25 },
    { id: 'fever', name: '发烧', severity: '中度', effect: { stamina: -20, health: -10 }, curePrice: 50 },
    { id: 'stomach', name: '胃病', severity: '中度', effect: { hunger: -20 }, curePrice: 60 }
  ];

  var CITY_LOCATIONS = {
    '北京': [
      { id: 'forbidden_city', name: '故宫', type: '景点', desc: '明清两代皇家宫殿', danger: 0 },
      { id: 'great_wall', name: '长城', type: '景点', desc: '万里长城，雄伟壮观', danger: 5 },
      { id: 'hospital', name: '协和医院', type: '医院', desc: '顶级综合医院', danger: 0 },
      { id: 'park', name: '朝阳公园', type: '公园', desc: '休闲散步好去处', danger: 0 },
      { id: 'mall', name: '王府井', type: '商圈', desc: '购物美食一条街', danger: 0 }
    ],
    '上海': [
      { id: 'bund', name: '外滩', type: '景点', desc: '万国建筑博览群', danger: 0 },
      { id: 'disney', name: '迪士尼', type: '娱乐', desc: '梦幻乐园', danger: 0 },
      { id: 'hospital', name: '瑞金医院', type: '医院', desc: '知名医院', danger: 0 },
      { id: 'mall', name: '南京路', type: '商圈', desc: '繁华商业街', danger: 0 }
    ],
    '广州': [
      { id: 'tower', name: '广州塔', type: '景点', desc: '小蛮腰，城市地标', danger: 0 },
      { id: 'oldtown', name: '永庆坊', type: '景点', desc: '西关风情', danger: 0 },
      { id: 'hospital', name: '中山一院', type: '医院', desc: '华南名院', danger: 0 },
      { id: 'mall', name: '天河城', type: '商圈', desc: '购物中心', danger: 0 }
    ],
    '成都': [
      { id: 'panda', name: '熊猫基地', type: '景点', desc: '国宝大熊猫', danger: 0 },
      { id: 'jinli', name: '锦里古街', type: '景点', desc: '三国文化街区', danger: 0 },
      { id: 'hospital', name: '华西医院', type: '医院', desc: '全国顶级医院', danger: 0 },
      { id: 'park', name: '人民公园', type: '公园', desc: '喝茶聊天', danger: 0 }
    ],
    '杭州': [
      { id: 'westlake', name: '西湖', type: '景点', desc: '人间天堂', danger: 0 },
      { id: 'lingyin', name: '灵隐寺', type: '景点', desc: '千年古刹', danger: 0 },
      { id: 'hospital', name: '浙一医院', type: '医院', desc: '浙江名院', danger: 0 },
      { id: 'mall', name: '湖滨银泰', type: '商圈', desc: '湖畔商圈', danger: 0 }
    ],
    '西安': [
      { id: 'terracotta', name: '兵马俑', type: '景点', desc: '世界第八大奇迹', danger: 0 },
      { id: 'wall', name: '古城墙', type: '景点', desc: '明代城墙', danger: 0 },
      { id: 'hospital', name: '西京医院', type: '医院', desc: '西北名院', danger: 0 },
      { id: 'mall', name: '大唐不夜城', type: '商圈', desc: '盛唐风情', danger: 0 }
    ]
  };

  var ACHIEVEMENT_LIST = [
    { id: 'first_login', name: '初来乍到', desc: '首次登录游戏', reward: 100, icon: '🎉' },
    { id: 'first_job', name: '职场新人', desc: '选择第一份职业', reward: 200, icon: '💼' },
    { id: 'first_work', name: '勤劳致富', desc: '完成第一次工作', reward: 50, icon: '💰' },
    { id: 'rich_1000', name: '小有积蓄', desc: '钱包达到1000金币', reward: 200, icon: '🏦' },
    { id: 'rich_10000', name: '万元户', desc: '钱包达到10000金币', reward: 1000, icon: '💎' },
    { id: 'friend_1', name: '初交朋友', desc: '添加第一个好友', reward: 100, icon: '🤝' },
    { id: 'friend_5', name: '社交达人', desc: '添加5个好友', reward: 300, icon: '👥' },
    { id: 'marry', name: '成家立业', desc: '结婚', reward: 500, icon: '💒' },
    { id: 'child', name: '为人父母', desc: '生育第一个孩子', reward: 500, icon: '👶' },
    { id: 'explore_10', name: '探索者', desc: '探索10个地点', reward: 300, icon: '🗺️' },
    { id: 'buy_10', name: '消费者', desc: '购买10件商品', reward: 200, icon: '🛒' },
    { id: 'level_10', name: '小有成就', desc: '角色等级达到10级', reward: 500, icon: '⭐' }
  ];

  var CHAT_BOT_MESSAGES = [
    '欢迎来到 EarthOrbit！',
    '今天天气真好，适合出去探索~',
    '有人一起组队吗？',
    '新商店上架了一批好东西！',
    '祝大家游戏愉快！',
    '有人知道怎么快速赚钱吗？',
    '这个游戏的职业系统做得不错',
    '我刚刚结婚了，好开心！'
  ];

  // ========== 路由处理 ==========
  function getCurrentUserId() {
    return currentUser ? currentUser.id : null;
  }

  function getCurrentChar() {
    var uid = getCurrentUserId();
    if (!uid) return null;
    var chars = charactersDB.get();
    return chars[uid] || null;
  }

  function saveCharacter(char) {
    var uid = getCurrentUserId();
    if (!uid) return;
    var chars = charactersDB.get();
    chars[uid] = char;
    charactersDB.set(chars);
  }

  function getWallet() {
    var uid = getCurrentUserId();
    if (!uid) return { gold: 0, bank: 0 };
    var wallets = walletDB.get();
    if (!wallets[uid]) { wallets[uid] = { gold: 500, bank: 0 }; walletDB.set(wallets); }
    return wallets[uid];
  }

  function saveWallet(w) {
    var uid = getCurrentUserId();
    if (!uid) return;
    var wallets = walletDB.get();
    wallets[uid] = w;
    walletDB.set(wallets);
  }

  function getStatus() {
    var uid = getCurrentUserId();
    if (!uid) return null;
    var statuses = statusDB.get();
    if (!statuses[uid]) {
      statuses[uid] = {
        health: 100, hunger: 100, stamina: 100, mood: 80,
        diseases: [], effects: []
      };
      statusDB.set(statuses);
    }
    return statuses[uid];
  }

  function saveStatus(s) {
    var uid = getCurrentUserId();
    if (!uid) return;
    var statuses = statusDB.get();
    statuses[uid] = s;
    statusDB.set(statuses);
  }

  function checkAchievement(id) {
    var uid = getCurrentUserId();
    if (!uid) return;
    var ach = achievementDB.get();
    if (!ach[uid]) ach[uid] = { unlocked: [], claimed: [] };
    if (ach[uid].unlocked.indexOf(id) === -1) {
      ach[uid].unlocked.push(id);
      achievementDB.set(ach);
    }
  }

  // ========== API 路由 ==========
  var routes = {
    // 认证
    'POST /api/auth/register': function(body) {
      var users = usersDB.get();
      if (users.find(function(u) { return u.username === body.username; })) {
        return fail('用户名已存在');
      }
      var user = { id: 'u_' + Date.now(), username: body.username, password: body.password, createdAt: Date.now() };
      users.push(user);
      usersDB.set(users);
      return ok({ token: 'mock_token_' + user.id, userId: user.id, username: user.username });
    },
    'POST /api/auth/login': function(body) {
      var users = usersDB.get();
      var user = users.find(function(u) { return u.username === body.username && u.password === body.password; });
      if (!user) return fail('用户名或密码错误');
      currentUser = user;
      return ok({ token: 'mock_token_' + user.id, userId: user.id, username: user.username });
    },

    // 角色
    'POST /api/character/create': function(body) {
      var uid = getCurrentUserId();
      if (!uid) return fail('未登录');
      var char = {
        userId: uid,
        name: body.name,
        gender: body.gender,
        birthplace: body.birthplace,
        talent: body.talent,
        attributes: body.attributes || { strength: 5, intelligence: 5, agility: 5, charm: 5, perception: 5, endurance: 5 },
        level: 1, exp: 0,
        job: null,
        createdAt: Date.now()
      };
      saveCharacter(char);
      // 初始化钱包和状态
      var wallets = walletDB.get(); wallets[uid] = { gold: 500, bank: 0 }; walletDB.set(wallets);
      var statuses = statusDB.get(); statuses[uid] = { health: 100, hunger: 100, stamina: 100, mood: 80, diseases: [], effects: [] }; statusDB.set(statuses);
      var maps = mapDB.get(); maps[uid] = { city: body.birthplace || '北京', location: null }; mapDB.set(maps);
      checkAchievement('first_login');
      return ok(char);
    },
    'GET /api/character/info': function() {
      var char = getCurrentChar();
      if (!char) return ok(null);
      return ok(char);
    },

    // 聊天
    'GET /api/chat/history': function() {
      var chat = chatDB.get().slice(-50);
      return ok(chat);
    },

    // 好友
    'GET /api/friend/list': function() {
      var uid = getCurrentUserId();
      var friends = friendsDB.get();
      return ok(friends[uid] || []);
    },
    'GET /api/friend/requests': function() {
      var uid = getCurrentUserId();
      var reqs = friendReqDB.get().filter(function(r) { return r.to === uid && r.status === 'pending'; });
      return ok(reqs);
    },
    'POST /api/friend/request': function(body) {
      var uid = getCurrentUserId();
      var req = { id: 'fr_' + Date.now(), from: uid, fromName: currentUser.username, to: body.userId, status: 'pending', createdAt: Date.now() };
      var reqs = friendReqDB.get(); reqs.push(req); friendReqDB.set(reqs);
      return ok(req);
    },
    'POST /api/friend/accept/': function(body, path) {
      var uid = getCurrentUserId();
      var reqId = path.split('/').pop();
      var reqs = friendReqDB.get();
      var req = reqs.find(function(r) { return r.id === reqId; });
      if (req) {
        req.status = 'accepted';
        friendReqDB.set(reqs);
        var friends = friendsDB.get();
        if (!friends[uid]) friends[uid] = [];
        friends[uid].push({ id: req.from, name: req.fromName });
        if (!friends[req.from]) friends[req.from] = [];
        friends[req.from].push({ id: uid, name: currentUser.username });
        friendsDB.set(friends);
        checkAchievement('friend_1');
        if ((friends[uid] || []).length >= 5) checkAchievement('friend_5');
      }
      return ok({ success: true });
    },
    'POST /api/friend/reject/': function(body, path) {
      var reqId = path.split('/').pop();
      var reqs = friendReqDB.get();
      var req = reqs.find(function(r) { return r.id === reqId; });
      if (req) { req.status = 'rejected'; friendReqDB.set(reqs); }
      return ok({ success: true });
    },

    // 背包
    'POST /api/inventory/save': function(body) {
      var uid = getCurrentUserId();
      var inv = inventoryDB.get();
      inv[uid] = body.items || [];
      inventoryDB.set(inv);
      return ok({ success: true });
    },

    // 职业
    'GET /api/job/list': function() { return ok(JOB_LIST); },
    'POST /api/job/select': function(body) {
      var char = getCurrentChar();
      if (!char) return fail('无角色');
      char.job = body.jobId;
      char.jobLevel = 1;
      char.jobExp = 0;
      saveCharacter(char);
      var jobs = jobsDB.get(); jobs[char.userId] = { jobId: body.jobId, level: 1, exp: 0, totalWork: 0 }; jobsDB.set(jobs);
      checkAchievement('first_job');
      return ok({ success: true });
    },
    'GET /api/job/info': function() {
      var uid = getCurrentUserId();
      var jobs = jobsDB.get();
      return ok(jobs[uid] || null);
    },
    'POST /api/job/work': function() {
      var char = getCurrentChar();
      if (!char || !char.job) return fail('未选择职业');
      var status = getStatus();
      if (status.stamina < 20) return fail('体力不足，请休息');
      var job = JOB_LIST.find(function(j) { return j.id === char.job; });
      var income = job.dailyIncome ? (Array.isArray(job.dailyIncome) ? Math.floor(Math.random() * (job.dailyIncome[1] - job.dailyIncome[0]) + job.dailyIncome[0]) : job.dailyIncome) : 100;
      var wallet = getWallet(); wallet.gold += income; saveWallet(wallet);
      status.stamina = Math.max(0, status.stamina - 20);
      status.hunger = Math.max(0, status.hunger - 10);
      saveStatus(status);
      var jobs = jobsDB.get();
      if (!jobs[char.userId]) jobs[char.userId] = { jobId: char.job, level: 1, exp: 0, totalWork: 0 };
      jobs[char.userId].exp += 50;
      jobs[char.userId].totalWork++;
      if (jobs[char.userId].exp >= jobs[char.userId].level * 200) {
        jobs[char.userId].exp = 0;
        jobs[char.userId].level++;
        char.jobLevel = jobs[char.userId].level;
        saveCharacter(char);
      }
      jobsDB.set(jobs);
      checkAchievement('first_work');
      if (wallet.gold >= 1000) checkAchievement('rich_1000');
      if (wallet.gold >= 10000) checkAchievement('rich_10000');
      return ok({ income: income, stamina: status.stamina, gold: wallet.gold });
    },
    'POST /api/job/upgrade': function() {
      var char = getCurrentChar();
      if (!char) return fail('无角色');
      var jobs = jobsDB.get();
      if (!jobs[char.userId]) return fail('未选择职业');
      var cost = jobs[char.userId].level * 200;
      var wallet = getWallet();
      if (wallet.gold < cost) return fail('金币不足，需要 ' + cost);
      wallet.gold -= cost; saveWallet(wallet);
      jobs[char.userId].level++;
      char.jobLevel = jobs[char.userId].level;
      saveCharacter(char);
      jobsDB.set(jobs);
      return ok({ level: jobs[char.userId].level, gold: wallet.gold });
    },

    // 地图
    'GET /api/map/city': function() {
      var uid = getCurrentUserId();
      var maps = mapDB.get();
      var city = maps[uid] ? maps[uid].city : '北京';
      return ok({ city: city, locations: CITY_LOCATIONS[city] || [] });
    },
    'GET /api/map/locations': function(query) {
      var city = query.cityName || '北京';
      return ok(CITY_LOCATIONS[city] || []);
    },
    'POST /api/map/explore': function(body) {
      var status = getStatus();
      if (status.stamina < 10) return fail('体力不足');
      status.stamina = Math.max(0, status.stamina - 10);
      status.hunger = Math.max(0, status.hunger - 5);
      // 随机事件
      var events = [
        { type: 'treasure', msg: '你发现了一个宝箱！获得 50 金币', gold: 50 },
        { type: 'nothing', msg: '你四处探索，什么也没发现', gold: 0 },
        { type: 'meet', msg: '你遇到了一个有趣的人，心情提升了', mood: 10 },
        { type: 'item', msg: '你捡到了一个面包！', item: 'food_bread' },
        { type: 'danger', msg: '你不小心受伤了，健康值下降', health: -10 }
      ];
      var event = events[Math.floor(Math.random() * events.length)];
      if (event.gold) { var w = getWallet(); w.gold += event.gold; saveWallet(w); }
      if (event.mood) status.mood = Math.min(100, status.mood + event.mood);
      if (event.health) status.health = Math.max(0, status.health + event.health);
      if (event.item) {
        var inv = inventoryDB.get();
        var uid = getCurrentUserId();
        if (!inv[uid]) inv[uid] = [];
        var item = SHOP_ITEMS.find(function(i) { return i.id === event.item; });
        if (item) inv[uid].push({ ...item, quantity: 1 });
        inventoryDB.set(inv);
      }
      saveStatus(status);
      // 探索成就
      var uid = getCurrentUserId();
      var maps = mapDB.get();
      if (!maps[uid]) maps[uid] = { exploreCount: 0 };
      maps[uid].exploreCount = (maps[uid].exploreCount || 0) + 1;
      mapDB.set(maps);
      if (maps[uid].exploreCount >= 10) checkAchievement('explore_10');
      return ok({ event: event, status: status });
    },
    'POST /api/map/move': function(body) {
      var uid = getCurrentUserId();
      var maps = mapDB.get();
      if (!maps[uid]) maps[uid] = {};
      maps[uid].location = body.locationId;
      mapDB.set(maps);
      return ok({ success: true });
    },
    'POST /api/map/travel': function(body) {
      var wallet = getWallet();
      var cost = 100;
      if (wallet.gold < cost) return fail('金币不足，旅行需要 ' + cost);
      wallet.gold -= cost; saveWallet(wallet);
      var uid = getCurrentUserId();
      var maps = mapDB.get();
      if (!maps[uid]) maps[uid] = {};
      maps[uid].city = body.city;
      mapDB.set(maps);
      return ok({ city: body.city, gold: wallet.gold });
    },

    // 婚姻
    'GET /api/marriage/info': function() {
      var uid = getCurrentUserId();
      var marriages = marriageDB.get();
      return ok(marriages[uid] || null);
    },
    'POST /api/marriage/propose/npc': function(body) {
      var char = getCurrentChar();
      if (!char) return fail('无角色');
      var npc = NPC_LIST.find(function(n) { return n.id === body.npcId; });
      if (!npc) return fail('NPC不存在');
      var rels = npcRelDB.get();
      var uid = getCurrentUserId();
      if (!rels[uid]) rels[uid] = {};
      if ((rels[uid][body.npcId] || 0) < 800) return fail('好感度不足，需要800');
      var marriages = marriageDB.get();
      marriages[uid] = { spouseId: body.npcId, spouseName: npc.name, spouseType: 'npc', marriedAt: Date.now(), children: [] };
      marriageDB.set(marriages);
      checkAchievement('marry');
      return ok({ success: true, spouse: npc });
    },
    'POST /api/marriage/divorce': function() {
      var uid = getCurrentUserId();
      var marriages = marriageDB.get();
      if (marriages[uid]) { delete marriages[uid]; marriageDB.set(marriages); }
      return ok({ success: true });
    },
    'POST /api/marriage/child/bear': function() {
      var uid = getCurrentUserId();
      var marriages = marriageDB.get();
      if (!marriages[uid]) return fail('未结婚');
      var child = { id: 'c_' + Date.now(), name: '孩子', age: 0, gender: Math.random() > 0.5 ? 'male' : 'female', bornAt: Date.now() };
      marriages[uid].children.push(child);
      marriageDB.set(marriages);
      checkAchievement('child');
      return ok(child);
    },
    'GET /api/marriage/children': function() {
      var uid = getCurrentUserId();
      var marriages = marriageDB.get();
      return ok(marriages[uid] ? marriages[uid].children : []);
    },

    // NPC
    'GET /api/npc/datable': function() { return ok(NPC_LIST); },
    'GET /api/npc/relations': function() {
      var uid = getCurrentUserId();
      var rels = npcRelDB.get();
      var userRels = rels[uid] || {};
      var list = [];
      for (var npcId in userRels) {
        var npc = NPC_LIST.find(function(n) { return n.npcId === npcId || n.id === npcId; });
        if (!npc) continue;
        var r = userRels[npcId];
        var affinity = typeof r === 'object' ? (r.affinity || 0) : (r || 0);
        var talkCount = typeof r === 'object' ? (r.talkCount || 0) : 0;
        var relationLabel = affinity >= 800 ? '恋人' : affinity >= 500 ? '好友' : affinity >= 200 ? '熟人' : '陌生人';
        list.push({
          npcId: npc.npcId,
          npcName: npc.name,
          npcAvatar: npc.avatar,
          relationLabel: relationLabel,
          talkCount: talkCount,
          affinity: affinity,
          canPropose: affinity >= 800
        });
      }
      return ok(list);
    },
    'POST /api/npc/talk': function(body) {
      var uid = getCurrentUserId();
      var rels = npcRelDB.get();
      if (!rels[uid]) rels[uid] = {};
      var npcId = body.npcId;
      if (!rels[uid][npcId] || typeof rels[uid][npcId] !== 'object') {
        rels[uid][npcId] = { affinity: rels[uid][npcId] || 0, talkCount: 0 };
      }
      rels[uid][npcId].affinity += 10;
      rels[uid][npcId].talkCount += 1;
      npcRelDB.set(rels);
      var npc = NPC_LIST.find(function(n) { return n.npcId === npcId || n.id === npcId; });
      var replies = ['你好呀！', '今天过得怎么样？', '很高兴见到你~', '有空一起出去玩吗？', '你看起来气色不错！', '最近在忙什么呢？'];
      var dialogue = replies[Math.floor(Math.random() * replies.length)];
      var affinity = rels[uid][npcId].affinity;
      var relationLabel = affinity >= 800 ? '恋人' : affinity >= 500 ? '好友' : affinity >= 200 ? '熟人' : '陌生人';
      return ok({
        npcAvatar: npc ? npc.avatar : '👤',
        npcName: npc ? npc.name : '未知',
        dialogue: dialogue,
        affinityChange: 10,
        currentAffinity: affinity,
        relationLabel: relationLabel
      });
    },
    'POST /api/npc/gift': function(body) {
      var uid = getCurrentUserId();
      var wallet = getWallet();
      if (wallet.gold < 50) return fail('金币不足，送礼需要50金币');
      wallet.gold -= 50;
      saveWallet(wallet);
      var rels = npcRelDB.get();
      if (!rels[uid]) rels[uid] = {};
      var npcId = body.npcId;
      if (!rels[uid][npcId] || typeof rels[uid][npcId] !== 'object') {
        rels[uid][npcId] = { affinity: rels[uid][npcId] || 0, talkCount: 0 };
      }
      rels[uid][npcId].affinity += 30;
      npcRelDB.set(rels);
      var npc = NPC_LIST.find(function(n) { return n.npcId === npcId || n.id === npcId; });
      var dialogues = ['谢谢你的礼物！', '哇，我很喜欢！', '你真是太贴心了~', '这个礼物真不错！', '我会好好珍藏的！'];
      var dialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
      var affinity = rels[uid][npcId].affinity;
      return ok({
        npcAvatar: npc ? npc.avatar : '👤',
        npcName: npc ? npc.name : '未知',
        dialogue: dialogue,
        affinityChange: 30,
        currentAffinity: affinity
      });
    },

    // 商店
    'GET /api/shop/list': function(query) {
      var shopId = query.shopId || 'general';
      return ok({ shopId: shopId, items: SHOP_ITEMS });
    },
    'POST /api/shop/buy': function(body) {
      var item = SHOP_ITEMS.find(function(i) { return i.id === body.itemId; });
      if (!item) return fail('商品不存在');
      var wallet = getWallet();
      if (wallet.gold < item.price) return fail('金币不足');
      wallet.gold -= item.price; saveWallet(wallet);
      var uid = getCurrentUserId();
      var inv = inventoryDB.get();
      if (!inv[uid]) inv[uid] = [];
      var existing = inv[uid].find(function(i) { return i.id === item.id; });
      if (existing) existing.quantity = (existing.quantity || 1) + 1;
      else inv[uid].push({ ...item, quantity: 1 });
      inventoryDB.set(inv);
      // 购买成就
      var ach = achievementDB.get();
      if (!ach[uid]) ach[uid] = { unlocked: [], claimed: [], buyCount: 0 };
      ach[uid].buyCount = (ach[uid].buyCount || 0) + 1;
      achievementDB.set(ach);
      if (ach[uid].buyCount >= 10) checkAchievement('buy_10');
      return ok({ item: item, gold: wallet.gold, inventory: inv[uid] });
    },
    'POST /api/shop/sell': function(body) {
      var item = SHOP_ITEMS.find(function(i) { return i.id === body.itemId; });
      if (!item) return fail('物品不存在');
      var uid = getCurrentUserId();
      var inv = inventoryDB.get();
      if (!inv[uid]) return fail('背包为空');
      var idx = inv[uid].findIndex(function(i) { return i.id === body.itemId; });
      if (idx === -1) return fail('背包中没有该物品');
      var sellPrice = Math.floor(item.price * 0.5);
      if (inv[uid][idx].quantity > 1) inv[uid][idx].quantity--;
      else inv[uid].splice(idx, 1);
      inventoryDB.set(inv);
      var wallet = getWallet(); wallet.gold += sellPrice; saveWallet(wallet);
      return ok({ gold: wallet.gold, sellPrice: sellPrice });
    },

    // 状态
    'GET /api/status/info': function() { return ok(getStatus()); },
    'GET /api/status/diseases': function() {
      var s = getStatus();
      return ok(s ? s.diseases : []);
    },
    'GET /api/status/effects': function() {
      var s = getStatus();
      return ok(s ? s.effects : []);
    },
    'POST /api/status/cure': function(body) {
      var s = getStatus();
      var disease = DISEASE_LIST.find(function(d) { return d.id === body.diseaseId; });
      if (!disease) return fail('疾病不存在');
      var wallet = getWallet();
      if (wallet.gold < disease.curePrice) return fail('金币不足，需要 ' + disease.curePrice);
      wallet.gold -= disease.curePrice; saveWallet(wallet);
      s.diseases = s.diseases.filter(function(d) { return d.id !== body.diseaseId; });
      saveStatus(s);
      return ok({ status: s, gold: wallet.gold });
    },
    'POST /api/status/rest': function() {
      var s = getStatus();
      s.stamina = Math.min(100, s.stamina + 40);
      s.health = Math.min(100, s.health + 5);
      s.hunger = Math.max(0, s.hunger - 10);
      saveStatus(s);
      return ok({ status: s });
    },

    // 钱包
    'GET /api/wallet/info': function() { return ok(getWallet()); },

    // 成就
    'GET /api/achievement/list': function() {
      var uid = getCurrentUserId();
      var ach = achievementDB.get();
      var userAch = ach[uid] || { unlocked: [], claimed: [] };
      var list = ACHIEVEMENT_LIST.map(function(a) {
        return { ...a, unlocked: userAch.unlocked.indexOf(a.id) !== -1, claimed: userAch.claimed.indexOf(a.id) !== -1 };
      });
      return ok(list);
    },
    'GET /api/achievement/stats': function() {
      var uid = getCurrentUserId();
      var ach = achievementDB.get();
      var userAch = ach[uid] || { unlocked: [], claimed: [] };
      return ok({ total: ACHIEVEMENT_LIST.length, unlocked: userAch.unlocked.length, claimed: userAch.claimed.length });
    },
    'POST /api/achievement/reward/claim': function(body) {
      var uid = getCurrentUserId();
      var ach = achievementDB.get();
      if (!ach[uid]) ach[uid] = { unlocked: [], claimed: [] };
      if (ach[uid].unlocked.indexOf(body.achievementId) === -1) return fail('成就未解锁');
      if (ach[uid].claimed.indexOf(body.achievementId) !== -1) return fail('奖励已领取');
      var a = ACHIEVEMENT_LIST.find(function(x) { return x.id === body.achievementId; });
      if (!a) return fail('成就不存在');
      ach[uid].claimed.push(body.achievementId);
      achievementDB.set(ach);
      var wallet = getWallet(); wallet.gold += a.reward; saveWallet(wallet);
      return ok({ reward: a.reward, gold: wallet.gold });
    }
  };

  // ========== 匹配路由 ==========
  function matchRoute(method, path) {
    var key = method + ' ' + path;
    if (routes[key]) return { handler: routes[key], params: {} };
    // 尝试带参数的路由（如 /api/friend/accept/xxx）
    for (var pattern in routes) {
      var parts = pattern.split(' ');
      var m = parts[0], p = parts[1];
      if (m !== method) continue;
      var pParts = p.split('/');
      var pathParts = path.split('?')[0].split('/');
      if (pParts.length !== pathParts.length) continue;
      var match = true;
      for (var i = 0; i < pParts.length; i++) {
        if (pParts[i] !== pathParts[i] && !pParts[i].startsWith(':')) { match = false; break; }
      }
      if (match) return { handler: routes[pattern], params: {} };
    }
    return null;
  }

  // ========== 覆盖全局 API 函数 ==========
  window.apiGet = function(path) {
    var url = path.split('?');
    var query = {};
    if (url[1]) {
      url[1].split('&').forEach(function(kv) {
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    var route = matchRoute('GET', url[0]);
    if (route) return route.handler(null, query);
    console.warn('[Mock API] 未匹配 GET:', path);
    return ok(null);
  };

  window.apiPost = function(path, body) {
    var route = matchRoute('POST', path.split('?')[0]);
    if (route) return route.handler(body || {}, path);
    console.warn('[Mock API] 未匹配 POST:', path);
    return ok(null);
  };

  // ========== 模拟 WebSocket ==========
  window.connectWebSocket = function() {
    if (window.wsChat) {
      try { window.wsChat.onclose(); } catch(e) {}
    }
    var mockWs = {
      readyState: 1,
      send: function(data) {
        try {
          var msg = JSON.parse(data);
          if (msg.type === 'chat') {
            var chat = chatDB.get();
            chat.push({ username: window.authUsername || '玩家', content: msg.content, type: 'chat', time: Date.now() });
            chatDB.set(chat);
            // 模拟机器人回复
            setTimeout(function() {
              if (mockWs.onmessage) {
                var botMsg = { type: 'chat', username: 'NPC_' + Math.floor(Math.random() * 100), content: CHAT_BOT_MESSAGES[Math.floor(Math.random() * CHAT_BOT_MESSAGES.length)] };
                mockWs.onmessage({ data: JSON.stringify(botMsg) });
              }
            }, 2000 + Math.random() * 3000);
          }
        } catch(e) {}
      },
      close: function() { this.readyState = 3; },
      onopen: null, onmessage: null, onclose: null
    };
    window.wsChat = mockWs;
    // 触发 onopen
    setTimeout(function() {
      if (mockWs.onopen) mockWs.onopen();
      // 模拟在线人数
      if (mockWs.onmessage) {
        mockWs.onmessage({ data: JSON.stringify({ type: 'onlineCount', count: Math.floor(Math.random() * 500) + 100 }) });
      }
    }, 100);
    // 定期更新在线人数
    setInterval(function() {
      if (mockWs.onmessage && mockWs.readyState === 1) {
        mockWs.onmessage({ data: JSON.stringify({ type: 'onlineCount', count: Math.floor(Math.random() * 500) + 100 }) });
      }
    }, 30000);
  };

  // 恢复当前用户
  var savedToken = localStorage.getItem('earth_orbit_token');
  var savedUsername = localStorage.getItem('earth_orbit_username');
  if (savedToken && savedUsername) {
    var users = usersDB.get();
    currentUser = users.find(function(u) { return u.username === savedUsername; }) || null;
    window.authUsername = savedUsername;
  }

  console.log('%c🌍 EarthOrbit Mock API 已加载', 'color:#4fc3f7;font-size:14px;font-weight:bold;');
})();
