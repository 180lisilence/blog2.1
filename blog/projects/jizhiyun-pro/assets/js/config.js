/* ===================================================================
 * config.js - 全局配置
 * 包含：API地址、菜单结构、页面路由映射、权限定义
 * =================================================================== */
window.App = window.App || {};

App.Config = {
  /* API 根地址（相对路径，支持开发和生产环境） */
  apiBase: '/api',

  /* 是否启用后端 API（运行时自动检测；检测失败则降级为本地 JSON） */
  apiEnabled: true,

  /* 站点信息（与后端 db.json 的 siteConfig 对应，作为前端默认值） */
  site: {
    siteName: '极智云',
    logo: '极智云',
    slogan: '驱动企业数字化未来',
    icp: '沪ICP备2026000001号',
    phone: '400-888-0000',
    email: 'contact@jizhiyun.com',
    address: '上海市浦东新区张江高科技园区'
  },

  /* 导航菜单（name=显示名, path=hash路由, icon=图标, roles=可见角色） */
  menus: [
    { name: '首页', path: '/home', icon: 'fa-house', roles: ['guest','user','vip','admin'] },
    { name: '资讯', path: '/news', icon: 'fa-newspaper', roles: ['guest','user','vip','admin'] },
    { name: '产品', path: '/products', icon: 'fa-box', roles: ['guest','user','vip','admin'] },
    { name: '个人中心', path: '/profile', icon: 'fa-user', roles: ['user','vip','admin'] },
    { name: '后台管理', path: '/admin', icon: 'fa-gauge-high', roles: ['admin'] }
  ],

  /* 权限角色定义 */
  roles: {
    guest:  { name: '游客',     level: 0, desc: '未登录用户，仅可浏览公开内容' },
    user:   { name: '普通用户', level: 1, desc: '注册用户，可下单、评论、收藏' },
    vip:    { name: 'VIP会员',  level: 2, desc: '高级会员，享专属内容与折扣' },
    admin:  { name: '管理员',   level: 9, desc: '系统管理员，拥有全部权限' }
  },

  /* 本地存储键名 */
  storageKeys: {
    user: 'portal_user',
    token: 'portal_token',
    cart: 'portal_cart',
    theme: 'portal_theme',
    themeColor: 'portal_theme_color',
    fontSize: 'portal_font_size',
    favorites: 'portal_favorites'
  }
};
