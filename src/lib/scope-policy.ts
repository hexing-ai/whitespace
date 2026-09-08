import { WhiteSpaceError } from './input';
import type { Goal, GoalLink, RequirementIn, ScopeKind } from './contracts';

const kinds:ScopeKind[]=['core','operation','presentation','incentive','audience','extension'];
const patterns={
  incentive:/优惠券|代金券|抵用券|折扣|返现|奖励|积分|赠品|红包|发券/g,
  audience:/中英|中文和英文|英文|英语|日语|西班牙语|法语|德语|多语言|双语|外语|外籍|其他语言|扩大.{0,4}(?:受众|人群)/g,
  extension:/排行|大屏|大盘|站内信列表|消息中心|推广海报/g,
};
type Expansion=keyof typeof patterns;
const expansions:Expansion[]=['incentive','audience','extension'];
const clauses=(value:string)=>value.split(/[；;。！？!?，,\n\r]+|但是|但/).map(s=>s.trim()).filter(Boolean);
export const goalActions=clauses;
function affirmative(clause:string,index:number){
  return !/(?:不(?:发放|发|做|提供|支持|增加|启用|含|需要|扩大)?|无需|无须|禁止|取消|暂缓|不再).{0,8}$/.test(clause.slice(0,index));
}
function mentions(value:string,kind:Expansion,behaviorOnly=false){
  return clauses(value).some(text=>{
    const clause=text.replace(/只有.+?才(?:能|可)?/g,'').replace(/(?:必须|需要|须|需)在.+?(?:完成|通过|批准|授权)(?:之)?后/g,'');
    if(behaviorOnly&&!/同时|并且|另外|另行/.test(clause)&&
      (/(?:通知|提醒|导出|核对).{0,24}(?:结果|记录)|(?:结果|记录).{0,12}(?:通知|提醒|导出)/.test(clause)||
       /(?:调整|修改|设置|更换).{0,24}(?:字号|间距|配色|字体|排版)/.test(clause)))return false;
    return [...clause.matchAll(patterns[kind])].some(m=>affirmative(clause,m.index!));
  });
}
export function positiveQuote(goal:string,quote:string){
  return clauses(goal).some(clause=>{
    const index=clause.indexOf(quote);return index>=0&&affirmative(clause,index)&&!/不做|不发|不提供|不支持|无需|禁止|取消|暂缓/.test(quote);
  });
}
function fail(message:string):never{throw new WhiteSpaceError('INVALID_SCOPE',message,502);}
function meaningfulOverlap(action:string,source:string){
  const content=action.replace(/^.*?能(?:够)?/,'').replace(/用户|客户|访客|运营|编辑|员工|管理员|商家|需要|进行|实现|可以|能够|完成|执行|支持|本期|服务|功能|当前|是否|尚未|确认/g,'');
  return Array.from({length:Math.max(0,content.length-1)},(_,i)=>content.slice(i,i+2)).some(token=>!/[\s，,；;。]/.test(token)&&source.includes(token));
}
function helperTopic(original:string){
  for(const clause of clauses(original)){
    if(/同时|并且|另外|另行/.test(clause))continue;
    if(/(?:通知|提醒|导出|核对).{0,24}(?:结果|记录)|(?:结果|记录).{0,12}(?:通知|提醒|导出)/.test(clause)){
      if(/(?:结果|记录).{0,12}(?:通知|提醒|导出)/.test(clause))return clause.split(/结果|记录/)[0];
      return clause.replace(/^(?:.*?)(?:通知|提醒|导出|核对)/,'').replace(/(?:结果|记录).*$/,'')||clause.split(/结果|记录/)[0];
    }
    const match=clause.match(/^(?:执行)?(?:校验|核对|检查)(.+)/);if(match)return match[1];
  }
  return null;
}
function literal(value:string){
  const languages:Record<string,string>={中文:'zh',英文:'en',英语:'en',日文:'ja',日语:'ja',法语:'fr',西班牙语:'es',德语:'de'};
  return value.replace(/\s/g,'').replace(/中英文?/g,'中文和英文')
    .replace(/(中文|英文|英语|日文|日语|法语|西班牙语|德语)(?:和|与)(中文|英文|英语|日文|日语|法语|西班牙语|德语)/g,(_m,a,b)=>`语种[${[languages[a],languages[b]].sort().join('+')}]`)
    .replace(/(语种\[[a-z+]+\])切换/g,'切换$1');
}
function literalCapability(goal:string,description:string){
  const normalized=literal(goal),match=normalized.match(/^(.*?)能(?:够)?(.+)$/);
  const actor=match?.[1]||'',action=match?.[2]||normalized;
  return clauses(description).some(text=>{
    const clause=literal(text);
    return clause===action||clause===`${actor}${action}`||
      (action.startsWith('切换语种[')&&clause.endsWith(action)&&positiveQuote(clause,action));
  });
}
export function applyScopePolicy(source:RequirementIn,scope:unknown,links:GoalLink[],goals:Goal[],strict:boolean){
  if(scope===undefined&&!strict)return {links,scopeKinds:[] as ScopeKind[]};
  if(!kinds.includes(scope as ScopeKind))fail('每条需求须提供有效scope：直接能力、操作辅助、呈现改善、新增激励、扩大受众或其他扩展。');
  const original=source.desc.trim()||source.name;
  const detected=expansions.filter(kind=>mentions(original,kind,true));
  const directGoals=goals.flatMap(g=>goalActions(g.text).filter(action=>positiveQuote(g.text,action)&&literalCapability(action,original)).map(action=>({goalId:g.id,kind:'required' as const,quote:source.desc||source.name,goalAction:action})));
  const topic=!detected.length?helperTopic(original):null;
  const helperGoals=topic?goals.flatMap(g=>goalActions(g.text).filter(action=>positiveQuote(g.text,action)&&meaningfulOverlap(action,topic)).map(action=>({goalId:g.id,kind:'supporting' as const,quote:source.desc,goalAction:action}))):[];
  if(helperGoals.length)scope='operation';
  const restrictions=expansions.filter(kind=>scope===kind||detected.includes(kind));
  const directByGoal=new Map(directGoals.map(g=>[g.goalId,g]));
  const supplemented=[...links.map(l=>directByGoal.get(l.goalId)||l),...directGoals.filter(g=>!links.some(l=>l.goalId===g.goalId)),...helperGoals.filter(g=>!links.some(l=>l.goalId===g.goalId)&&!directByGoal.has(g.goalId))];
  const accepted=supplemented.filter(link=>{
    const goal=goals.find(g=>g.id===link.goalId)!;
    const action=link.goalAction;
    if(typeof action!=='string'||action.trim().length<2||!goal.text.includes(action))fail('目标依据goalAction须为对应成功标准中可核对的具体动作原文。');
    const positive=positiveQuote(goal.text,action);
    if(link.kind==='required'&&!meaningfulOverlap(action,`${source.name} ${original}`))fail('required目标动作未在本条需求中找到对应依据，不能引用另一项的能力或把前置工作直接当作目标动作。');
    const permitted=positive&&restrictions.every(kind=>mentions(action,kind)||
      (kind==='extension'&&!mentions(original,kind)&&action.length>=2&&original.includes(action)));
    if(restrictions.length){
      if(link.kind==='required'&&!permitted)fail('新增业务范围的required缺少成功标准明示依据；请核对目标，不能把同流程或否定要求当作授权。');
      if(link.kind!=='required'){
        if(permitted)fail('成功标准已明确要求该扩展能力，请核对其直接required关系，不能作为普通辅助而忽略目标。');
        return false;
      }
    }else{
      if(!positive)fail('目标依据不能把否定要求作为正向能力，请选择目标中的实际动作。');
      if(link.kind==='supporting'&&scope!=='operation')fail('supporting必须对应operation操作辅助，请核对本条实际行为。');
      if(link.kind==='optional'&&scope!=='presentation')fail('optional必须对应presentation呈现改善，请核对本条实际行为。');
    }
    return true;
  });
  return {links:accepted,scopeKinds:[...new Set([scope as ScopeKind,...restrictions])]};
}
export function scopeReason(kinds:ScopeKind[]=[]){
  const labels={incentive:'新增激励',audience:'扩大语言或受众覆盖',extension:'额外业务范围'};
  const scopes=expansions.filter(k=>kinds.includes(k));
  return scopes.length?`这项工作涉及${scopes.map(k=>labels[k]).join('、')}，当前未找到成功标准明确要求它的依据，也未被识别为必要前置，这期不做。`:null;
}
