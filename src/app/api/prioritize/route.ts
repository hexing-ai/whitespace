import { checkDemoInput, demoGate } from '@/lib/demo-guard';
import { WhiteSpaceError, validateInput } from "@/lib/schema";
import { prioritize, publicError } from "@/lib/qwen";

export const runtime = "nodejs";
export const maxDuration = 70;
const LIMIT = 64 * 1024;
async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > LIMIT) throw new WhiteSpaceError("BODY_TOO_LARGE", "需求内容过长，请缩减至 64 KiB 以内。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WhiteSpaceError("INVALID_INPUT", "请填写规划内容。", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new WhiteSpaceError("BODY_TOO_LARGE", "需求内容过长，请缩减至 64 KiB 以内。", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new WhiteSpaceError("INVALID_JSON", "请求内容不是有效 JSON。", 400); }
}
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let release: (() => void) | undefined;
  try {
    const input = validateInput(await readBody(request));
    checkDemoInput(input);
    release = demoGate.enter();
    return Response.json(await prioritize(input, request.signal, requestId), { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  } catch (error) {
    const safe = publicError(error);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...(safe.status === 429 ? { "Retry-After": safe.code === "DEMO_RATE_LIMITED" ? "600" : "60" } : {}) } });
  } finally { release?.(); }
}
