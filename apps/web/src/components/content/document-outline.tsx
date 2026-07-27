import type { ContentReview } from "@profit-pilot/contracts";
import Link from "next/link";

interface DocumentOutlineProps {
  content: ContentReview;
}

export function DocumentOutline({ content }: DocumentOutlineProps): React.ReactNode {
  const outline = [
    "Introduction",
    "How we evaluated",
    "Top picks",
    "Buying guide",
    "Disclosure",
  ] as const;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Outline
        </h2>
        <nav aria-label="Document outline" className="mt-4">
          <ul className="space-y-1 text-sm">
            {outline.map((item, index) => (
              <li key={item}>
                <a
                  className={`focus-outline block rounded-md px-3 py-2 ${
                    index === 0 ? "bg-blue-50 font-medium text-information" : "hover:bg-muted"
                  }`}
                  href={index === 4 ? "#disclosure" : index === 2 ? "#top-pick" : "#introduction"}
                >
                  {item}
                </a>
                {index === 2 && (
                  <a
                    className="focus-outline ml-3 mt-1 block rounded-md px-3 py-2 text-information hover:bg-blue-50"
                    href="#northline"
                  >
                    <span aria-hidden="true" className="mr-2">
                      •
                    </span>
                    Northline Thermal Mug
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            Metadata
          </h2>
          <Link
            className="focus-outline rounded text-sm font-medium text-information hover:underline"
            href="/settings"
          >
            Edit
          </Link>
        </div>
        <dl className="mt-4 space-y-4 text-sm">
          {[
            ["Owner", content.owner],
            ["Locale", content.locale],
            ["Product", content.productName],
            ["Network", content.network],
            ["Destination", content.destination],
          ].map(([label, value]) => (
            <div className="grid grid-cols-[84px_1fr] gap-3" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
