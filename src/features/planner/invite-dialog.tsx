"use client";
import { useEffect, useRef, useState } from 'react';
export function InviteDialog({ close, verified }: { close: () => void; verified: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => pending.current?.abort(); }, []);
  async function submit() {
    if (pending.current || !code.trim()) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }), signal: controller.signal, cache: 'no-store' });
      if (response.status === 429) throw new Error('验证过于频繁，请十分钟后再试。');
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.verified !== true) throw new Error(data?.error?.message || '验证暂不可用，请稍后再试。');
      setCode(''); verified();
    } catch (caught) { if (dialog.current?.open) setError(controller.signal.aborted ? '验证超时，请检查网络后重试。' : caught instanceof Error ? caught.message : '验证失败，请重试。'); }
    finally { clearTimeout(timeout); pending.current = null; setBusy(false); }
  }
  return <dialog ref={dialog} className="guide-dialog invite-dialog" aria-labelledby="invite-title" aria-describedby="invite-hint" onCancel={event => { event.preventDefault(); close(); }}>
    <h2 id="invite-title">邀请你，一起留白。</h2>
    <p id="invite-hint">AI 生成向受邀用户开放。验证后可继续生成，已填写的内容会保留。</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="form-field">邀请码<input autoFocus type="password" autoComplete="off" maxLength={128} required value={code} disabled={busy} onChange={event => setCode(event.target.value)} aria-invalid={!!error} aria-describedby={error ? 'invite-error' : undefined} /></label>
      {error && <p className="field-error" id="invite-error" role="alert">{error}</p>}
      <p className="field-hint">请向网站维护者获取邀请码。验证有效期为 24 小时。</p>
      <div className="step-actions"><button type="button" onClick={close}>暂不生成</button><button className="primary" disabled={busy || !code.trim()} type="submit">{busy ? '正在验证…' : '验证并继续生成'}</button></div>
    </form>
  </dialog>;
}
