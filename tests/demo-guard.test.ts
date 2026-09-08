import { afterEach, expect, it, vi } from 'vitest';
import { createDemoGate, checkDemoInput } from '../src/lib/demo-guard';
import { demoInput } from '../src/lib/demo';
afterEach(() => vi.unstubAllEnvs());
it('leaves local planning unrestricted when demo mode is off', () => {
  const gate = createDemoGate();
  for (let i=0;i<100;i++) gate.enter({})();
});
it('fails closed until public generation is explicitly enabled', () => {
  expect(() => createDemoGate().enter({ WHITESPACE_DEMO_MODE:'true' })).toThrow(/暂未开放/);
});
it('accepts at most two concurrent public requests and releases once', () => {
  const gate=createDemoGate();const env={WHITESPACE_DEMO_MODE:'true',WHITESPACE_DEMO_ENABLED:'true'};
  const release=gate.enter(env);gate.enter(env);
  expect(()=>gate.enter(env)).toThrow(/繁忙/);release();release();gate.enter(env);
  expect(()=>gate.enter(env)).toThrow(/繁忙/);
});
it('counts completed and failed attempts against the shared instance allowance', () => {
  let now=0;const gate=createDemoGate(()=>now);const env={WHITESPACE_DEMO_MODE:'true',WHITESPACE_DEMO_ENABLED:'true'};
  for(let i=0;i<10;i++)gate.enter(env)();
  expect(()=>gate.enter(env)).toThrow(/额度/);now=600_000;expect(()=>gate.enter(env)()).not.toThrow();
});
it('applies an input budget to public generation while accepting the built-in demo', () => {
  expect(()=>checkDemoInput(demoInput,{WHITESPACE_DEMO_MODE:'true'})).not.toThrow();
  expect(()=>checkDemoInput({...demoInput,success:'字'.repeat(1001)},{WHITESPACE_DEMO_MODE:'true'})).toThrow(/内容/);
  expect(()=>checkDemoInput({...demoInput,success:'字'.repeat(1001)},{})).not.toThrow();
});
it('rejects too many rows and oversized individual fields', () => {
  const env={WHITESPACE_DEMO_MODE:'true'};
  for(const requirements of [Array.from({length:31},(_,i)=>({...demoInput.requirements[0],id:String(i)})),[{...demoInput.requirements[0],name:'字'.repeat(121)}],[{...demoInput.requirements[0],desc:'字'.repeat(1201)}]]) {
    expect(()=>checkDemoInput({...demoInput,requirements},env)).toThrow(/内容/);
  }
});
it('rejects the aggregate budget even when each field is acceptable', () => {
  const requirements=Array.from({length:30},(_,i)=>({...demoInput.requirements[0],id:String(i),desc:'字'.repeat(1000)}));
  expect(()=>checkDemoInput({...demoInput,requirements},{WHITESPACE_DEMO_MODE:'true'})).toThrow(/内容/);
});
