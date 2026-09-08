import { WhiteSpaceError } from './input';
import type { Dependency } from './contracts';

type Clause = { text: string; condition: string; certainty: 'explicit' | 'uncertain' | 'related' };
const cue = /依赖|前置|先决|取决于|是否需要|(?:必须|需要|须|需)(?:等待|先)|必须在.+后|只有.+才|(?:完成|通过|批准|授权)(?:之)?后.{0,30}(?:才|可|能|执行|运行|生成)|先.+再/;
const uncertain = /可能|或许|尚未|未确认|待确认|未知|是否|未指明|不明确|不清楚|不确定/;
const nonblocking = /不依赖|无需|无须|不必|不需要|可(?:以)?独立|可以在|可选择|可选|建议在/;
const start = /可能|或许|尚未|未确认|待确认|未知|是否|未指明|不明确|不清楚|不确定|不依赖|无需|无须|不必|不需要|可(?:以)?独立|可以在|可选择|可选|建议在|依赖|前置|先决|取决于|必须|需要等待|须先|需先|只有|先/;
export function dependencyClauses(description: string): Clause[] {
  return description.split(/[；;。！？!?\n\r]+|[，,](?:但是|但|而是)|[，,](?=(?:依赖|必须|只有|不依赖|无需))/).map(s=>s.trim()).filter(Boolean).map(text=>({text, condition:text.slice(text.search(start) < 0 ? 0 : text.search(start)),
    certainty: !cue.test(text) ? 'related' : uncertain.test(text) ? 'uncertain' : nonblocking.test(text) ? 'related' : 'explicit',
  }));
}
export function validateDependencies(description: string, dependencies: Dependency[]): void {
  const clauses=dependencyClauses(description);
  const error=(message:string):never=>{throw new WhiteSpaceError('INVALID_DEPENDENCY',message,502);};
  const covered=new Set<Clause>();
  for(const dep of dependencies){
    if(!description.includes(dep.quote))error('依赖依据必须来自本条需求说明，不能来自名称或其他需求。');
    const matches=clauses.filter(c=>c.certainty!=='related'&&dep.quote.includes(c.condition));
    if(!matches.length)error('依赖依据须包含完整的前置条件语句；仅有关联、否定或可选执行不能作为依赖。');
    if(dep.kind==='explicit'&&matches.some(c=>c.certainty==='uncertain'))error('尚未确认的前置条件必须标为 uncertain，不能作为明确依赖。');
    matches.forEach(c=>covered.add(c));
  }
  for(const clause of clauses)if(clause.certainty!=='related'&&!covered.has(clause))error('说明中的前置条件被遗漏，请逐条核对完整条件；对象无法确定时标为 uncertain。');
}
