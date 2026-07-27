import type { Metadata } from "next";

import { ModulePage } from "@/components/module-page";

export const metadata: Metadata = { title: "Calendar" };

const schedule = [
  {
    date: "Jul 28",
    time: "9:00 AM",
    title: "65W Travel Charger Buying Guide",
    state: "Awaiting publication",
  },
  {
    date: "Jul 29",
    time: "10:30 AM",
    title: "Running Watch Comparison Guide",
    state: "Editorial review",
  },
  {
    date: "Jul 31",
    time: "8:00 AM",
    title: "Travel Accessories Roundup",
    state: "Draft",
  },
] as const;

export default function CalendarPage(): React.ReactNode {
  return (
    <ModulePage
      description="Coordinate editorial review, destination schedules, and quiet hours in US Editorial time."
      title="Calendar"
    >
      <ol className="border-y">
        {schedule.map((item) => (
          <li
            className="grid min-h-24 grid-cols-[90px_90px_1fr] items-center gap-4 border-b px-3 last:border-b-0"
            key={item.title}
          >
            <span className="font-mono text-sm font-semibold">{item.date}</span>
            <span className="font-mono text-xs text-muted-foreground">{item.time}</span>
            <span>
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.state}</span>
            </span>
          </li>
        ))}
      </ol>
    </ModulePage>
  );
}
