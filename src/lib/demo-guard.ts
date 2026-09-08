import { WhiteSpaceError } from './input';
import type { PrioritizeInput } from './contracts';

type Env = Record<string, string | undefined>;
export const demoLimits = { windowMs: 600_000, requests: 10, concurrent: 2, rows: 30, success: 1000, name: 120, desc: 1200, total: 16000 } as const;

// Instance-local admission control; the deployment firewall handles per-IP limits.
export function createDemoGate(now = Date.now) {
  let start = now(), count = 0, active = 0;
  return {
    enter(env: Env = process.env): () => void {
      if (env.WHITESPACE_DEMO_MODE !== 'true') return () => {};
      if (env.WHITESPACE_DEMO_ENABLED !== 'true') throw new WhiteSpaceError('DEMO_CLOSED', '公共演示生成暂未开放，请稍后再试或在本地运行。', 503);
      const time = now();
      if (time - start >= demoLimits.windowMs) { start = time; count = 0; }
      if (active >= demoLimits.concurrent) throw new WhiteSpaceError('DEMO_BUSY', '公共演示正在繁忙，请稍后重新生成。', 429);
      if (count >= demoLimits.requests) throw new WhiteSpaceError('DEMO_RATE_LIMITED', '公共演示本轮额度已用完，请十分钟后重试或在本地运行。', 429);
      count++; active++;
      let released = false;
      return () => { if (!released) { active--; released = true; } };
    },
  };
}

export function checkDemoInput(input: PrioritizeInput, env: Env = process.env) {
  if (env.WHITESPACE_DEMO_MODE !== 'true') return;
  const total = input.success.length + input.requirements.reduce((sum, r) => sum + r.id.length + r.name.length + r.desc.length, 0);
  if (input.requirements.length > demoLimits.rows || input.success.length > demoLimits.success || total > demoLimits.total
    || input.requirements.some(r => r.name.length > demoLimits.name || r.desc.length > demoLimits.desc)) {
    throw new WhiteSpaceError('DEMO_INPUT_LIMIT', '公共演示内容过长：最多 30 条需求、成功标准 1000 字、名称 120 字、说明 1200 字，总计 16000 字。可缩减内容或在本地运行。', 400);
  }
}
export const demoGate = createDemoGate();
