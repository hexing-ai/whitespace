"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Ellipsis, Menu, X } from "lucide-react";
import { ActionArrow } from "./action-arrow";
import type { PrioritizeInput, PrioritizeOutput } from "@/lib/contracts";
import { demoInput } from "@/lib/demo";
import { requestPlan, PlannerApiError } from "./api";
import { PlanResults } from "./plan-results";
import { draftFrom, initialDraft, preferenceKey, serializeDraft, validateDraft, type Draft, type DraftRow, type FieldErrors } from "./form";

const CinematicHome = dynamic(() => import("../home/CinematicHome"), { ssr: false });

type View = "conditions" | "requirements" | "scope" | "evidence" | "note";
const navigation: { key: View; number: string; label: string; title: string; hint: string }[] = [
  { key: "conditions", number: "01", label: "规划条件", title: "规划条件", hint: "这期做什么，从成功标准开始。" },
  { key: "requirements", number: "02", label: "需求清单", title: "需求清单", hint: "写清实际能力与前置条件，让每项工作有清楚的边界。" },
  { key: "scope", number: "03", label: "范围结果", title: "这期的边界", hint: "核对本期承诺，以及暂不承诺的工作。" },
  { key: "evidence", number: "04", label: "原文依据", title: "原文依据", hint: "查看目标对应与前置条件，逐项核实判断依据。" },
  { key: "note", number: "05", label: "会议结论", title: "会议结论", hint: "核实后编辑，把清楚的范围带进会议记录。" },
];

export default function Planner({ brand, publicDemo = false }: { brand: ReactNode; publicDemo?: boolean }) {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [view, setView] = useState<View>("conditions");
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>(["r1"]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<PrioritizeOutput | null>(null);
  const [snapshot, setSnapshot] = useState<PrioritizeInput | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [copyStatus, setCopyStatus] = useState("");
  const active = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const guide = useRef<HTMLDialogElement>(null);
  const pendingField = useRef<string | null>(null);
  const step = navigation.find(item => item.key === view)!;

  useEffect(() => {
    let mounted = true;
    const version = revision;
    queueMicrotask(() => {
      if (!mounted) return;
      try { const skip = localStorage.getItem(preferenceKey) === "true"; setSkipIntro(skip); setStarted(skip); }
      catch { setPreferenceMessage("无法读取引导偏好，本次仍可正常使用。"); }
      setReady(true);
    });
    return () => { mounted = false; active.current?.abort(); version.current++; };
  }, []);
  useEffect(() => {
    if (started) { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
  }, [view, started]);
  useEffect(() => {
    if (pendingField.current) {
      const field = document.getElementById(pendingField.current);
      if (field) { field.focus(); pendingField.current = null; }
    }
  }, [fieldErrors, view, expanded]);

  function savePreference(value: boolean) {
    setSkipIntro(value);
    try {
      if (value) localStorage.setItem(preferenceKey, "true"); else localStorage.removeItem(preferenceKey);
      setPreferenceMessage(value ? "已设置：下次直接进入工作台。规划内容不会保存。" : "已设置：下次先显示使用引导。");
    } catch { setPreferenceMessage("浏览器未能保存引导偏好，本次仍可正常使用。"); }
  }
  function change(next: Draft) {
    if (active.current) return;
    revision.current++;
    setDraft(next); setResult(null); setSnapshot(null); setNote(""); setCopyStatus(""); setError(""); setRequestId(undefined); setFieldErrors({});
  }
  function navigate(next: View) { if (active.current) return; setView(next); setMenuOpen(false); if (next === view) { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); } }
  function enter(example: boolean) {
    if (example) { change(draftFrom(demoInput)); setExpanded([]); }
    setStarted(true); navigate("conditions");
  }
  function returnHome() {
    if (active.current) {
      active.current.abort(); active.current = null; setBusy(false);
      setError("已停止等待本次分析，输入内容已保留。可重新生成范围。");
    }
    setMenuOpen(false); setStarted(false); window.scrollTo({ top: 0, behavior: "instant" });
  }
  function startPlanning() {
    if (active.current) {
      active.current.abort(); active.current = null; setBusy(false);
      setError("已停止等待本次分析，输入内容已保留。可重新生成范围。");
    }
    navigate("conditions");
  }
  function fillDemo() { change(draftFrom(demoInput)); setExpanded([]); }
  function updateRow(id: string, field: keyof DraftRow, value: string | boolean) {
    change({ ...draft, requirements: draft.requirements.map(row => row.id === id ? { ...row, [field]: value } : row) });
  }
  function check(stage: "conditions" | "all") {
    const errors = validateDraft(draft, stage);
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (!first) return true;
    const conditions = ["success", "people", "workdays"].includes(first);
    setView(conditions ? "conditions" : "requirements");
    if (!conditions) {
      const row = draft.requirements.find(row => first === `name-${row.id}` || first === `estimate-${row.id}`);
      if (row) setExpanded(ids => [...new Set([...ids, row.id])]);
    }
    pendingField.current = first === "requirements" ? "add-requirement" : first;
    return false;
  }
  async function generate() {
    if (active.current || !check("all")) return;
    const submitted = serializeDraft(draft);
    const controller = new AbortController(); active.current = controller; revision.current++;
    setView("scope"); setMenuOpen(false); setBusy(true); setError(""); setResult(null); setSnapshot(null); setNote(""); setCopyStatus(""); setRequestId(undefined);
    try {
      const response = await requestPlan(submitted, controller.signal);
      if (controller.signal.aborted) return;
      setResult(response.plan); setSnapshot(submitted); setNote(response.plan.meetingNote); setRequestId(response.requestId);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试。");
      if (caught instanceof PlannerApiError) setRequestId(caught.requestId);
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function copy() {
    const version = revision.current;
    try { await navigator.clipboard.writeText(note); if (revision.current === version) setCopyStatus("已复制会议结论"); }
    catch { if (revision.current === version) setCopyStatus("复制失败，请选中下方会议结论并手动复制。"); }
  }
  function editNote(value: string) { revision.current++; setNote(value); setCopyStatus(""); }
  const feedback = (id: string) => fieldErrors[id] ? <p className="field-error" id={`error-${id}`}>{fieldErrors[id]}</p> : null;
  const accessibility = (id: string) => ({ id, "aria-invalid": !!fieldErrors[id], "aria-describedby": fieldErrors[id] ? `error-${id}` : undefined });
  const preference = <><label className="preference"><input type="checkbox" checked={skipIntro} onChange={event => savePreference(event.target.checked)} />下次直接进入工作台</label><p className="preference-message" role="status">{preferenceMessage}</p></>;
  const resultView = view === "scope" || view === "evidence" || view === "note";

  return <main className={`page-shell${ready && !started ? " home-shell" : ""}`}>
    {(!ready || started) && <header className="page-header">{brand}<nav className="header-actions" aria-label="产品导航"><button type="button" onClick={returnHome}>产品首页</button><button type="button" className="primary" onClick={startPlanning}>开始规划 <ActionArrow compact /></button><button type="button" className="workspace-help" onClick={() => guide.current?.showModal()}>使用说明</button></nav></header>}
    {!ready ? <p className="boot-state" role="status">正在准备工作台…</p> : !started ? <CinematicHome brand={brand} help={() => guide.current?.showModal()} enter={enter} /> : <div className="workspace">
    {publicDemo && <p className="demo-notice">公共演示使用共享额度，最多 30 条需求；请求繁忙时请稍后重试。请使用可公开的示例内容。</p>}
      <div className="mobile-nav"><span>{step.number} {step.label}</span><button disabled={busy} aria-expanded={menuOpen} aria-controls="planner-navigation" onClick={() => setMenuOpen(!menuOpen)}>目录 {menuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}</button></div>
      <nav id="planner-navigation" className={`directory${menuOpen ? " menu-open" : ""}`} aria-label="规划目录">{navigation.map(item => <button key={item.key} disabled={busy} aria-current={view === item.key ? "step" : undefined} onClick={() => navigate(item.key)}><span className="nav-number">{item.number}</span><span>{item.label}{["scope", "evidence", "note"].includes(item.key) && !result && <small>{busy ? "生成中" : "待生成"}</small>}</span></button>)}</nav>
      <section className="stage" aria-labelledby="stage-title" data-view={view}>
        <header className="stage-heading"><h2 id="stage-title" tabIndex={-1} ref={heading}>{step.title}</h2><p>{step.hint}</p></header>
        {view === "conditions" && <form className="editor-surface" noValidate onSubmit={event => { event.preventDefault(); if (check("conditions")) navigate("requirements"); }}>
          <div className="toolbar"><button type="button" onClick={fillDemo}>填入演示数据 <ArrowRight size={18} aria-hidden="true" /></button><details className="demo-options"><summary aria-label="示例选项" title="示例选项"><Ellipsis size={20} aria-hidden="true" /></summary><div><button type="button" onClick={event => { change({ ...draft, workdays: "3" }); event.currentTarget.closest("details")?.removeAttribute("open"); }}>把工期改成 3 天</button></div></details></div>
          <label className="form-field">成功标准<input {...accessibility("success")} aria-label="成功标准" required placeholder="做到什么，才算这期成功？" value={draft.success} onChange={event => change({ ...draft, success: event.target.value })} />{feedback("success")}<span className="field-hint">写清楚谁需要完成什么，多个目标可以用分号分开。</span></label>
          <label className="form-field">人数<input {...accessibility("people")} aria-label="人数" type="number" min={Number.MIN_VALUE} max={Number.MAX_SAFE_INTEGER} step="any" required value={draft.people} onChange={event => change({ ...draft, people: event.target.value })} />{feedback("people")}</label>
          <label className="form-field">这期工作日<input {...accessibility("workdays")} aria-label="这期工作日" type="number" min={Number.MIN_VALUE} max={Number.MAX_SAFE_INTEGER} step="any" required value={draft.workdays} onChange={event => change({ ...draft, workdays: event.target.value })} />{feedback("workdays")}</label>
          <p className="field-hint">产能上限 = 人数 × 工作日 × 70%，预留沟通与变动空间。</p>
          <div className="step-actions"><button type="submit" className="primary">下一步：需求清单 <ActionArrow /></button></div>
        </form>}
        {view === "requirements" && <form noValidate onSubmit={event => { event.preventDefault(); void generate(); }}>
          <div className="list-heading"><p>{draft.requirements.length} 项需求 · 预估人天可留空</p><button type="button" onClick={() => navigate("conditions")}>修改规划条件</button></div>
          <p className="exclusion-help">已确定不做的需求可勾选标记；若它是必要工作，系统会明确提示目标冲突。</p>
          <div className="requirements">{draft.requirements.map((row, index) => <section className={`requirement${row.excluded ? " is-excluded" : ""}`} key={row.id}>
            <button className="requirement-toggle" type="button" aria-expanded={expanded.includes(row.id)} aria-controls={`body-${row.id}`} onClick={() => setExpanded(ids => ids.includes(row.id) ? ids.filter(id => id !== row.id) : [...ids, row.id])}>
              <span className="row-number">{String(index + 1).padStart(2, "0")}</span><span className="row-title">{row.name || `待填写需求 ${index + 1}`}{row.excluded && <small className="excluded-tag">用户明确排除</small>}</span><span className="row-estimate">{row.estimate === "" ? "待估" : `${row.estimate} 人天`}</span><span aria-hidden="true">{expanded.includes(row.id) ? "−" : "＋"}</span>
            </button>
            {expanded.includes(row.id) && <div className="requirement-body" id={`body-${row.id}`}>
              <label className="form-field">需求名称<input {...accessibility(`name-${row.id}`)} aria-label={`需求 ${index + 1} 名称`} required value={row.name} onChange={event => updateRow(row.id, "name", event.target.value)} />{feedback(`name-${row.id}`)}</label>
              <label className="form-field">说明 <span className="optional">可选</span><input id={`desc-${row.id}`} aria-label={`需求 ${index + 1} 说明`} placeholder="描述实际提供的能力与前置条件" value={row.desc} onChange={event => updateRow(row.id, "desc", event.target.value)} /></label>
              <label className="form-field">预估人天 <span className="optional">可选</span><input {...accessibility(`estimate-${row.id}`)} aria-label={`需求 ${index + 1} 预估人天`} type="number" min={Number.MIN_VALUE} max={Number.MAX_SAFE_INTEGER} step="any" placeholder="留空，生成时暂估" value={row.estimate} onChange={event => updateRow(row.id, "estimate", event.target.value)} />{feedback(`estimate-${row.id}`)}</label>
              <label className="exclusion-label"><input type="checkbox" aria-label={`需求 ${index + 1} 本期明确不做`} checked={row.excluded} onChange={event => updateRow(row.id, "excluded", event.target.checked)} />本期明确不做</label>
              <button className="delete" type="button" aria-label={`删除需求 ${index + 1}`} onClick={() => { change({ ...draft, requirements: draft.requirements.filter(item => item.id !== row.id) }); setExpanded(ids => ids.filter(id => id !== row.id)); }}>删除这条需求</button>
            </div>}
          </section>)}</div>
          {feedback("requirements")}
          <button id="add-requirement" className="add-button" type="button" onClick={() => { const id = crypto.randomUUID(); change({ ...draft, requirements: [...draft.requirements, { id, name: "", desc: "", estimate: "", excluded: false }] }); setExpanded(ids => [...ids, id]); pendingField.current = `name-${id}`; }}>＋ 添加需求</button>
          <p className="ai-explain"><span>AI</span>AI 识别目标关系、前置条件并补充估值；系统依据产能与范围规则生成建议。</p>
          <div className="step-actions"><button type="button" onClick={() => navigate("conditions")}>上一步：规划条件</button><button className="primary" type="submit">生成这期范围 <ActionArrow /></button></div>
        </form>}
        {resultView && <div className="result-panel" aria-busy={busy}>
          {busy ? <div className="waiting-state" role="status"><div className="loading-lines" aria-hidden="true"><i /><i /><i /></div><h3>正在对照成功标准划定范围</h3><p>正在等待完整分析结果，请稍候。你填写的内容已保留。</p></div> : error ? <div className="failure-state"><div className="error" role="alert">{error}</div>{requestId && <p className="request-id">排查编号：{requestId}</p>}<p>输入内容已保留，可修改后重新生成。</p><div className="step-actions"><button onClick={() => navigate("requirements")}>返回修改需求</button><button className="primary" onClick={() => void generate()}>重新生成范围 <ActionArrow /></button></div></div> : result && snapshot ? <>
            <PlanResults input={snapshot} result={result} view={view} note={note} copyStatus={copyStatus} copy={copy} setNote={editNote} setCopyStatus={setCopyStatus} />
            <div className="step-actions"><button onClick={() => navigate(view === "note" ? "evidence" : view === "evidence" ? "scope" : "requirements")}>{view === "scope" ? "返回修改需求" : view === "evidence" ? "上一步：范围结果" : "上一步：原文依据"}</button>{view !== "note" && <button className="primary" onClick={() => navigate(view === "scope" ? "evidence" : "note")}>{view === "scope" ? "查看原文依据" : "编辑会议结论"} <ActionArrow /></button>}</div>
          </> : <div className="empty-state"><span className="empty-line" aria-hidden="true" /><h3>当前内容待生成</h3><p>填写或更新规划条件和需求清单后，再生成这期范围。</p><button className="primary" onClick={() => navigate("requirements")}>前往需求清单 <ActionArrow /></button></div>}
        </div>}
        <p className="privacy-note">当前内容仅保留在本页，刷新后会丢失。</p>
      </section>
    </div>}
    <dialog ref={guide} className="guide-dialog" aria-labelledby="guide-title"><h2 id="guide-title">从成功标准开始</h2><p><strong>准备：</strong>填写人数、工作日和至少两条需求；人天不确定，可以留空。</p><p><strong>生成：</strong>AI 识别目标与需求的关系和前置条件，系统计算符合约束的范围。</p><p><strong>核对：</strong>查看承诺与冲突，展开原文依据，编辑并复制会议结论。</p><p>AI 提供建议，取舍由你确认。切换目录或返回首页会保留当前内容；修改规划输入后需要重新生成。分析期间返回首页或开始规划会停止本页等待。刷新后规划内容不会保留。</p>{ready && preference}<p className="font-credit">展示页字体：<a href="https://www.onlinewebfonts.com/fonts" target="_blank" rel="noreferrer">Web Fonts</a></p><button className="primary" onClick={() => guide.current?.close()}>返回{started ? "规划" : "引导"}</button></dialog>
  </main>;
}
