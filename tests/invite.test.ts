import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueSession, requireInvite, sessionCookie, createAttemptGate, requireSameOrigin } from '../src/lib/invite';
import { POST as generate } from '../src/app/api/prioritize/route';
import { POST as verify } from '../src/app/api/invite/route';
import { demoInput } from '../src/lib/demo';
const env = { WHITESPACE_DEMO_MODE:'true', WHITESPACE_DEMO_ENABLED:'true', WHITESPACE_INVITE_CODES:'test-invitation-code-1234', WHITESPACE_SESSION_SECRET:'test-session-signing-secret-at-least-32-characters' };
const request=(cookie='',origin='https://app.test')=>new Request('https://app.test/api/prioritize',{method:'POST',headers:{origin,cookie},body:JSON.stringify(demoInput)});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('invitation access boundary',()=>{
 it('requires a session in public demo and fails closed if configuration is missing',()=>{
  expect(()=>requireInvite(request(),env)).toThrow(/邀请码/);
  expect(()=>requireInvite(request(),{...env,WHITESPACE_INVITE_CODES:''})).toThrow(/暂不可用/);
 });
 it('accepts a signed session until expiry and rejects tampering and future dates',()=>{
  const token=issueSession(env.WHITESPACE_INVITE_CODES,env,1000);
  expect(()=>requireInvite(request(sessionCookie(token)),env,1001)).not.toThrow();
  expect(()=>requireInvite(request(sessionCookie(token)),env,1000+86400)).toThrow();
  expect(()=>requireInvite(request(sessionCookie(token+'x')),env,1001)).toThrow();
  expect(()=>requireInvite(request(sessionCookie(token)),env,999)).toThrow();
 });
 it('revokes existing sessions when their code or signing key changes',()=>{
  const token=issueSession(env.WHITESPACE_INVITE_CODES,env);
  expect(()=>requireInvite(request(sessionCookie(token)),{...env,WHITESPACE_INVITE_CODES:'replacement-test-code-12345'})).toThrow();
  expect(()=>requireInvite(request(sessionCookie(token)),{...env,WHITESPACE_SESSION_SECRET:'replacement-signing-secret-at-least-32-characters'})).toThrow();
 });
 it('rejects foreign and missing origins on protected POSTs',()=>{
  expect(()=>requireSameOrigin(request('', 'https://evil.test'))).toThrow();
  expect(()=>requireSameOrigin(new Request('https://app.test/api/invite'))).toThrow();
 });
 it('accepts the browser-facing Host when Next uses an internal hostname',()=>{
  expect(()=>requireSameOrigin(new Request('http://localhost:3100/api/invite',{headers:{host:'127.0.0.1:3100',origin:'http://127.0.0.1:3100'}}))).not.toThrow();
 });
 it('uses an HttpOnly, Secure, same-site cookie with a one-day lifetime',()=>{
  expect(sessionCookie('signed')).toContain('HttpOnly; Secure; SameSite=Strict');
  expect(sessionCookie('signed')).toContain('Max-Age=86400');
  expect(sessionCookie('signed')).not.toContain('Domain=');
 });
 it('bounds guesses per client, total attempts, and resets after the window',()=>{
  let time=0;const gate=createAttemptGate(()=>time);
  for(let i=0;i<5;i++)gate.enter('a');expect(()=>gate.enter('a')).toThrow(/频繁/);
  gate.enter('b');time=600001;expect(()=>gate.enter('a')).not.toThrow();
  for(let i=0;i<59;i++)gate.enter(String(i));expect(()=>gate.enter('new')).toThrow();
 });
 it('never calls the provider for an unauthenticated direct request',async()=>{
  Object.entries(env).forEach(([k,v])=>vi.stubEnv(k,v));const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await generate(request());expect(response.status).toBe(401);expect(fetcher).not.toHaveBeenCalled();
 });
 it('verifies a code without returning or logging it, and rejects oversized streamed bodies',async()=>{
  Object.entries(env).forEach(([k,v])=>vi.stubEnv(k,v));
  const post=(body:string)=>verify(new Request('https://app.test/api/invite',{method:'POST',headers:{origin:'https://app.test','content-type':'application/json'},body}));
  const bad=await post(JSON.stringify({code:'wrong'}));expect(bad.status).toBe(401);
  const ok=await post(JSON.stringify({code:env.WHITESPACE_INVITE_CODES}));expect(ok.status).toBe(200);
  expect(ok.headers.get('set-cookie')).toContain('HttpOnly');expect(await ok.text()).not.toContain(env.WHITESPACE_INVITE_CODES);
  expect((await post('x'.repeat(1025))).status).toBe(413);
 });
});
