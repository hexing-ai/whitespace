# 安装与运行

## 环境

- Node.js 22.18+，推荐最新 22 LTS。项目包含 `.nvmrc`；已使用 nvm 时可运行 `nvm install && nvm use`。
- npm、Git。
- 可用的阿里云百炼 Key，以及对应地域的模型访问权限。Key 由你自己的百炼账户管理。

```bash
git clone https://github.com/hexing-ai/whitespace.git
cd whitespace
npm ci
cp .env.example .env.local
```

Windows PowerShell 的复制命令为 `Copy-Item .env.example .env.local`。在编辑器中填写 `.env.local`，不要把 Key 写进源码、命令历史或 Issue。

| 变量 | 默认值与范围 |
| --- | --- |
| `DASHSCOPE_API_KEY` | 必填；模板为空，仅在服务端读取 |
| `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1`，北京地域 |
| `DASHSCOPE_MODEL` | `qwen3.6-plus` |
| `DASHSCOPE_TIMEOUT_MS` | `30000`；1–30000 毫秒 |
| `DASHSCOPE_TEMPERATURE` | `0.2`；0–2 |

国际站地址为 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`。Key 必须与地域匹配。允许的模型为 `qwen-plus`、`qwen-turbo`、`qwen-max`、`qwen-plus-latest`、`qwen3.6-plus`、`qwen3.6-flash`；不要换成其他供应商地址。

```bash
npm run dev
```

访问 http://localhost:3100。修改服务端环境变量后重启服务。

生产模式：

```bash
npm run build
npm run start
```

`dev` 与 `start` 默认绑定本机 3100 端口。需要远程提供服务时，使用部署平台或运行 `node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000` 并配置服务端环境。

## 第一次生成

打开首页 → 用示例体验 → 下一步：需求清单 → 生成这期范围 → 原文依据 → 会议结论 → 复制结论。

示例是预填输入，点击生成仍会调用真实百炼。模型可能需要数秒至一分钟；生成失败时输入保留，可以修改并重试。

## 排查

| 现象 | 处理 |
| --- | --- |
| 未配置 Key | 检查项目根目录 `.env.local`，填写后重启 |
| 百炼认证失败 | 核对 Key、北京/国际站地域和模型访问权限 |
| 请求受限 | 查看百炼额度或稍后重试；公共 Demo 还有共享限流 |
| 超时或网络中断 | 检查服务端到百炼的网络，缩减过长需求后重试 |
| 模型结果未通过检查 | 补充成功标准和前置说明；重复出现时提供脱敏复现输入 |
| 3100 端口占用 | 先停止已有开发或生产服务，避免同时占用同一端口 |
| 复制失败 | 使用页面内的手动选择复制；在线站点应使用 HTTPS |
| 首页背景静止 | 手机、减少动态效果设置或解码不支持时使用静态回退，不影响规划 |

输入与会议记录不会写入数据库。刷新会清空当前规划；离开前请复制会议结论。
