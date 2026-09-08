import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { WhiteSpaceError } from './input';
type Env = Record<string, string | undefined>;
const lifetime = 86400;
export const inviteRequired = (env: Env = process.env) => env.WHITESPACE_DEMO_MODE === 'true' || env.WHITESPACE_INVITE_REQUIRED === 'true';
function config(env: Env) {
  const codes = (env.WHITESPACE_INVITE_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
  const secret = env.WHITESPACE_SESSION_SECRET || '';
  if (!codes.length || codes.length > 20 || codes.some(code => !/^[A-Za-z0-9_-]{16,128}$/.test(code)) || secret.length < 32) {
    throw new WhiteSpaceError('INVITE_UNAVAILABLE', '邀请验证暂不可用，请联系网站维护者。', 503);
  }
  return { codes, secret };
}
const digest = (value: string) => createHash('sha256').update(value).digest();
const equal = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const sign = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url');
const denied = () => new WhiteSpaceError('INVITE_REQUIRED', '生成需要有效邀请码，请验证后继续。已填写的内容会保留。', 401);
export function requireSameOrigin(request: Request) {
  const url = new URL(request.url);
  // Next's internal URL can use localhost; Host retains the browser-facing authority.
  const expected = `${url.protocol}//${request.headers.get('host') || url.host}`;
  if (request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new WhiteSpaceError('INVALID_ORIGIN', '请在本站页面完成验证和生成。', 403);
  }
}
export function issueSession(code: string, env: Env = process.env, now = Math.floor(Date.now() / 1000)) {
  const { codes, secret } = config(env);
  if (!codes.some(candidate => equal(candidate, code))) throw new WhiteSpaceError('INVALID_INVITE', '邀请码不正确或已失效，请核对后重试。', 401);
  const body = Buffer.from(JSON.stringify({ v: 1, iat: now, exp: now + lifetime, id: sign('code:' + code, secret) })).toString('base64url');
  return body + '.' + sign(body, secret);
}
export function sessionCookie(token: string, secure = true) {
  return `${secure ? '__Host-' : ''}whitespace_invite=${token}; Path=/; Max-Age=${lifetime}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict`;
}
export function requireInvite(request: Request, env: Env = process.env, now = Math.floor(Date.now() / 1000)) {
  if (!inviteRequired(env)) return;
  if (env.WHITESPACE_DEMO_MODE === 'true' && env.WHITESPACE_DEMO_ENABLED !== 'true') throw new WhiteSpaceError('DEMO_CLOSED', '公共演示生成暂未开放，请稍后再试或在本地运行。', 503);
  const { codes, secret } = config(env);
  requireSameOrigin(request);
  const name = new URL(request.url).protocol === 'https:' ? '__Host-whitespace_invite' : 'whitespace_invite';
  const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
  if (token.length > 1024) throw denied();
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined || !equal(signature, sign(body, secret))) throw denied();
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (value.v !== 1 || !Number.isInteger(value.iat) || !Number.isInteger(value.exp) || value.iat > now || value.exp <= now || value.exp - value.iat !== lifetime || !codes.some(code => equal(value.id, sign('code:' + code, secret)))) throw denied();
  } catch { throw denied(); }
}
// Bounded instance-local guessing protection, complemented by the deployment WAF.
export function createAttemptGate(now = Date.now) {
  const clients = new Map<string, number>(); let start = now(), total = 0;
  return { enter(client: string) {
    if (now() - start >= 600000) { clients.clear(); total = 0; start = now(); }
    const count = clients.get(client) || 0;
    if (count >= 5 || total >= 60) throw new WhiteSpaceError('INVITE_RATE_LIMITED', '验证过于频繁，请十分钟后再试。', 429);
    clients.set(client, count + 1); total++;
  } };
}
export const inviteAttempts = createAttemptGate();
