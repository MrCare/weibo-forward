/** 微博 DOM 选择器集中维护，改版时只改此文件 */

export const SELECTORS = {
  /** 旧版详情页「转发」链接 */
  forwardLinks: ['a[action-type="feed_list_forward"]'],
  /** 新版详情页互动栏容器 */
  postActionBar: '[class*="_left_"][class*="_main_"]',
  /** 互动栏内转发区域（图标模式也有） */
  forwardRetweetRegion: '[class*="_retweet_"]',
  /** 转发评语输入框（弹层打开后出现） */
  forwardCommentTextarea: 'textarea[placeholder*="说说分享心得"]',
  /** 弹层确认「转发」 */
  forwardSubmitButton: 'button.woo-button-primary',
  /** 登录页二维码区域（passport / newlogin） */
  loginQrRegions: [
    'img[src*="qr"]',
    'img[class*="qrcode"]',
    'img[class*="Qrcode"]',
    '[class*="qrcode"] img',
    '[class*="QrCode"] img',
    '[class*="scan"] img',
    '.login-qrcode img',
    '#qrcode img',
    'canvas',
  ],
  /** 已登录特征：用户头像/设置入口等 */
  loggedInIndicators: [
    '[class*="SideNav"] [class*="avatar"]',
    'a[href*="/u/"] img[class*="avatar"]',
    '[class*="NavBar"] [class*="avatar"]',
  ],
  /** 微博正文 */
  postText: [
    '[class*="detail_text"]',
    '[class*="wbpro-feed-content"]',
    'article [class*="text"]',
    '[node-type="feed_list_content"]',
  ],
} as const;
