/**
 * 静态演示模式。
 *
 * `npm run build:demo` 会把示例数据打包进产物、并移除 API 路由，
 * 部署成纯静态站点（GitHub Pages / 任意静态托管）。演示模式是只读的：
 * 保存、版本快照、历史回滚都不可用，页面会明确提示。
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO === '1'
