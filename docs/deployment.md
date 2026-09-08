# 部署

应用需要 Node.js 服务端。GitHub Pages 或纯静态导出不能运行百炼接口。

## Vercel

1. 将仓库导入自己的 Vercel 账户，框架选择 Next.js，Node.js 22.x。仓库根目录就是项目根目录。
2. 安装命令 `npm ci`，构建命令 `npm run build`。仓库内 `vercel.json` 将函数区域设为东京 `hnd1`、最大运行时长 70 秒。
3. 在 **Production 环境变量**中填写 `DASHSCOPE_API_KEY`，类型选择 Sensitive；其余百炼配置见[安装说明](setup.md)。不要使用 `NEXT_PUBLIC_` 前缀。
4. 公共 Demo 设置 `WHITESPACE_DEMO_MODE=true`，先保持 `WHITESPACE_DEMO_ENABLED=false`。此时页面可浏览，但不会消耗模型额度。
5. 在项目 Firewall 为 `POST /api/prioritize` 配置按 IP 的 Rate Limit，例如每 60 秒 2 次，动作使用 429。发布规则并验证生效。
6. 将 `WHITESPACE_DEMO_ENABLED` 改为 `true` 并重新部署，再通过生产网址验证真实生成和复制。

不把生产 Key 配到不可信 Pull Request 的预览环境。CLI 的 `.vercel/` 和全部本地环境文件均不提交；`.vercelignore` 也排除了参考材料、测试产物和环境文件。

## 公开调用保护

- 单请求最多 64 KiB；公共 Demo 额外最多 30 条需求，成功标准 1000 字、名称 120 字、说明 1200 字，内容合计 16000 字（按 JavaScript 字符串长度计）。
- Demo 每个服务实例最多 2 个并发生成、每 10 分钟 10 次生成；失败请求也计数，拒绝请求不访问百炼。
- 单次模型请求最多 6000 输出 tokens，最多两次尝试、总等待预算 65 秒。
- 平台 WAF 在应用之前限制客户端频率。Vercel 的计数按区域维护，不能把单区域计数当作全世界唯一计数。
- 应用计数在进程内，冷启动或扩容会产生新的计数器，**不是全局账单硬上限**。不引入数据库的这个版本不承诺实现全局每日付费额度。
- 使用专用于 Demo 的百炼 Key、检查服务商可用的额度/预算设置并监测实际账单。Vercel 的平台费用限制不等于百炼费用限制。
- 要暂停生成，将 `WHITESPACE_DEMO_ENABLED=false` 后重新部署，或在 Firewall 阻断该接口；页面仍可浏览。环境变量修改不影响旧部署，请同步处理仍公开可访问的旧版本。

只有服务端环境变量保存 Key，源码和浏览器响应不包含 Key。公开访问 Key 对应的是网站的生成能力，不能把“Key 没泄露”误认为接口不会产生费用。

## 自托管

```bash
npm ci
npm run build
node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
```

在宿主机环境或私有 `.env.local` 中配置百炼，使用 HTTPS 反向代理和对应限流能力。`WHITESPACE_DEMO_MODE=false` 为本地默认值；对公众提供服务时开启 Demo 保护或配置自己的访问和用量规则。
