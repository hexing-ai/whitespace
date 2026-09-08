import Planner from "@/features/planner/planner";

export default function Home() {
  return <Planner publicDemo={process.env.WHITESPACE_DEMO_MODE === "true"} brand={<div className="brand"><span className="brand-mark" aria-hidden="true" /><div><h1 tabIndex={-1}>留白 <span>WhiteSpace</span></h1><p>规划会上，画出这期边界。</p></div></div>} />;
}
