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
  queue-bg: "#f9fbfe"
  queue-active: "#e6eeff"
  queue-active-text: "#153c81"
  guided-line: "#cbd7e7"
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
  body:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  review-body:
    fontFamily: '"Source Sans 3", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
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
  button-approval:
    backgroundColor: "{colors.green}"
    textColor: "{colors.panel}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-approval-hover:
    backgroundColor: "{colors.green-hover}"
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
    padding: "10px 12px"
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
  guided-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.surface}"
  workspace-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.surface}"
    padding: "20px"
---

# Design System: ClearData

## Overview

**Creative North Star: "The Analytical Review Desk"**

ClearData is a precise, daylight analytical workspace. An ink-navy navigation rail frames white task surfaces on cool paper; blue identifies actions and selection, green marks final approval, and amber calls attention to exceptions. The character is restrained and information-led: readable data, aligned labels, compact controls, and meaningful hairline divisions.

The system uses native browser controls, inline SVG icons, and a self-hosted typeface. Review is a single vertical Find / Compare / Fix page. Secondary controls live in a side panel; the approval action follows the live chart in normal flow.

**Key Characteristics:**
- Navy navigation, white task surfaces, and cool-paper surroundings.
- Source Sans 3 with tabular numerals for analytical comparisons.
- Blue progression, green final approval, and amber contextual warnings.
- Restrained corners, hairline divisions, and SVG finding icons.
- Native controls, three question-led cards, and one approval action.

This is a source-grounded record of the implemented system. In `index.html`, styles load in this order: `styles.css`, `spreadsheet.css`, `workspace.css`, `review.css`, then `design-system.css`. The last file is the authoritative visual layer; earlier files still supply layout, interaction states, and compatibility. Root frontmatter records reused primitives and component values, not new CSS variables. Its `fontFamily` values reproduce `--font-ui`; its `control` radius reproduces `--radius`. Color keys `ink` through `red-bg` reproduce the same-named root custom properties. Remaining color entries are extracted selector values.

The simplified Review surface is verified by `scripts/verify_simple_review_ui.cjs`, including desktop/mobile captures with exact debug labels, intermediate responsive widths, scoped approval, exceptions, provenance, project restore, and rollback.

## Colors

The palette combines cool analytical neutrals with functional accents. Frontmatter is normative; selector-specific shades remain documented as component treatments rather than being collapsed into approximate root tokens. Sidecar tonal ramps are synthesized OKLCH panel previews required by the documentation schema, not shipped CSS tokens or an implemented tonal scale; the extracted hex values remain authoritative.

### Primary
- **Action blue** (`--blue`): primary progression, active steps, focus-related selection, profile finding links, and the working-data chart series.
- **Soft blue** (`--blue-soft`): source-icon backing and related informational surfaces.
- **Approval green** (`--green`): final guided approval and available AI status. The proposed chart series has its own brighter green; it is not the approval-button token.

### Neutral
- **Ink** (`--ink`): body and data text.
- **Muted** (`--muted`): secondary explanations, labels, and placeholders.
- **Cool paper** (`--paper`): application background.
- **White panel** (`--panel`): task surfaces and native field backgrounds.
- **Hairline** (`--line`): structural divisions.
- **Navy rail** (`--rail`): persistent desktop navigation; this dark region is part of the daylight system, not a dark theme.

### Semantic treatments
- Warning badges use `warning-text` on `amber-bg`; preview exceptions use their observed local shades (border `#e2cfa6`, fill `#fff6e6`, text `#714d1e`). Root amber also supports AI status messaging.
- Success badges use `success-text` on `success-bg`; the review-success panel uses border `#b1d6bf`, fill `#ebf7f0`, and text `#245d40`.
- Coral supports workspace errors; red-background and mint remain available root semantic surfaces. Their presence does not imply additional application statuses.
- Spreadsheet finding colors are category encodings, not severity rankings: missing, potential outlier, inconsistent category, date/number format, cross-column conflict, duplicate record, and schema violation. Their foreground/background pairs are preserved in frontmatter from `spreadsheet.css` and `workspace.css`.
- Original/working/proposed distributions use `source-series`, `blue`, and `proposed-series`, respectively, with a visible text legend.

**The Meaning Before Color Rule.** Pair semantic color with visible labels, icons, counts, or evidence; a flagged value is a finding for review, not proof that it is invalid.

## Typography

**Display and body font:** Source Sans 3, falling back to sans-serif. `@font-face` loads `fonts/source-sans-3-latin.woff2`, normal style, variable weights (400–700), with `font-display: swap`; `index.html` preloads this same asset. No remote font stylesheet is used.

**Value font:** `ui-monospace, monospace` for grouped source values (13px) and before/after change text (14px). This is a data-value distinction, not a second display identity.

### Hierarchy
- **Display:** empty-state heading; shrinks to (29px) at the narrow breakpoint.
- **Headline:** page heading; shrinks to (26px) at the narrow breakpoint.
- **Finding title:** active finding heading; shrinks to (21px) at the narrow breakpoint.
- **Title:** guided stage heading; shrinks to (20px) at the narrow breakpoint. Profile and workspace headings use (19px, weight 600); interpretation headings use (22px, weight 600).
- **Body:** global text, with review paragraphs using the denser `review-body` role. Empty-state supporting text uses (16px), reduced to (15px) on narrow screens, and a maximum measure (65ch). Direct guided-stage paragraphs inherit a maximum measure (72ch).
- **Controls and tables:** buttons and primary field text (14px); profile and record tables (14px); spreadsheet table (13px). Supporting text generally uses (12–13px).
- **Analytical numerals:** `font-variant-numeric: tabular-nums` on tables, metric values, preview counts, and comparison metrics. Overview metrics use (25px, weight 600); preview counts use (24px, weight 600).

This is a practical, stepped type hierarchy, not a mathematical modular scale. Compact legacy text that survives the cascade is recorded as drift below, not promoted to a new typography role.

## Layout

Desktop shell: CSS grid with a navigation column (196px) and `minmax(0, 1fr)` content. The sidebar is sticky at the viewport top, with height (100vh) and padding (26px 16px 20px). The dataset topbar is (72px) high with inline padding (30px). Screens have maximum width (1600px) and padding (28px 30px 40px).

Review uses a findings queue (220px) beside a flexible main column capped at (1060px), with a (28px) gap. At 1100px the queue is (190px) with a (20px) gap; at 900px it moves above the finding as a horizontal list. The header shows the title, record count, Advanced, and Leave open. Three white question-led cards use a shared line border, (8px) corners, (24px) padding, and (20px) separation. They remain in ordinary page flow, without a stepper, navigation footer, or bounded scrolling stage. Setup definitions live in a collapsed Dataset disclosure.

Metric and preview summaries use shared bordered strips rather than separated floating cards. Desktop overview metrics and preview summaries have four columns. Profile content scrolls within (480px); guided record previews within (330px). The spreadsheet scroll region is capped at (65vh); its issue rail is (180px) wide on desktop, inherited from `workspace.css`. Comparison metrics use `repeat(auto-fit, minmax(140px, 1fr))`.

Spacing is contextual: compact control gaps (8px), footer gaps (12px), review gaps (18px), card padding (20px), stage padding (24px), and desktop screen gutters (30px). These are extracted steps, not global spacing custom properties.

### Responsive behavior

All breakpoints are inclusive `max-width` queries:

| Width | Effective behavior |
| --- | --- |
| 1200px | Rail becomes 178px; screen/topbar gutters 24px. |
| 1100px | Review queue becomes 190px with a 20px gap. |
| 900px | Review queue moves above the finding; finding buttons become a horizontal scrolling list, 210px each. |
| 800px | Shell becomes one column; rail becomes an in-flow navy header with horizontally scrollable navigation; product label and sidebar bottom disappear. Topbar height becomes automatic, minimum 70px; screen gutters 18px; overview metrics become two columns. |
| 700px | Inherited spreadsheet rail becomes 105px; markers wrap, bubbles become 22px high, and marker labels become 100px wide. The inherited import workflow strip also becomes one column. |
| 620px | Review cards use 20px × 17px insets; header actions wrap; comparison columns stack and group mini-charts use two columns; approval becomes full width; fields stack. |
| 560px | Screen gutters 14px; navigation icons hidden; global header badges and ghost action hidden; headings shrink. Spreadsheet rail stays 105px. |
| 400px | Inherited compatibility outlier controls become one column and decision-bar primary action expands to full width. |

The effective inherited (700px) and (620px) changes matter: do not describe them as beginning only at the final layer's (560px) query. Wide tables retain local horizontal scrolling instead of shrinking the data to fit.

## Elevation & Depth

Task surfaces are flat, separated by borders and tonal backgrounds. Standard action buttons explicitly remove shadows. Blue outlines and a soft backing identify selected value chips and fixes. Dialogs are the raised exception, with shadow `0 16px 36px #142c4d26` and backdrop `#142c4d66`.

**The Flow First Rule.** Find, Compare, and Fix stay in document flow. Put the approval action after the chart and exception acknowledgements; keep secondary detail in Advanced rather than adding navigation steps.

Buttons transition background and border color (150ms ease). Reduced-motion mode removes these transitions and the toast transform, with a zero-duration opacity transition. This does not claim that every legacy animation is disabled.

## Shapes

Controls and value-group containers use the root restrained corner radius. Badge corners are smaller; task cards, queue, spreadsheet, and workspace containers use the surface radius. Dialogs and the import empty state use the larger dialog radius. Round numbered step markers (24px square) and existing rounded navigation count badges remain native exceptions to rectangular surface geometry.

Borders are generally (1px), including task divisions and inputs. Grouped metric strips clip their corners; the guided card deliberately uses `overflow: visible`. Finding icons use inline SVG with `currentColor`, no fill, stroke width (1.7), and round stroke caps/joins. Finding glyphs render at (16px) inside cells, tabs, legend types, and rail bubbles. Desktop navigation icons are (18px); the brand mark is (29px), reduced to (25px) on mobile.

There are no raster assets in the new visual system. Its assets are inline SVG paths and the self-hosted WOFF2 font; there is no shipping raster provenance to attach to this system.

## Components

### Native buttons

Blue primary, white secondary, and muted ghost actions share restrained corners, padding, and weight from frontmatter. General minimum height is (40px); navigation retains larger contextual minimums. Review approval uses green through `#simpleApprove`. Fix selection uses a blue outline and soft backing. Hover values are separate frontmatter variants. Disabled buttons retain opacity (.5) and `cursor: not-allowed`.

Keyboard focus uses outline (3px solid `focus`) with offset (3px) on buttons, fields, summaries, and links. Spreadsheet bubbles use their own category-colored (2px) outline; selected/focused flagged cells use an inset category outline.

### Fields and disclosures

Native inputs, selects, textareas, radio buttons, checkboxes, fieldsets, and `details`/`summary` carry the workflow. Review fields have a white background, field-line border (1px), control corners, padding from frontmatter, and text (14px). Review input/select and cleaning-context textarea focus change their border to `field-focus`; global focus-visible remains available. Native accents use blue generally; inherited key-column fieldsets retain green. Textareas resize vertically. Do not invent a global invalid-field treatment from the preview-exception panel.

### Navigation

The rail exposes Dataset, Explore, Review, Decisions, and Report as native buttons. Default, hover, active, and disabled colors are extracted in frontmatter. Items use weight (600), text (15px), and minimum height (46px) on desktop. Count badges are pale blue with navy text. Mobile navigation is horizontal and scrollable; at the narrowest final breakpoint its SVGs are hidden while text remains.

### Status badges and finding markers

Neutral, warning, and success badges are the implemented visual variants; labels determine their actual meaning. They do not define a new workflow-state taxonomy. Spreadsheet finding markers reuse the seven category color pairs and exact SVG paths from `sheetSvgIcon` in `spreadsheet.js`. Icons are decorative (`aria-hidden`); interactive flagged cells and markers carry textual descriptions. Potential outliers remain explicitly potential.

### Task surfaces and findings queue

Find, Compare, and Fix use the existing white panel, line, restrained surface corners, and question-heading scale. The findings queue has separated, column-specific items and a soft-blue selected row. Order and focus remain stable during background updates. There is no stepper or staged fallback. A busy selected fix disables approval while the existing engines prepare its exact effect.

### Missingness analysis

Compare runs automatically. A deterministic sentence leads, followed by one shared hold control and a verdict. The top three comparison columns use compact charts rather than a ranking table. Numeric cohorts use overlaid shared-bin histograms; categories use missing-rate bars. Holds split these into bounded group mini-charts using the existing engines. Show more columns and Explain with AI are secondary links. Numeric-band settings appear only for numerical holds.

### Per-representation value review

Find uses a horizontally scrolling strip of exact-value chips with counts, independent AI assessments, and meaning state. Blanks begin as missing; other representations need explicit review. One selected value shows a single-line explanation and Missing / Keep as valid actions. These record reversible source-preserving meaning decisions in one click. The confidence tooltip retains the model-assessed, non-calibrated wording. Unconfirmed representations never enter physical fill scope.

### Next capability extensions

Advanced contains scope, interpretation, the selected fix's KPI/dependency impact, provenance, and copilot questions. Changed rows and blocked lists open in the same native side-panel surface. Dataset retains definitions, reusable rules, suggested checks, projects, and quality scorecards. Statistical methods, source traces, and rollback replay remain in their existing engines.

### Single-page fix selection

Fix offers one selected treatment, with common choices visible and other valid methods in More fixes. Text replacement combines a Fill button with its editable value. The current before/after chart and a concise effect line update together. Scope, data, parameter, and classification changes invalidate transient results; approval builds a fresh exact preview and uses the existing fingerprint, blocked-subset, constraint, and provenance guarantees. A confirmation line offers Undo and advances the queue. `?debug=ui` labels the exact stable regions from the local simplification brief without adding layout space.

### Signature comparison

The main Fix chart compares current working values with the selected proposal on common bins and scale. It uses the existing 1st–99th percentile range, with edge counts in a compact disclosure. Text uses top-label counts, prioritizing newly introduced labels, plus blanks. A By group toggle reuses the existing band-impact lens. Amber blocked/constraint acknowledgements and the approval action follow the chart in normal flow.

### Dialogs and feedback

The application uses native `dialog` with the documented backdrop and shadow, padding (25px), reduced to (20px) on narrow screens. Cleaning/rule dialogs use bounded width `min(760px, 94vw)`; the cleaning dialog is capped at (90vh) and scrolls internally. Toast feedback uses `role="status"`, navy fill (`#193757`), text (14px), padding (13px 17px), and a maximum width `min(520px, 90vw)`.

### Observed limitations, not canonized

Some non-Review compatibility styles still contain legacy font names and contextual colors. They do not define a new visual direction for Review. The simplified surface uses the existing local typeface and tokens; the broader application shell retains its established appearance.

## Do's and Don'ts

### Do:
- **Do** use Source Sans 3 and tabular numerals for analytical data.
- **Do** use blue for progression and selection, green for final guided approval, and amber for contextual exceptions.
- **Do** pair finding colors with SVG icons and textual descriptions.
- **Do** preserve common bins and scales in original/working/proposed comparisons.
- **Do** keep one approval action after the live chart and put secondary detail in Advanced.
- **Do** account for inherited responsive rules when extending the final visual layer.

### Don't:
- **Don't** infer a dark theme from the navy navigation rail.
- **Don't** equate a finding color with invalid data or automatic treatment.
- **Don't** replace SVG finding icons with glyph icons or raster images.
- **Don't** promote residual legacy fonts, kickers, or green-selection styling into new system rules.
- **Don't** treat documentation completion as the pending finish-review verdict or as Playwright verification.
