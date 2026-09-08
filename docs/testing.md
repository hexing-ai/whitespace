# 验证与复现

## 不调用模型的检查

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

Linux 可能需要 `npx playwright install --with-deps chromium`；本机装有 Google Chrome 时，直接 `npm run test:e2e` 默认使用 Chrome。PowerShell 可先执行 `$env:PLAYWRIGHT_CHANNEL="chromium"`。

浏览器测试会启动自己的开发服务器，先停止占用 3100 的服务。测试使用固定 API 响应检查状态和交互，不会产生百炼费用。首页用例验证三幕舞台、完整帧时间轴、入口可用、弱网／缺帧降级、触屏／减少动态效果与退出清理。性能脚本在真实浏览器中推进滚动位置，测量背景实际绘制间隔与长任务；人工浏览器预览另行确认三幕视觉。

CI 在推送和 Pull Request 时运行上述工程、规则和浏览器检查，不配置百炼 Key。

## 真实百炼

先在 `.env.local` 配置有效 Key，执行生产构建，再运行：

```bash
npm run build
npm run test:live -- --case=demo-5-10 --workspace-preview
```

脚本在本地 3101 端口启动生产服务，通过真实浏览器填写输入、生成、核对目标和依赖、检查分组与产能、复制结论，并保存多宽度截图。需要本机 Google Chrome，3101 端口应空闲。

更完整的真实回归：

```bash
npm run test:live -- --negative
npm run test:models
npm run test:dependencies
npm run test:exclusions
npm run test:scope
```

这些命令会产生多次收费调用。缺少 Key 时脚本明确退出并报告待验证。报告保存在被忽略的 `test-results/`，不能把构建通过或固定响应测试当作真实模型通过。

## 独立场景

`tests/evaluation/`、`dependencies/`、`exclusions/`、`scope/`、`negative-goals/` 保存冻结输入与预期，部分目录包含独立评分器和 SHA-256。新增问题应补充明确的输入与预期，而不是调整原有答案迎合模型。

公开 Demo 保护另有 `tests/demo-guard.test.ts` 与 API 边界测试，检查关闭开关、并发、频率、输入规模以及被拒请求不调用模型。

具体版本实际通过的项目见 Release 说明。未执行的真实用例、Safari/实体设备及实际账单不会标记为已验证。

## 在线版本

GitHub Actions 的 **Online Demo** 工作流支持手动运行：`closed` 检查生成关闭开关与平台限流，不产生模型调用；`protected` 检查匿名拒绝、邀请码、防猜测与旧部署阻断，`home` 测量真实线上首页性能；`live` 使用真实 Chromium 完成一次内置示例生成，会消耗部署方的模型额度。

也可在本机 Google Chrome 中执行：

```bash
npm run test:live -- --url=https://whitespace-junz11055-8124.vercel.app --case=demo-5-10 --workspace-preview
```

远程模式不启动本地服务、不要求本地 Key，也不读取远程服务端日志；结果中的模型字段标记为服务端配置，不能用本地环境变量推断远程模型。
