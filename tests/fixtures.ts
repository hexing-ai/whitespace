import { demoInput } from "../src/lib/demo";
import { parseResult, type GoalLink } from "../src/lib/schema";
export function modelResult() {
  return {
    items: demoInput.requirements.map((r,i)=>({id:r.id,estimateDays:r.estimateDays ?? 1,
      links: i<3?[{goalId:`g${i+1}`,kind:'required' as GoalLink['kind'],quote:r.desc}]:[3,4,11].includes(i)?[{goalId:'g2',kind:'supporting' as GoalLink['kind'],quote:r.desc}]:i===5?[{goalId:'g1',kind:'optional' as GoalLink['kind'],quote:r.desc}]:[],
      dependencies:i===2?[{toId:'r2' as string|null,kind:'explicit' as 'explicit'|'uncertain',quote:r.desc}]:[],
    })),
    goalGaps:[] as {goalId:string;kind:'missing'|'uncertain';missingAction?:string}[],
  };
}
export function validOutput() { return parseResult(JSON.stringify(modelResult()), demoInput); }
export function completion(content = JSON.stringify(modelResult())) {
  try {
    const data=JSON.parse(content);
    if(Array.isArray(data.items)){
      const scopes=['core','core','core','operation','operation','presentation','extension','incentive','audience','extension','extension','operation'];
      const goals=demoInput.success.split('、');
      data.items=data.items.map((r:{id:string;scope?:string;links:{goalId:string;goalAction?:string}[]})=>({...r,scope:r.scope??scopes[demoInput.requirements.findIndex(d=>d.id===r.id)]??'core',links:r.links.map(l=>({...l,goalAction:l.goalAction??goals[Number(l.goalId.slice(1))-1]}))}));
      content=JSON.stringify(data);
    }
  }catch{}
  return { id: "unit-test", object: "chat.completion", created: 1, model: "qwen-plus", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } };
}
