# Visual verification

## Accepted references

- `overview-concept.png`
- `content-review-concept.png`
- `DESIGN_SYSTEM.md`

The concepts define composition, hierarchy, spacing, color, information density, and interaction intent. The implementation uses one canonical Profit Pilot mark and the overview concept's 268px desktop rail across all routes.

## Method and viewports

The running Next.js application was inspected and exercised in the in-app browser at:

- Desktop: 1536 × 1024 CSS pixels.
- Mobile: 390 × 844 CSS pixels.

Rendered evidence:

- `implementation-overview.png`
- `implementation-content-review.png`
- `implementation-overview-mobile.png`
- `implementation-content-review-mobile.png`

The accepted references and rendered evidence were also opened directly for visual comparison.

## Comparison points

- Shell: navy rail, orange brand action, white content surface, sticky utility header, selected-navigation state, workspace context, notification/profile controls.
- Overview: title/action hierarchy, four-metric band, opportunity density, product images, score/commission/freshness hierarchy, five-item queue, and editorial pipeline.
- Review: content breadcrumb/title/status/actions, five-stage workflow, outline/metadata column, disclosure treatment, claim selection, validation checks, evidence, comments, and publishing gate.
- Responsive behavior: mobile rail drawer, two-column metric band, horizontal data table and workflow stepper, document-outline drawer, and review-inspector drawer.
- Accessibility: landmark/nav labels, heading hierarchy, button/link names, disabled states, dialog names, live status changes, keyboard-capable primitives, and reduced-motion behavior.

## Interaction evidence

- Create-content dialog opens with a product control.
- Opportunity View and overflow actions open the same details sheet.
- Approval changes status and advances the workflow.
- Approval does not fabricate publication; it exposes the WordPress connection gate.
- Open comments selects the Comments tab.
- A valid change reason enables submission and records the local changes-requested state.
- Mobile navigation, document outline, and review checks open as accessible dialogs.
- Overview, opportunities, content, calendar, publications, analytics, integrations, settings, and help routes render with correct page titles and main landmarks.

## Copy differences from the concepts

- Product/network names were normalized to the supported initial scope: Awin and CJ Affiliate.
- Claims were rewritten as merchant-attributed statements. First-hand testing language and absolute spill-prevention wording were removed because no supporting evidence exists.
- WordPress publication copy now requires a verified destination instead of pretending a remote draft was created.
- Queue and notification text identifies account-required states without inventing connection or usage results.

## Intentional deviations

- The content-review concept's alternate logo treatment was replaced with the canonical brand mark used by the overview and design system.
- On narrow screens, dense tables and workflow stages scroll horizontally instead of collapsing or hiding data.
- The right review inspector and left outline become explicit mobile drawers so the article remains readable.
- Development-only operational fixtures are labeled through Settings and production code paths fail closed; the visual concepts themselves are not represented as live production data.

## Result

No blocking visual or interaction defects remained after the comparison pass. The opportunities table width, queue density, hero height, mobile metric label, and first-image loading behavior were adjusted based on the rendered evidence.
