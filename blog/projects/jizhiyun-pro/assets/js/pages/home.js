/* ===================================================================
 * home.js - 首页模块
 * 包含：Hero横幅、数据统计滚动、服务板块、最新资讯、客户案例、
 *       评论留言、快速预约表单、合作伙伴轮播(Swiper)、FAQ折叠面板
 * =================================================================== */
window.App = window.App || {};
App.Pages = App.Pages || {};

App.Pages.Home = {
  async render() {
    // 拉取最新资讯用于首页展示
    let articles = [];
    try { const r = await App.API.getArticles({ sort: 'newest', pageSize: 3 }); articles = (r && r.rows) || []; } catch (e) {}
    let products = [];
    try { const r = await App.API.getProducts({ pageSize: 4 }); products = (r && r.rows) || []; } catch (e) {}

    return `
    <!-- ===== ① 全屏 Hero 横幅 ===== -->
    <section class="relative overflow-hidden hero-bg">
      <div class="absolute inset-0 hero-gradient"></div>
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 text-center">
        <div class="badge badge-brand inline-block mb-4" data-aos="fade-down">🚀 2026 企业数字化升级季</div>
        <h1 class="text-4xl md:text-6xl font-black text-white leading-tight" data-aos="fade-up">
          驱动企业<span class="text-brand">数字化</span>未来
        </h1>
        <p class="text-lg md:text-xl text-slate-200 mt-6 max-w-2xl mx-auto" data-aos="fade-up" data-aos-delay="100">
          一站式云服务、数据分析、AI应用与安全防护解决方案，助力企业高效上云、智能决策
        </p>
        <div class="flex flex-wrap gap-4 justify-center mt-8" data-aos="fade-up" data-aos-delay="200">
          <a href="#/products" class="btn-primary text-base px-8 py-3"><i class="fa-solid fa-rocket mr-1"></i>立即体验</a>
          <a href="#/news" class="btn-outline text-base px-8 py-3 text-white border-white"><i class="fa-solid fa-book-open mr-1"></i>了解更多</a>
        </div>
        <div class="flex flex-wrap justify-center gap-8 mt-12 text-white/80 text-sm" data-aos="fade-up" data-aos-delay="300">
          <span><i class="fa-solid fa-shield-halved mr-1 text-brand"></i>等保三级认证</span>
          <span><i class="fa-solid fa-bolt mr-1 text-brand"></i>99.99%可用性</span>
          <span><i class="fa-solid fa-headset mr-1 text-brand"></i>7×24专属服务</span>
        </div>
      </div>
    </section>

    <!-- ===== ② 数据统计数字滚动 ===== -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${this._statCard('fa-users', '服务客户', '12000', '+')}
        ${this._statCard('fa-server', '部署实例', '38000', '+')}
        ${this._statCard('fa-clock', '运行时长', '8760', '小时')}
        ${this._statCard('fa-star', '客户满意', '99', '%')}
      </div>
    </section>

    <!-- ===== ③ 服务板块 ===== -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div class="text-center mb-12" data-aos="fade-up">
        <h2 class="text-3xl md:text-4xl font-bold">核心服务</h2>
        <p class="text-slate-500 mt-3">全方位赋能企业数字化转型</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        ${this._serviceCard('fa-cloud', '企业云服务', '弹性计算、存储、网络一体化，支持秒级扩容', '#1c52f5')}
        ${this._serviceCard('fa-chart-line', '数据分析', '海量数据实时处理，可视化报表驱动决策', '#22c55e')}
        ${this._serviceCard('fa-robot', 'AI智能应用', 'NLP、计算机视觉、智能客服开箱即用', '#f59e0b')}
        ${this._serviceCard('fa-shield-halved', '安全防护', 'WAF+入侵检测+漏洞扫描纵深防御', '#ef4444')}
      </div>
    </section>

    <!-- ===== ④ 最新资讯卡片 ===== -->
    <section class="bg-slate-100 dark:bg-slate-950 py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-end mb-10" data-aos="fade-up">
          <div>
            <h2 class="text-3xl font-bold">最新资讯</h2>
            <p class="text-slate-500 mt-2">行业动态与技术洞察</p>
          </div>
          <a href="#/news" class="btn-ghost">查看全部 <i class="fa-solid fa-arrow-right ml-1"></i></a>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          ${articles.length ? articles.map((a, i) => this._articleCard(a, i)).join('') : App.Components.empty('fa-newspaper', '暂无资讯')}
        </div>
      </div>
    </section>

    <!-- ===== ⑤ 客户案例展示 ===== -->
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div class="text-center mb-12" data-aos="fade-up">
        <h2 class="text-3xl font-bold">客户案例</h2>
        <p class="text-slate-500 mt-3">值得信赖的行业选择</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        ${this._caseCard('某大型制造企业', '云平台迁移', '通过云原生改造，IT成本降低40%，交付效率提升3倍', 'https://picsum.photos/seed/case1/600/400')}
        ${this._caseCard('某金融机构', '数据中台建设', '整合12个业务系统数据，决策周期从7天缩短至1天', 'https://picsum.photos/seed/case2/600/400')}
        ${this._caseCard('某零售集团', 'AI智能客服', '部署智能客服后，人工成本降低60%，响应速度提升80%', 'https://picsum.photos/seed/case3/600/400')}
      </div>
    </section>

    <!-- ===== ⑥ 评论留言 ===== -->
    <section class="bg-slate-100 dark:bg-slate-950 py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-12" data-aos="fade-up">
          <h2 class="text-3xl font-bold">用户评价</h2>
          <p class="text-slate-500 mt-3">来自真实客户的声音</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          ${this._reviewCard('张总监', '某科技公司', '极智云的平台稳定可靠，技术支持响应迅速，是我们数字化转型的可靠伙伴。')}
          ${this._reviewCard('李经理', '某制造企业', '数据分析中台让我们的业务洞察更清晰，决策更有底气。')}
          ${this._reviewCard('王总', '某零售集团', 'AI客服上线后大大降低了人力成本，客户满意度反而提升了。')}
        </div>
      </div>
    </section>

    <!-- ===== ⑦ 快速预约表单 ===== -->
    <section class="max-w-4xl mx-auto px-4 py-20">
      <div class="neu-card p-8 md:p-12" data-aos="zoom-in">
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold">快速预约咨询</h2>
          <p class="text-slate-500 mt-2">留下信息，专属顾问1小时内联系您</p>
        </div>
        <form id="bookingForm" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="form-label">姓名 <span class="text-red-500">*</span></label>
            <input class="form-input" name="name" placeholder="请输入您的姓名">
            <div class="form-error" id="err-name"></div>
          </div>
          <div>
            <label class="form-label">手机号 <span class="text-red-500">*</span></label>
            <input class="form-input" name="phone" placeholder="请输入手机号">
            <div class="form-error" id="err-phone"></div>
          </div>
          <div>
            <label class="form-label">邮箱</label>
            <input class="form-input" name="email" placeholder="请输入邮箱">
            <div class="form-error" id="err-email"></div>
          </div>
          <div>
            <label class="form-label">咨询产品</label>
            <select class="form-select" name="product">
              <option value="云服务">企业云服务</option>
              <option value="数据分析">数据分析中台</option>
              <option value="AI应用">AI智能应用</option>
              <option value="安全服务">安全防护</option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="form-label">需求描述</label>
            <textarea class="form-textarea" name="content" rows="3" placeholder="简要描述您的需求..."></textarea>
          </div>
          <div class="md:col-span-2 text-center">
            <button type="submit" class="btn-primary px-10 py-3"><i class="fa-solid fa-paper-plane mr-1"></i>提交预约</button>
          </div>
        </form>
      </div>
    </section>

    <!-- ===== ⑧ 合作伙伴轮播 ===== -->
    <section class="py-16 bg-slate-100 dark:bg-slate-950">
      <div class="max-w-7xl mx-auto px-4">
        <h2 class="text-center text-2xl font-bold mb-8" data-aos="fade-up">合作伙伴</h2>
        <div class="swiper partnerSwiper">
          <div class="swiper-wrapper">
            ${['华为云','阿里云','腾讯云','AWS','Azure','金山云','京东云','百度云'].map(p => `
              <div class="swiper-slide">
                <div class="glass-card p-6 flex items-center justify-center h-24 text-lg font-bold text-slate-400 hover:text-brand transition">
                  <i class="fa-solid fa-cloud mr-2"></i>${p}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </section>

    <!-- ===== ⑨ FAQ 折叠面板 ===== -->
    <section class="max-w-3xl mx-auto px-4 py-20">
      <div class="text-center mb-10" data-aos="fade-up">
        <h2 class="text-3xl font-bold">常见问题</h2>
        <p class="text-slate-500 mt-2">关于我们服务的热门问答</p>
      </div>
      <div id="faqList">
        ${this._faqItem('产品是否支持试用？', '所有产品均提供14天免费试用，无需绑定支付方式，可在控制台一键开通。')}
        ${this._faqItem('数据安全如何保障？', '我们通过等保三级认证，提供数据加密、访问控制、审计日志等多重保障，数据完全归客户所有。')}
        ${this._faqItem('如何进行售后支持？', '提供7×24小时在线工单、电话热线、专属技术群三种支持渠道，VIP客户配备专属技术经理。')}
        ${this._faqItem('是否支持私有化部署？', '云服务、数据分析中台、安全套件均支持私有化部署，可根据需求灵活定制。')}
        ${this._faqItem('付费方式有哪些？', '支持按量付费、包年包月、预留实例三种模式，企业客户可签署框架协议支持对公转账。')}
      </div>
    </section>`;
  },

  /* ===== 子组件 ===== */
  _statCard(icon, label, target, suffix) {
    return `<div class="glass-card p-6 text-center" data-aos="zoom-in">
      <i class="fa-solid ${icon} text-3xl text-brand mb-2"></i>
      <div class="stat-number" data-target="${target}">0</div>
      <div class="text-sm text-slate-500 mt-1">${label}${suffix ? '<span class="text-brand"> '+suffix+'</span>' : ''}</div>
    </div>`;
  },
  _serviceCard(icon, title, desc, color) {
    return `<div class="glass-card p-6 hover-lift" data-aos="fade-up">
      <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style="background:${color}15;color:${color}">
        <i class="fa-solid ${icon} text-2xl"></i>
      </div>
      <h3 class="text-xl font-bold mb-2">${title}</h3>
      <p class="text-sm text-slate-500">${desc}</p>
      <a href="#/products" class="text-brand text-sm font-medium mt-4 inline-block">了解更多 <i class="fa-solid fa-arrow-right text-xs"></i></a>
    </div>`;
  },
  _articleCard(a, i) {
    return `<div class="glass-card overflow-hidden hover-lift" data-aos="fade-up" data-aos-delay="${i*100}">
      <img class="lazy w-full h-48 object-cover" data-src="${a.cover}" alt="${App.Utils.escape(a.title)}" onclick="App.previewImage('${a.cover}')">
      <div class="p-5">
        <span class="badge badge-brand">${a.category}</span>
        <h3 class="font-bold text-lg mt-2 line-clamp-2"><a href="#/news-detail?id=${a.id}">${App.Utils.escape(a.title)}</a></h3>
        <p class="text-sm text-slate-500 mt-2 line-clamp-2">${App.Utils.escape(a.summary)}</p>
        <div class="flex items-center justify-between mt-4 text-xs text-slate-400">
          <span><i class="fa-solid fa-eye mr-1"></i>${a.views||0}</span>
          <span><i class="fa-solid fa-calendar mr-1"></i>${App.Utils.formatDate(a.createdAt)}</span>
        </div>
      </div>
    </div>`;
  },
  _caseCard(name, title, desc, img) {
    return `<div class="glass-card overflow-hidden hover-lift" data-aos="zoom-in">
      <img class="lazy w-full h-52 object-cover" data-src="${img}" alt="${name}" onclick="App.previewImage('${img}')">
      <div class="p-5">
        <span class="badge badge-green">${title}</span>
        <h3 class="font-bold text-lg mt-2">${name}</h3>
        <p class="text-sm text-slate-500 mt-2">${desc}</p>
      </div>
    </div>`;
  },
  _reviewCard(name, org, content) {
    return `<div class="glass-card p-6 hover-lift" data-aos="fade-up">
      <div class="flex text-amber-400 mb-3">${'<i class="fa-solid fa-star"></i>'.repeat(5)}</div>
      <p class="text-slate-600 dark:text-slate-300">"${content}"</p>
      <div class="flex items-center gap-3 mt-4">
        <div class="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center font-bold">${name[0]}</div>
        <div><div class="font-semibold">${name}</div><div class="text-xs text-slate-400">${org}</div></div>
      </div>
    </div>`;
  },
  _faqItem(q, a) {
    return `<div class="accordion-item" onclick="this.classList.toggle('open')">
      <div class="accordion-header"><span>${q}</span><i class="fa-solid fa-chevron-down accordion-icon text-slate-400"></i></div>
      <div class="accordion-body"><p class="text-slate-500 text-sm py-2">${a}</p></div>
    </div>`;
  },

  /* ===== 页面渲染后初始化（Swiper + 数字动画 + 表单） ===== */
  afterRender() {
    // 数字滚动
    document.querySelectorAll('[data-target]').forEach(el => {
      App.Utils.animateNumber(el, Number(el.dataset.target));
    });
    // 合作伙伴轮播
    if (window.Swiper) new Swiper('.partnerSwiper', { slidesPerView: 2, spaceBetween: 16, loop: true, autoplay: { delay: 2500 }, breakpoints: { 640: { slidesPerView: 4 }, 1024: { slidesPerView: 6 } } });
    // 预约表单
    const form = document.getElementById('bookingForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);
      // 表单校验
      let ok = true;
      const errName = App.Utils.validate.required(data.name, '姓名'); document.getElementById('err-name').textContent = errName; if (errName) ok = false;
      const errPhone = App.Utils.validate.phone(data.phone); document.getElementById('err-phone').textContent = errPhone || App.Utils.validate.required(data.phone, '手机号'); if (document.getElementById('err-phone').textContent) ok = false;
      if (data.email) { const errE = App.Utils.validate.email(data.email); document.getElementById('err-email').textContent = errE; if (errE) ok = false; }
      if (!ok) { App.Utils.toast('请检查表单填写', 'error'); return; }
      try {
        await App.API.saveMessage(data);
        App.Utils.toast('预约成功，顾问将尽快联系您！', 'success');
        form.reset();
      } catch (err) { App.Utils.toast('提交失败：' + err.message, 'error'); }
    });
  }
};
