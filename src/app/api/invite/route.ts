import { inviteAttempts, issueSession, requireSameOrigin, sessionCookie } from '@/lib/invite';
import { WhiteSpaceError } from '@/lib/input';
import { publicError } from '@/lib/qwen';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    requireSameOrigin(request);
    // Vercel overwrites this header. Other hosts share one bucket unless they add their own trusted proxy protection.
    const client = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') || 'shared' : 'shared';
    inviteAttempts.enter(client);
    if (Number(request.headers.get('content-length')) > 1024) throw new WhiteSpaceError('BODY_TOO_LARGE', '邀请码内容过长。', 413);
    const reader = request.body?.getReader();
    if (!reader) throw new WhiteSpaceError('INVALID_INPUT', '请填写邀请码。', 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1024) { await reader.cancel(); throw new WhiteSpaceError('BODY_TOO_LARGE', '邀请码内容过长。', 413); } chunks.push(value); } }
    finally { reader.releaseLock(); }
    let code: unknown;
    try { code = JSON.parse(Buffer.concat(chunks).toString('utf8')).code; } catch { throw new WhiteSpaceError('INVALID_INPUT', '请填写有效的邀请码。', 400); }
    if (typeof code !== 'string' || !code.trim() || code.length > 128) throw new WhiteSpaceError('INVALID_INPUT', '请填写有效的邀请码。', 400);
    const token = issueSession(code.trim());
    return Response.json({ verified: true }, { headers: { ...headers, 'Set-Cookie': sessionCookie(token, new URL(request.url).protocol === 'https:') } });
  } catch (error) {
    const safe = publicError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: { ...headers, ...(safe.status === 429 ? { 'Retry-After': '600' } : {}) } });
  }
}
