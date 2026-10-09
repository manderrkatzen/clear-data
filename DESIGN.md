---
name: ClearData
description: A precise, daylight analytical workspace for human-reviewed data quality.
colors:
  ink: "#182b43"
  muted: "#52647a"
  paper: "#f3f6fa"
  panel: "#ffffff"
  line: "#d9e1eb"
  blue: "#245bc5"
  blue-soft: "#edf3ff"
  rail: "#172d4b"
  green: "#176146"
  mint: "#edf7f1"
  coral: "#a83832"
  amber: "#82541b"
  amber-bg: "#fff4df"
  red-bg: "#fff0ee"
  focus: "#83a9f1"
  blue-hover: "#1b49a4"
  green-hover: "#104b35"
  nav-text: "#c1d0e5"
  nav-hover: "#233c5d"
  nav-active: "#2b4c79"
  nav-disabled: "#a8bad4"
  secondary-text: "#274469"
  secondary-line: "#becbdc"
  secondary-hover: "#f0f4fc"
  secondary-hover-line: "#809abd"
  ghost-hover: "#edf2f8"
  status-bg: "#edf1f7"
  status-text: "#4b5f7b"
  warning-text: "#765019"
  success-bg: "#e8f6ee"
  success-text: "#1f6448"
  field-line: "#bac9dc"
  field-focus: "#7395d3"
  review-before: "#E07B39"
  review-after: "#2E6BD9"
  review-neutral: "#9AA3AE"
  source-series: "#899bb4"
  proposed-series: "#26966a"
  finding-missing: "#b83e30"
  finding-missing-bg: "#fff0ed"
  finding-outlier: "#7544a7"
  finding-outlier-bg: "#f3edfa"
  finding-category: "#93600b"
  finding-category-bg: "#fff7e2"
  finding-format: "#286da4"
  finding-format-bg: "#eaf4fc"
  finding-conflict: "#a64b0c"
  finding-conflict-bg: "#fff0e3"
  finding-duplicate: "#35696d"
  finding-duplicate-bg: "#e8f5f4"
  finding-schema: "#794552"
  finding-schema-bg: "#f8edf1"
typography:
  display:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.6px"
  headline:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.6px"
  finding-title:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.35px"
  title:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.3px"
  review-brand:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "22px"
    fontWeight: 600
  body:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  review-body:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  review-section:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "18px"
    fontWeight: 600
  review-effect:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.55
  review-chart-mobile:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "12px"
    fontWeight: 400
  button:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "14px"
    fontWeight: 600
  label:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "12px"
    fontWeight: 600
  value:
    fontFamily: "ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  badge: "4px"
  control: "6px"
  surface: "8px"
  dialog: "10px"
spacing:
  compact: "8px"
  control-gap: "12px"
  review-gap: "18px"
  card-inset: "20px"
  stage-inset: "24px"
  screen-inline: "30px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.panel}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.secondary-text}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-ghost:
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-ghost-hover:
    backgroundColor: "{colors.ghost-hover}"
    textColor: "{colors.ink}"
  input-review:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "36px"
  navigation-item:
    textColor: "{colors.nav-text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  navigation-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.panel}"
  status-neutral:
    backgroundColor: "{colors.status-bg}"
    textColor: "{colors.status-text}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  status-warning:
    backgroundColor: "{colors.amber-bg}"
    textColor: "{colors.warning-text}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  status-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success-text}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  review-task:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.surface}"
    padding: "22px 26px 20px"
  workspace-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.surface}"
    padding: "20px"
---

# Design System: ClearData

## Overview

**Creative North Star: "The Analytical Review Desk"**

ClearData is a precise, daylight analytical workspace. An ink-navy navigation rail frames white task surfaces on cool paper; blue identifies actions and selection. Review evidence pairs orange before/missing/flagged values with blue after/present/normal values and grey neutral values. The character is restrained and information-led: readable data, aligned labels, compact controls, and meaningful hairline divisions.

The system uses native browser controls, inline SVG icons, and a self-hosted typeface. Review combines a column-grouped issue list with a bounded white task surface and Explore / Fix / Review tabs. Fix puts reported-number consequences and an explicitly named risk before its compact preview and common Apply action; Review exposes the recorded result and Undo.

**Key Characteristics:**
- Navy navigation, white task surfaces, and cool-paper surroundings.
- Source Sans 3 with tabular numerals for analytical comparisons.
- Blue actions and selection; orange/blue Review evidence with grey neutral values.
- Restrained corners, hairline divisions, and SVG finding icons.
- Native controls, freely navigable issue tabs, and shared Apply / Undo actions.

This is a source-grounded record of the implemented system. In `index.html`, styles load in this exact order: `styles.css`, `spreadsheet.css`, `workspace.css`, `design-system.css`, then `review-page.css`. `design-system.css` is the last general shell layer; `review-page.css` follows it as the final Review-specific authority. Root frontmatter records reused primitives and component values, not new CSS variables. Its `fontFamily` values reproduce `--font-ui`; its `control` radius reproduces `--radius`. Color keys `ink` through `red-bg` reproduce the same-named root custom properties. Remaining color entries are extracted selector or chart values. Other-surface distribution and spreadsheet tokens retain their incumbent scope.

`review_spec/README.md`, `00_shared.md`, and the numbered issue files are the approved Review specification, superseding earlier briefs. Implemented patterns below are grounded in `review-page.js`, `review-core.js`, `review-charts.js`, `review-page.css`, and the issue modules. Checked visual evidence is `.impeccable/review/desktop.png`, `mobile.png`, and the multi-value/sensitive Explore, Fix, and Review captures at 1440px and 390px. The release handoff reports passing issue-specific desktop/mobile suites and a real-CSV smoke flow covering highlights/rail, exact grouped preview, approval, history, Undo, and actual export; these are supplied verification results, not tests rerun by this documentation pass. The independent finish verdict covers the mobile histogram-lettering fix, not a whole-surface audit or whole-spec acceptance inferred from captures.

## Colors

The palette combines cool analytical neutrals with functional accents. Frontmatter is normative; selector-specific shades remain documented as component treatments rather than being collapsed into approximate root tokens. Sidecar tonal ramps are synthesized OKLCH panel previews required by the documentation schema, not shipped CSS tokens or an implemented tonal scale; the extracted hex values remain authoritative.

### Primary
- **Action blue** (`--blue`): primary actions including Review Apply, focus-related selection, profile finding links, and incumbent working-data chart series.
- **Soft blue** (`--blue-soft`): source-icon backing and related informational surfaces.
- **Semantic green** (`--green`): incumbent status treatments and fixed issue dots. Review Apply uses action blue.
- **Review orange** (`review-before`): before / missing / flagged chart series, including the labeled filled segment.
- **Review blue** (`review-after`): after / present / normal chart series, tab underline, and native checkbox/range accents.

### Neutral
- **Ink** (`--ink`): body and data text.
- **Muted** (`--muted`): secondary explanations, labels, and placeholders.
- **Cool paper** (`--paper`): application background.
- **White panel** (`--panel`): task surfaces and native field backgrounds.
- **Hairline** (`--line`): structural divisions.
- **Navy rail** (`--rail`): persistent desktop navigation; this dark region is part of the daylight system, not a dark theme.
- **Review grey** (`review-neutral`): neutral/unchanged chart marks and accepted issue dots.

### Semantic treatments
- Warning badges use `warning-text` on `amber-bg`; Review blocked-row text uses root amber. Root amber also supports AI status messaging.
- Success badges use `success-text` on `success-bg`; fixed issue dots use root green.
- Coral supports workspace errors; red-background and mint remain available root semantic surfaces. Their presence does not imply additional application statuses.
- Spreadsheet finding colors are category encodings, not severity rankings: missing, potential outlier, inconsistent category, date/number format, cross-column conflict, duplicate record, and schema violation. Their foreground/background pairs are preserved in frontmatter from `spreadsheet.css` and `workspace.css`.
- Incumbent original/working/proposed distributions outside the new Review use `source-series`, `blue`, and `proposed-series`, respectively. Review charts use the orange/blue/grey roles above, with visible legends or labels.
- Review risk labels are separate semantic treatments: Doesn't change values (grey), Doesn't invent information (green), Estimates values / Invents information (amber), Removes data (red), and Changes structure (blue). They explain treatment risk rather than redefine chart-series colors.

**The Meaning Before Color Rule.** Pair semantic color with visible labels, icons, counts, or evidence; a flagged value is a finding for review, not proof that it is invalid.

## Typography

**Display and body font:** Source Sans 3, falling back to sans-serif. `@font-face` loads `fonts/source-sans-3-latin.woff2`, normal style, variable weights (400–700), with `font-display: swap`; `index.html` preloads this same asset. No remote font stylesheet is used.

**Value font:** monospace is confined to data representations: Review representation codes use (12px), while incumbent source-value and before/after styles retain (13px) and (14px) treatments. This is a data-value distinction, not a second display identity.

### Hierarchy
- **Display:** empty-state heading; shrinks to (29px) at the narrow breakpoint.
- **Headline:** page heading; shrinks to (26px) at the narrow breakpoint.
- **Finding title:** active Review issue heading (23px, weight 600), reduced to (21px) at 620px.
- **Title:** Review issue-list heading (21px); tab-content section headings use `review-section` (18px, weight 600), subsections (15px, weight 600). Profile and workspace headings retain (19px, weight 600).
- **Body:** global text (15px/1.5); Review paragraphs use `review-body` (14px/1.55). Consequence sentences use `review-effect` (16px, weight 600, maximum 74ch); scope reminders and risk copy use (13px). Empty-state supporting text retains (16px), reduced to (15px) on narrow screens, and a maximum measure (65ch).
- **Controls and tables:** buttons and primary field text (14px); profile and record tables (14px); spreadsheet table (13px). Supporting text generally uses (12–13px).
- **Analytical numerals:** `font-variant-numeric: tabular-nums` on tables, overview metrics, and the Review page. Overview metrics use (25px, weight 600); Review metric values (21px), consequence figures (18px), both weight 600. Review table text is (12–13px); histogram SVG labels are (11px) on desktop and (12px) at 620px and below. This dense source hierarchy is not a new global display scale.

This is a practical, stepped type hierarchy, not a mathematical modular scale. Compact legacy text that survives the cascade is recorded as drift below, not promoted to a new typography role.

## Layout

Desktop shell: CSS grid with a navigation column (196px) and `minmax(0, 1fr)` content. The sidebar is sticky at the viewport top, with height (100vh) and padding (26px 16px 20px). The dataset topbar is (72px) high with inline padding (30px). Screens have maximum width (1600px) and padding (28px 30px 40px).

Review overrides the screen cap and uses (20px 24px) screen padding. In Review, the navigation rail narrows to (168px), the topbar becomes (60px), and redundant eyebrow/continuation copy recedes. Its desktop grid has a column-grouped issue list (220px), a flexible white task surface, and a (20px) gap. Height is `calc(100dvh - 100px)` with a (620px) minimum. The task surface has (8px) corners, a hairline border, and (24px) padding. Header and tabs remain above an internally scrolling evidence area. The issue list has its own bounded scroll container. Apply/Undo footers occupy separate space below the tab content, so they neither cover charts nor disappear into the evidence scroll. Dataset definitions remain under `dataset.setup`.

Desktop overview metrics retain four columns and bordered strips. Review metric strips use restrained (18px) values and wrap with (12px 24px) gaps; consequence figures wrap with a (24px) gap. The consequence block uses hairlines and (16px) vertical padding. Review sample tables scroll within (210px); multi-value Explore examples within (340px). Missing Explore gives its remaining space to one priority-sorted table, with (13px) data text and locally scrolling columns/rows. Profile content retains its (480px) scroll region. The spreadsheet scroll region remains capped at (65vh), with its incumbent issue rail (180px) on desktop.

Spacing is contextual: compact control gaps (8px), Review content gaps (14px), header/footer gaps (18px), workspace padding (20px), desktop Review column gap (24px), and incumbent desktop screen gutters (30px). The frontmatter spacing steps remain extracted values, not global spacing custom properties or a mandate for uniform card layouts.

### Responsive behavior

All breakpoints are inclusive `max-width` queries:

| Width | Effective behavior |
| --- | --- |
| 1200px | Rail becomes 178px; screen/topbar gutters 24px. |
| 1100px | Review list becomes 200px with a 16px gap; task padding becomes 20px. |
| 900px | Review issue browsing becomes a collapsed "Browse issues" disclosure above the task, retaining search/filter and a 180px list when expanded. Task height flows with its content; the single inspection table has a 260px minimum and 460px maximum scrolling height. |
| 800px | Shell becomes one column; rail becomes an in-flow navy header with horizontally scrollable navigation; product label and sidebar bottom disappear. Topbar height becomes automatic, minimum 70px; screen gutters 18px; overview metrics become two columns. |
| 700px | Inherited spreadsheet rail becomes 105px; markers wrap, bubbles become 22px high, and marker labels become 100px wide. The inherited import workflow strip also becomes one column. |
| 620px | Review screen padding becomes 16px 14px; task padding 18px 14px. Missing overview, priority controls, group comparison charts, outlier pairs, cross-column pairs, and sensitive examples stack. Direction/priority controls have 44px height. Fix footer wraps and Apply becomes full width. Histogram/outlier SVG labels use 12px, with responsive drawing geometry rather than miniature desktop canvases. |
| 560px | Screen gutters 14px; navigation icons hidden; global header badges and ghost action hidden; headings shrink. Spreadsheet rail stays 105px. |

The effective inherited (700px) and (620px) changes matter: do not describe them as beginning only at the final layer's (560px) query. Wide tables retain local horizontal scrolling instead of shrinking the data to fit.

## Elevation & Depth

Task surfaces are flat, separated by borders and tonal backgrounds. Standard action buttons explicitly remove shadows. Blue outlines and a soft backing identify selected value chips and fixes. Dialogs are the raised exception, with shadow `0 16px 36px #142c4d26` and backdrop `#142c4d66`.

**The Evidence Before Apply Rule.** Show the reported-number consequence and explicit risk before the compact preview. Keep Apply after evidence and acknowledgements, and Undo with the recorded result; action footers must not obscure scrolling content.

Buttons transition background and border color (150ms ease). Reduced-motion mode removes these transitions and the toast transform, with a zero-duration opacity transition. This does not claim that every legacy animation is disabled.

## Shapes

Controls use the root restrained corner radius. Badge and representation-row corners are smaller; Review task, spreadsheet, and workspace containers use the surface radius. Dialogs and the import empty state use the larger dialog radius. Review status dots (6px) and existing rounded navigation count badges remain exceptions to rectangular surface geometry.

Borders are generally (1px), including task divisions and inputs. Review's active tab has a (2px) underline; its white task surface is bounded through layout and tone. Finding icons use inline SVG with `currentColor`, no fill, stroke width (1.7), and round stroke caps/joins. Finding glyphs render at (16px) inside spreadsheet cells, tabs, legend types, and rail bubbles. Desktop navigation icons are (18px); the brand mark is (29px), reduced to (25px) on mobile.

There are no raster assets in the new visual system. Its assets are inline SVG paths and the self-hosted WOFF2 font; there is no shipping raster provenance to attach to this system.

## Components

### Native buttons

Blue primary, white secondary, and muted ghost actions share restrained corners, padding, and weight from frontmatter. General minimum height is (40px); navigation retains larger contextual minimums. Review uses the shared blue primary Apply and white secondary Undo. Fix choices use (9px 13px) padding, a blue selected outline, and soft backing. Text actions use (13px) text and (5px 0) padding. Hover values are separate frontmatter variants. Disabled buttons retain opacity (.5) and `cursor: not-allowed`; the shared Apply gate supplies a reason in its title.

Keyboard focus uses outline (3px solid `focus`) with offset (3px) on buttons, fields, summaries, and links. Spreadsheet bubbles use their own category-colored (2px) outline; selected/focused flagged cells use an inset category outline.

### Fields and disclosures

Native inputs, selects, textareas, radio buttons, checkboxes, fieldsets, and `details`/`summary` carry the workflow. New Review inputs/selects have a white background, root line border (1px), control corners, (8px 10px) padding, minimum height (36px), and text (14px). Review checkbox/range accents use Review blue; global focus-visible remains available. Incumbent cleaning-context/review-fields controls retain their own field-focus treatment, and inherited key-column fieldsets retain green. Textareas resize vertically. Risk and blocked-row treatments do not establish a global invalid-field style.

### Navigation

The rail exposes Dataset, Explore, Review, Decisions, and Report as native buttons. Default, hover, active, and disabled colors are extracted in frontmatter. Items use weight (600), text (15px), and minimum height (46px) on desktop. Count badges are pale blue with navy text. Mobile navigation is horizontal and scrollable; at the narrowest final breakpoint its SVGs are hidden while text remains.

### Status badges and finding markers

Neutral, warning, and success badges are the implemented visual variants; labels determine their actual meaning. They do not define a new workflow-state taxonomy. Spreadsheet finding markers reuse the seven category color pairs and exact SVG paths from `sheetSvgIcon` in `spreadsheet.js`. Icons are decorative (`aria-hidden`); interactive flagged cells and markers carry textual descriptions. Potential outliers remain explicitly potential.

### Issue list and task tabs

Issues are grouped by dataset column and ordered by issue type, with label, count, and open/fixed/accepted status dots. A native type filter and column-name search sit above the independently scrolling list; Resolved is a collapsed disclosure. The selected item has a soft-blue backing. The task header shows column, issue, count/unit, and Accept as is. Explore / Fix / Review are tabs, not a wizard: Fix requires affected/locked items, Review requires a recorded decision, and disabled tabs explain why. Choices and parameters survive tab changes; scope changes invalidate the preview. Keyboard 1/2/3 changes tabs and j/k changes open issues outside editing controls.

### Missing-value evidence and scope

Explore starts with "Treat as missing": exact representations, counts/shares, selection state and available AI assessments. Blanks begin selected; other candidates enter treatment scope only through explicit selection. "Inspect the rows" is one continuous table. Row identity and the reviewed column stay pinned; chosen ordering columns appear next in priority order, followed by stable selected context columns. Column-header buttons and an "Order by" toolbar set ascending/descending priorities. Native position selectors and drag-reordering are equivalent. Sorting is typed and lexicographic, source-stable on ties, and keeps unavailable ordering values last. It never mutates source order or fill scope. Missing cells use visible "Missing" text and root coral/red-background finding treatment; nonblank selected tokens retain exact source text. Fifty rows render initially, with Show more/Show all. Background analysis does not replace chosen visible columns. Inspection preferences survive tabs, approvals, Undo and project restore. Group-based fill columns/bands remain separately available in the Fix "Fill groups" disclosure, using the existing engine. AI picks remain explicitly accepted suggestions.

### Shared Fix and Review

Fix begins with a scope reminder that returns to Explore. Common option buttons expose inline parameters; More selects other available methods. A computed consequence sentence, up to three before/after figures, and one explicit risk label precede the compact preview. See affected rows opens a white side panel; Add a note expands a field saved with the decision. Apply uses the existing fingerprinted approval path and switches to Review. Pending previews, blocked rows, required notes, and applicable acknowledgements gate Apply with a reason; applying to an unblocked subset requires the explicit Apply to the rest choice.

Review shows recorded metrics, issue-specific chart or samples, the fix/time/note line, Undo, and Next issue. Acceptance without changes shows retained-source copy and Undo rather than a fabricated chart. Undo uses the existing rollback path and returns the issue to Explore with its session choices retained. Dataset keeps definitions, primary Review metric settings, rules, projects, and scorecards. The exact stable regions use current `review.*` data-ui names, including `review.fix.apply` and `review.review.undo`; `?debug=ui` adds outlines and out-of-flow labels.

### Signature comparisons

Numeric Review histograms use common bins over the existing 1st–99th percentile range, visible edge counts, per-series percentages, legend populations, and labeled median lines. Skew-triggered log scaling is explicitly named. Filled values have a separately labeled stacked segment. Missing-value By group reuses the existing grouping engine, bounded to four groups plus Other with a shared y-scale. Category comparisons use labeled totals and grey unchanged marks; issue-specific previews can use changed-category text or row examples instead of a redundant chart.

Histogram canvas width uses the available task width (maximum 720 drawing units), recomposing bins while retaining their numerical definitions. CSS no longer compresses previews into capped heights; evidence scrolls locally and actions have dedicated layout space. Outlier scatter geometry likewise recomposes to the available narrow viewport, retaining shared data domains and rule bounds. The secondary outlier histogram is available under "Distribution and rule bounds", collapsed by default. Resize rerenders geometry after a (100ms) debounce without discarding preview or scope. This is a targeted clarity pass, not a full chart-system or accessibility certification.

### Structural and sensitive review

Multi-value Explore shows a separator selector, part-count summary, bounded examples, and distinct-value counts. Fix supports one row per value, one column per position, yes/no flags (up to 20 distinct values), first-value-only, and Keep. Structural previews show row/column changes and preserved-source examples; row splitting explicitly warns about copied records and double-counted metric totals. Review records structural counts and resulting value frequencies.

Sensitive Explore uses local type locks and masked examples. Mask, deterministic SHA-256 code replacement, column removal, and Keep share the consequence/preview/Apply structure. Keep requires a note, including when reached through header acceptance. Sensitive previews and affected-row panels keep source examples masked, and the module has no AI hook; shared AI guards also reject sensitive context. Risk copy distinguishes remaining mask fragments, guessable hash inputs, and originals retained in local source/project backups. These implemented disclosures do not promise anonymization.

### Dialogs and feedback

The application uses native `dialog` with the documented backdrop and shadow, padding (25px), reduced to (20px) on narrow screens. Cleaning/rule dialogs use bounded width `min(760px, 94vw)`; the cleaning dialog is capped at (90vh) and scrolls internally. Toast feedback uses `role="status"`, navy fill (`#193757`), text (14px), padding (13px 17px), and a maximum width `min(520px, 90vw)`.

### Observed limitations, not canonized

Some non-Review compatibility styles and detector shell advisories still carry legacy font references, kickers, and contextual colors. These pre-existing differences were not repaired or promoted as new Review rules. The incumbent navy rail/daylight shell, local font, dialogs, spreadsheet category colors, and other-surface chart treatments remain in their existing scope. The surface brief's broader green-approval wording does not describe the new Review Apply action; implemented source takes precedence here. Captures and the limited finish verdict do not certify whole-spec acceptance.

## Do's and Don'ts

### Do:
- **Do** use Source Sans 3 and tabular numerals for analytical data.
- **Do** use orange before/missing/flagged, blue after/present/normal, and grey neutral values in Review evidence; keep risk colors separately labeled.
- **Do** pair finding colors with SVG icons and textual descriptions.
- **Do** preserve common bins and scales in comparisons, including recomposed mobile histograms with legible labels.
- **Do** put consequences and explicit risk before the preview and Apply; keep Undo with the recorded result.
- **Do** account for inherited responsive rules when extending the final visual layer.

### Don't:
- **Don't** infer a dark theme from the navy navigation rail.
- **Don't** equate a finding color with invalid data or automatic treatment.
- **Don't** replace SVG finding icons with glyph icons or raster images.
- **Don't** promote residual legacy fonts, kickers, or green-selection styling into new system rules.
- **Don't** infer whole-spec acceptance or a whole-surface clean bill from documentation, captures, or a limited finish verdict.
