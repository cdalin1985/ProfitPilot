import { LockKeyhole } from "lucide-react";

import type { ContentReview } from "@profit-pilot/contracts";

interface ArticleCanvasProps {
  content: ContentReview;
}

export function ArticleCanvas({ content }: ArticleCanvasProps): React.ReactNode {
  return (
    <article className="mx-auto w-full max-w-[760px] px-5 py-5 sm:px-8">
      <div
        className="flex items-start gap-3 rounded-lg border border-amber-300 bg-warning-surface px-4 py-3 text-sm leading-5"
        id="disclosure"
      >
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <p>{content.disclosure}</p>
      </div>
      <div className="py-8">
        <h1 className="text-3xl font-semibold leading-[1.12] tracking-[-0.04em] sm:text-[36px]">
          {content.title}
        </h1>
        <p className="mt-3 text-[17px] leading-7 text-foreground/88" id="introduction">
          {content.introduction}
        </p>
        <section className="mt-8" id="top-pick">
          <h2 className="text-[28px] font-semibold tracking-[-0.035em]">Top pick</h2>
          <h3 className="mt-3 text-xl font-semibold" id="northline">
            Northline Thermal Mug
          </h3>
          <dl className="mt-4 flex flex-wrap divide-x text-sm">
            <div className="pr-5">
              <dt className="text-xs text-muted-foreground">Price observed</dt>
              <dd className="mt-1 font-mono">$34.00 · Jul 27, 2026</dd>
            </div>
            <div className="px-5">
              <dt className="text-xs text-muted-foreground">Commission</dt>
              <dd className="mt-1 font-mono">8.0%</dd>
            </div>
            <div className="pl-5">
              <dt className="text-xs text-muted-foreground">Merchant</dt>
              <dd className="mt-1 text-information">Northline</dd>
            </div>
          </dl>
          <div className="mt-6 space-y-3 text-[17px] leading-7 text-foreground/88">
            <p>
              According to the merchant specifications, the Northline Thermal Mug combines
              double-wall vacuum insulation with a leak-resistant lid and a cup-holder-friendly
              shape.
            </p>
            <p
              aria-describedby="selected-claim-help"
              className="rounded border border-primary bg-orange-50/45 px-2 py-1 ring-1 ring-primary/20"
            >
              {content.selectedClaim}
            </p>
            <span className="sr-only" id="selected-claim-help">
              This claim is selected. Supporting evidence is shown in the review inspector.
            </span>
            <p>
              The push-button lid is designed for one-handed operation and locks to help prevent
              spills while commuting.
            </p>
          </div>
          <h4 className="mt-5 text-sm font-semibold">Key specifications</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6">
            <li>Capacity: 16 ounces</li>
            <li>Material: 18/8 stainless steel</li>
            <li>Insulation: Double-wall vacuum</li>
            <li>Lid: Push-button, lockable</li>
            <li>Dishwasher safe: Merchant reports yes</li>
          </ul>
        </section>
      </div>
    </article>
  );
}
