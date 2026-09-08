# API

## POST `/api/prioritize`

`Content-Type: application/json`，请求体最多 64 KiB。生成会使用服务端百炼 Key，调用方不传 Key。

```json
{
  "people": 2,
  "workdays": 5,
  "success": "用户能提交报名",
  "requirements": [
    { "id": "r1", "name": "报名表", "desc": "用户填写并提交报名", "estimateDays": 2 },
    { "id": "r2", "name": "报名排行榜", "desc": "按报名量展示排行", "estimateDays": 3, "excluded": true }
  ]
}
```

人数与工作日须为有限正数。至少两条需求、ID 唯一、名称非空、说明为字符串；估值可省略或为 null，填写时须为正数。`excluded` 可省略，填写时须为布尔值。公共 Demo 额外限制见[部署说明](deployment.md)。

## 成功响应

HTTP 200。完整类型定义见 [`PrioritizeOutput`](../src/lib/contracts.ts)。

| 字段 | 含义 |
| --- | --- |
| `capacityDays`、`mustDays` | 可用产能、本期 Must 合计人天 |
| `must`、`should`、`could`、`wont` | 四组需求，包含 `id/name/moscow/estimateDays/reason` |
| `feasibility` | `feasible`、`infeasible`、`needs_confirmation` |
| `essentialIds`、`unmetSuccess` | 达标必要需求 ID、未满足的成功标准 |
| `candidates`、`candidateDays` | 非承诺的部分工作候选及合计人天 |
| `goalCoverage` | 每项目标的必要需求、覆盖状态、缺失需求与原文依据 |
| `dependencies` | 前置边；`fromId` 依赖 `toId`，未知外部前置的 `toId` 为 null |
| `needsConfirmation`、`goalConflicts` | 待确认信息、明确排除与目标的冲突 |
| `warnings`、`meetingNote` | 代码生成的警告与可复制结论 |

覆盖状态为 `committed/candidate/blocked/missing/needs_confirmation/conflict`。依赖 `kind` 为 `explicit` 或 `uncertain`；仅有关联的需求不自动产生必要依赖。

## 错误响应

```json
{ "error": { "code": "INVALID_INPUT", "message": "请填写成功标准。" } }
```

| HTTP | 示例 code | 含义 |
| --- | --- | --- |
| 400 | `INVALID_INPUT`、`INVALID_JSON`、`DEMO_INPUT_LIMIT` | 输入或公开演示内容上限不符合要求 |
| 413 | `BODY_TOO_LARGE` | 请求超过 64 KiB |
| 429 | `DEMO_BUSY`、`DEMO_RATE_LIMITED` | 公共演示并发或实例额度限制；带 Retry-After |
| 502 | `AUTH_FAILED`、`INVALID_SCOPE`、`PROVIDER_ERROR` 等 | 上游认证、结构、语义校验或服务错误 |
| 503 | `MISSING_KEY`、`INVALID_CONFIG`、`RATE_LIMITED`、`DEMO_CLOSED` | 服务配置、上游限流或演示暂未开放 |
| 504 | `TIMEOUT` | 等待超时 |

应用响应带 `Cache-Control: no-store` 和 `X-Request-Id`，可用排查编号关联受控日志。部署平台防火墙可在请求进入应用前返回 429，该响应可能不是 JSON；前端会显示可操作的限流提示。

接口返回建议而非执行结果。公开演示不是可依赖的生产 API，自行部署时应配置自己的额度与访问控制。
