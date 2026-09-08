import { ArrowRight } from "lucide-react";

export function ActionArrow({ compact = false }: { compact?: boolean }) {
  return <span className={`action-orb${compact ? " action-orb-small" : ""}`} aria-hidden="true"><ArrowRight size={compact ? 14 : 19} strokeWidth={1.7} /></span>;
}
