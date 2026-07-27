import { cn } from "@/lib/utils";

interface ProfitPilotMarkProps {
  className?: string;
  compact?: boolean;
}

export function ProfitPilotMark({
  className,
  compact = false,
}: ProfitPilotMarkProps): React.ReactNode {
  return (
    <span className={cn("inline-flex items-center gap-3 text-current", className)}>
      <svg aria-hidden="true" className="size-7 shrink-0" viewBox="0 0 32 32" fill="none">
        <path
          d="M4.5 8.8 27.8 3.9c.9-.2 1.5.7 1 1.5L16.5 27.6c-.5.9-1.9.6-2-.4l-.8-8.4-7.5-3.7c-.9-.4-.7-1.8.3-2.1l12.7-3.8-9.6 6.2 5.8 2.9 7.8-9.1-9.5 7.7"
          fill="currentColor"
        />
      </svg>
      {!compact && (
        <span className="text-[22px] font-semibold tracking-[-0.035em]">Profit Pilot</span>
      )}
    </span>
  );
}
