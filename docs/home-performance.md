# 首页性能与连续滚动

首页使用原创内联 SVG 山形与两层 CSS 雾。三个内容段落沿浏览器自然文档流排布，只有首屏按视口撑开，后续介绍与行动区域由内容决定高度。顶部目录定位真实段落，不固定舞台、不切换正文透明度、不劫持滚轮。

## 运行边界

- 不下载视频、WebP 帧或背景图片，不使用 Canvas、WebGL、Worker、解码器和滚动 RAF。
- 雾层仅动画 transform 和 opacity，不运行实时 blur。配置集中于 `src/features/home/home.css` 的背景区域；山形与颜色渐变在 `MountainAtmosphere.tsx`。
- 桌面精细指针、宽度至少 1024px 且无减少动态效果设置时播放；触屏、小屏或减少动态效果使用同一静态构图。
- IntersectionObserver 与 visibilitychange 暂停离屏／隐藏的雾层。离开首页卸载装饰，清理观察器和事件；直接进入工作台不加载首页组件。
- 正文不等待装饰资源。网页仍需下载正常 HTML、CSS、JavaScript，不能保证零加载时间或所有设备恒定帧率。
- 山雾是设计化表达，不再逐帧复刻历史视频；原帧资源、封面、媒体预处理脚本和 MP4Box 依赖已移除。

## 可重复验收

先运行生产版本，再在另一个终端执行：

```bash
npm run build
npm run start
node scripts/check-home-performance.mjs
```

线上使用 `--url=https://whitespace-junz11055-8124.vercel.app`，或 GitHub Actions 的 Online Demo / home。报告和四档截图保存在被 Git 忽略的 `test-results/home-natural/`。

测试使用浏览器原生滚轮输入，覆盖慢速、快速与反向滚动。固定门槛：

| 检查 | 正常网络 | 受限设备／网络 |
| --- | --- | --- |
| 条件 | 10 Mbps、20ms 延迟 | 1.6 Mbps、150ms 延迟、4 倍 CPU 限速 |
| 导航到首页可读 | <3 秒 | <10 秒 |
| 滚动期间浏览器 RAF 间隔 P95 | ≤50ms | ≤100ms |
| 滚动长任务最大值 | ≤200ms | ≤200ms |
| 布局偏移 CLS | <0.1 | <0.1 |
| 动画媒体请求／Worker／静止应用 RAF | 全部为0 | 全部为0 |

RAF 间隔是主线程调度代理指标，不等于 GPU 实际呈现帧率；同时人工检查画面、连续滚动、文字选择和入口。CSS 雾层在首屏可见时仍由浏览器合成动画，“应用 RAF 为0”不代表完全没有 GPU 工作。页面隐藏测试中的 visibilitychange 分支使用测试注入，离屏暂停和退出清理使用实际页面操作。

## 本次结果

2026-09-08 最终本地生产样本：冷缓存940ms可读、热缓存876ms、受限场景1852ms；三种滚动路径 P95 均不超过16.8ms，无观测到的滚动长任务，CLS为0，动画媒体请求与应用静止RAF均为0。线上结果见发布验收记录，不能将本地样本当作所有地区、实体设备的保证。

开发模式全量浏览器测试曾有一次 Next.js “Router action dispatched before initialization”日志；首轮生产测试中未复现，实际观测和后续回归单独报告。
