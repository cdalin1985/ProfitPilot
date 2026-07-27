# Profit Pilot interface specification

This file locks the initial product interface to the approved dashboard and content-review concepts:

- `overview-concept.png`
- `content-review-concept.png`

The generated images are design references only. All application text, controls, tables, metrics, article content, and states are implemented as accessible HTML and React components.

## Visual direction

Profit Pilot is an editorial command center: precise, calm, and operational. It favors open layouts, tables, rails, and clear dividing lines over stacked cards. The interface should feel suitable for a publisher making revenue and compliance decisions every day.

## Color lock

| Token           | Value     | Use                                      |
| --------------- | --------- | ---------------------------------------- |
| Canvas          | `#ffffff` | Main application background              |
| Rail            | `#071c2f` | Persistent navigation                    |
| Rail hover      | `#132f46` | Navigation hover                         |
| Rail selected   | `#1b3850` | Selected navigation                      |
| Ink             | `#071829` | Primary text                             |
| Muted ink       | `#52616f` | Supporting text                          |
| Border          | `#dbe2e8` | Dividers and control borders             |
| Subtle surface  | `#f5f7f9` | Selected rows and quiet regions          |
| Primary         | `#ff4b20` | Primary actions and opportunity emphasis |
| Primary hover   | `#db3512` | Primary action hover                     |
| Healthy         | `#17843b` | Verified healthy states                  |
| Informational   | `#1559d6` | Links and the active review step         |
| Warning surface | `#fff9ed` | Locked disclosure and policy notices     |

No gradients, glass effects, colored page washes, or alternate neutral temperature are permitted in the initial product shell.

## Typography

- Interface family: Geist Sans with system sans-serif fallback.
- Metrics, identifiers, timestamps, and revision labels: Geist Mono.
- Page title: `42px/48px`, weight 650 on desktop; `32px/38px` below 768px.
- Section title: `22px/28px`, weight 650.
- Body: `15px/24px`, weight 400.
- Controls: `14px/20px`, weight 550.
- Compact labels and table headings: `12px/16px`, weight 600.
- Article title: `36px/42px`, weight 650.
- Article body: `17px/28px`, weight 400.

Control typography must be declared; browser-default button and input typography is not acceptable.

## Geometry and spacing

- Desktop rail: 268px.
- Desktop header: 64px.
- Content gutter: 32px.
- Compact rail and inspector padding: 20px.
- Base radius: 10px.
- Buttons: 8px radius.
- Table rows: square/open; no card wrapper.
- Shadows: none by default; drawers and menus may use one restrained elevation.
- Focus ring: 2px informational blue with 2px offset.

## Icon inventory

Use Lucide outline icons with round joins, `1.75px` stroke, and 18–20px optical size:

- Overview: `House`
- Opportunities: `Search`
- Content: `FileText`
- Calendar: `CalendarDays`
- Publications: `BriefcaseBusiness`
- Analytics: `ChartNoAxesColumnIncreasing`
- Integrations: `Puzzle`
- Settings: `Settings`
- Help: `CircleHelp`
- Notifications: `Bell`
- Workspace: `Building2`
- Health: `CircleCheck`
- Disclosure lock: `LockKeyhole`
- Evidence feed: `FileCheck2`
- Merchant evidence: `Globe2`
- More actions: `EllipsisVertical`
- Navigation disclosure: `ChevronDown` / `ChevronRight`

The Profit Pilot brand mark is implemented as a compact, original route/arrow SVG using `currentColor`; it is not a raster crop from the concept.

## Component families

- `AppShell`: rail, top header, responsive mobile navigation.
- `WorkspaceSwitcher`: organization and workspace context.
- `PrimaryNav`: selected, hover, keyboard-focus, and mobile variants.
- `PageHeader`: title, supporting copy, state, and actions.
- `MetricBand`: open columns separated by dividers.
- `DataTable`: semantic table with row action and mobile overflow.
- `QueueList`: selectable workflow rows with state treatment.
- `PipelineBand`: stage counts and status icons.
- `WorkflowStepper`: complete, active, and unavailable steps.
- `DocumentOutline`: selected anchor and metadata definition list.
- `ArticleCanvas`: locked disclosure, editable content, grounded claim selection.
- `ReviewInspector`: tabs, validation checks, evidence, and comments.
- `StatusText`: text-first state treatment; badges only where state ambiguity requires a bounded label.
- shadcn primitives: Button, Table, Tabs, Sheet, DropdownMenu, Separator, Alert, Tooltip, Dialog, and Skeleton.

## Copy lock: overview first viewport

- Profit Pilot
- Overview
- Opportunities
- Content
- Calendar
- Publications
- Analytics
- Integrations
- Settings
- Help & support
- Northstar Media
- US Editorial
- Casey Morgan
- Prioritize the next action across discovery, content, and publishing.
- Create content
- Qualified clicks
- Commission
- Content awaiting review
- Publishing health
- Top opportunities
- Today’s queue
- Editorial pipeline

No eyebrow, kicker, badge, subtitle, or proof copy may be added above the page heading.

## Copy lock: content review

- Content
- Best Insulated Mugs for Commuters
- In review
- Request changes
- Approve
- Brief
- Draft
- Validate
- Review
- Publish
- Introduction
- How we evaluated
- Top picks
- Buying guide
- Disclosure
- Checks
- Evidence
- Comments
- Validation summary
- Evidence for selected claim
- Open comments
- Publish will be enabled after approval.

## Responsive behavior

### Desktop, 1280px and wider

- Persistent navigation rail.
- Overview uses a two-column operational region.
- Review workspace uses outline, document, and inspector columns.

### Tablet, 768–1279px

- Navigation collapses to a sheet.
- Overview queue stacks below opportunities.
- Review outline collapses to an outline sheet.
- Review inspector becomes a right-side sheet opened from a persistent “Review checks” control.

### Mobile, below 768px

- Header contains the brand, workspace name, notification, and menu.
- Metrics use a two-column band, then one column below 420px.
- Tables remain semantic and scroll horizontally.
- Page actions become a bottom action bar where necessary.
- Article content remains the primary surface; outline and inspector are drawers.

## Interaction inventory

- Navigation changes the active route.
- Workspace switcher presents organization/workspace choices without leaking cached tenant data.
- “Create content” routes to the content creation workflow.
- Opportunity rows expose a working detail action.
- Queue rows have selected state and route to the corresponding task.
- Content review tabs switch real local UI state.
- Selecting a grounded sentence shows its evidence.
- “Request changes” requires a reason.
- “Approve” changes the revision to approved and enables WordPress draft creation.
- Disabled publication control explains why it is unavailable.
- All menus, tabs, sheets, and dialogs support keyboard interaction and visible focus.

## Motion

- Route and selection transitions: 140–180ms ease-out.
- Sheets: 220ms ease-out.
- No ambient or decorative animation.
- Respect `prefers-reduced-motion`.
