import { evaluateCase } from '../evaluation/evaluate.mjs';
export function evaluateDependencies(c, output) {
  const score = evaluateCase(c, output);
  if (!score.returned) return score;
  const key = rows => rows.map(r=>JSON.stringify(r)).sort();
  const exactDependencies = JSON.stringify(key(output.dependencies.map(d=>[d.fromId,d.toId,d.kind]))) === JSON.stringify(key(c.expected.typedDependencies));
  return {...score, semantic: score.semantic && exactDependencies, checks:{...score.checks,exactDependencies}};
}
