import { Check, CircleHelp, Copy, TriangleAlert } from "lucide-react";
import type { Moscow, PrioritizeInput, PrioritizeOutput } from "@/lib/contracts";

const sections: { key: Moscow; title: string; hint: string }[] = [
  { key: "must", title: "这期必须做", hint: "本期承诺 · 最多 3 条" },
  { key: "should", title: "应该做", hint: "待讨论，非本期承诺" },
  { key: "could", title: "可以做", hint: "可讨论的改善，非本期承诺" },
  { key: "wont", title: "这期明确不做", hint: "这期排除 · 不是永远不做" },
];
const goalStatus = { committed: "已对应到承诺", candidate: "仅候选覆盖", blocked: "缺少必要工作", missing: "清单存在缺口", needs_confirmation: "待确认", conflict: "目标冲突" };

const relationLabel = { required: "直接必要", supporting: "操作辅助", optional: "呈现改善" };
type Props = { view?: "scope" | "evidence" | "note"; input: PrioritizeInput; result: PrioritizeOutput; note: string; copyStatus: string; copy: () => void; setNote: (value: string) => void; setCopyStatus: (value: string) => void };
export function PlanResults({ view = "scope", input, result, note, copyStatus, copy, setNote, setCopyStatus }: Props) {
  const nameFor = (id: string) => input.requirements.find(row => row.id === id)?.name || id;
  const conflictMessages = result.goalConflicts.map(conflict => conflict.message);
  const unmet = [...new Set(result.unmetSuccess)].filter(message => !conflictMessages.includes(message));
  const warnings = [...new Set(result.warnings)].filter(message => !conflictMessages.includes(message) && !unmet.includes(message));
  const confirmations = [...new Set(result.needsConfirmation)].filter(message => !warnings.includes(message) && !unmet.includes(message) && !conflictMessages.includes(message));
  return <>
    {view === "scope" && <>
            <div className="capacity-strip"><div><span>产能上限</span><strong>{result.capacityDays}<small>人天</small></strong></div><div><span>本期承诺</span><strong>{result.mustDays}<small>人天</small></strong></div><div className="remaining"><span>{result.feasibility === "feasible" ? "剩余缓冲内产能" : "部分候选人天"}</span><strong>{result.feasibility === "feasible" ? Number((result.capacityDays - result.mustDays).toFixed(6)) : result.candidateDays}<small>人天</small></strong></div></div>
            <div className={`feasibility ${result.feasibility}`} role="status"><span className="status-symbol" aria-hidden="true">{result.feasibility === "feasible" ? <Check size={20} /> : result.feasibility === "needs_confirmation" ? <CircleHelp size={20} /> : <TriangleAlert size={20} />}</span><div><strong>{result.feasibility === "feasible" ? "按当前范围，成功标准预计可达" : result.feasibility === "needs_confirmation" ? "前置条件待确认，当前不形成承诺" : "当前约束下无法达成成功标准"}</strong>{result.feasibility === "feasible" ? <p>必要性与人天估算，请在会中核实。</p> : <><p>当前无本期承诺。请核对原因，调整输入后重新生成。</p><ul>{unmet.map((item, i) => <li key={i}>{item}</li>)}</ul></>}</div></div>
            {result.goalConflicts.length > 0 && <section className="goal-conflicts" aria-label="目标冲突"><h3>目标冲突</h3><ul>{result.goalConflicts.map(c => <li key={c.goalId}>{c.message}</li>)}</ul></section>}
            {warnings.length > 0 && <div className="warnings"><strong>需要留意</strong><ul>{warnings.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
            {confirmations.length > 0 && <section className="warnings" aria-label="待确认事项"><h3>待确认事项</h3><ul>{confirmations.map((message, i) => <li key={i}>{message}</li>)}</ul><p>请将核实的信息补充到需求说明，再重新生成。</p></section>}
            {result.feasibility !== "feasible" && <section className="candidate-panel" aria-label="部分工作候选"><h3>部分工作候选 <span>非本期承诺</span></h3><p>{result.candidates.length ? result.candidates.map(r => `${r.name}（${r.estimateDays} 人天）`).join("、") : "当前没有符合产能与前置条件的部分工作候选。"}</p><small>候选已计入明确的前置工作；不代表完整目标能交付，也不是唯一或最优方案。</small></section>}
            <div className="groups">{sections.map(({ key, title, hint }) => {
              const heading = <><div><h3>{title}</h3><p>{hint}</p></div><span className="group-count">{result[key].length} 项</span></>;
              const rows = result[key].length ? result[key].map(row => <article className="result-card" key={row.id}><div><h4>{row.name}</h4>{input.requirements.find(r => r.id === row.id)?.excluded && <small className="excluded-tag">用户明确排除</small>}<span>{row.estimateDays} 人天</span></div><p>{row.reason}</p></article>) : <p className="group-empty">本组暂无需求</p>;
              return <section className={`group ${key}`} key={key} aria-label={title}>{key === "must" ? <><div className="group-heading">{heading}</div>{rows}</> : <details><summary className="group-heading">{heading}<span className="disclosure" aria-hidden="true">＋</span></summary>{rows}</details>}</section>;
            })}</div>
    </>}
    {view === "evidence" && <section className="coverage-panel" aria-label="成功标准对应"><h3>成功标准对应</h3><p>依据来自输入原文，对应关系由模型识别，请在会中核实。</p>{result.goalCoverage.map(goal => <details key={goal.id}><summary><span>{goal.text}</span><strong>{goalStatus[goal.status]}</strong></summary><p>必要工作：{goal.requiredIds.map(id => nameFor(id)).join("、") || "尚未找到完整对应"}</p>{goal.missingIds.length > 0 && <p>未纳入工作：{goal.missingIds.map(nameFor).join("、")}</p>}{goal.evidence.map((e,i) => <blockquote key={i}>{relationLabel[e.kind]} · 「{nameFor(e.requirementId)}」的输入：{e.quote}{e.goalAction && <><br />对应目标原文：{e.goalAction}</>}</blockquote>)}</details>)}{result.dependencies.length > 0 && <details><summary>前置条件与依据</summary>{result.dependencies.map((dep,i)=><p key={i}>{nameFor(dep.fromId)} 依赖 {dep.toId ? nameFor(dep.toId) : "外部条件"}（{dep.kind === "explicit" ? "明确前置" : "待确认"}）<br />输入原文：{dep.quote}</p>)}</details>}</section>}
    {view === "note" && <section className="meeting"><div className="section-heading"><button type="button" onClick={copy}><Copy size={17} aria-hidden="true" />复制结论</button></div><p className="copy-status" role="status">{copyStatus || "可编辑后复制到会议记录或群聊。"}</p><textarea aria-label="会议结论" value={note} onChange={(e) => { setNote(e.target.value); setCopyStatus(""); }} rows={10} /></section>}
  </>;
}
