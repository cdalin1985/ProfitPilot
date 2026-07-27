import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface WorkflowStepperProps {
  current: "review" | "approved";
}

export function WorkflowStepper({ current }: WorkflowStepperProps): React.ReactNode {
  const steps = ["Brief", "Draft", "Validate", "Review", "Publish"] as const;
  const activeIndex = current === "review" ? 3 : 4;

  return (
    <ol aria-label="Content workflow" className="flex min-w-[620px] items-center px-6 py-4">
      {steps.map((step, index) => {
        const completed = index < activeIndex;
        const active = index === activeIndex;

        return (
          <li
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center text-sm",
              active ? "text-information" : "text-foreground",
            )}
            key={step}
          >
            <span
              className={cn(
                "mr-2 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                completed && "border-healthy text-healthy",
                active && "border-information bg-information text-white",
                !completed && !active && "border-border text-muted-foreground",
              )}
            >
              {completed ? <Check aria-hidden="true" className="size-4" /> : index + 1}
            </span>
            <span className={cn(active && "font-semibold")}>{step}</span>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-3 h-px min-w-4 flex-1 bg-border",
                  completed && "bg-healthy",
                  active && "bg-information",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
