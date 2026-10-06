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

The system uses native browser controls, inline SVG icons, and a self-hosted typeface. Dataset evidence remains visually distinct from interpretation and approval. Review content stays in document flow, including its static, unobstructed action footer.

**Key Characteristics:**
- Navy navigation, white task surfaces, and cool-paper surroundings.
- Source Sans 3 with tabular numerals for analytical comparisons.
- Blue progression, green final approval, and amber contextual warnings.
- Restrained corners, hairline divisions, and SVG finding icons.
- Native controls and a static review footer.

This is a source-grounded record of the implemented system. In `index.html`, styles load in this order: `styles.css`, `spreadsheet.css`, `workspace.css`, `review.css`, then `design-system.css`. The last file is the authoritative visual layer; earlier files still supply layout, interaction states, and compatibility. Root frontmatter records reused primitives and component values, not new CSS variables. Its `fontFamily` values reproduce `--font-ui`; its `control` radius reproduces `--radius`. Color keys `ink` through `red-bg` reproduce the same-named root custom properties. Remaining color entries are extracted selector values.

The finish reviewer reportedly requested four material fixes, now applied in one batch. The final verdict remains pending. This documentation pass does not constitute a new Playwright verification or an independent finish approval.

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

Guided review uses a findings queue (258px) beside a flexible white task surface, separated by (18px). The queue is sticky at (90px), and its list scrolls within (60vh). Stage padding is (24px); the five-step navigation uses equal columns and a minimum step height (72px). The review footer is explicitly `position: static`, with padding (15px 24px), so it occupies its own space after the content. Its buttons retain the earlier review-specific minimum height (44px), even though general buttons have a (40px) minimum.

Metric and preview summaries use shared bordered strips rather than separated floating cards. Desktop overview metrics and preview summaries have four columns. Profile content scrolls within (480px); guided record previews within (330px). The spreadsheet scroll region is capped at (65vh); its issue rail is (180px) wide on desktop, inherited from `workspace.css`. Comparison metrics use `repeat(auto-fit, minmax(140px, 1fr))`.

Spacing is contextual: compact control gaps (8px), footer gaps (12px), review gaps (18px), card padding (20px), stage padding (24px), and desktop screen gutters (30px). These are extracted steps, not global spacing custom properties.

### Responsive behavior

All breakpoints are inclusive `max-width` queries:

| Width | Effective behavior |
| --- | --- |
| 1200px | Rail becomes 178px; screen/topbar gutters 24px; queue 220px with 14px gap; stage padding 20px; preview summary becomes two columns. |
| 1100px | Compatibility expanded-issue panels stack; this is an inherited workspace rule, not the guided-review breakpoint. |
| 1000px | Guided queue moves into flow above the task; queue header becomes two columns; finding buttons become a horizontal scrolling list, 220px each, capped at 170px height. |
| 800px | Shell becomes one column; rail becomes an in-flow navy header with horizontally scrollable navigation; product label and sidebar bottom disappear. Topbar height becomes automatic, minimum 70px; screen gutters 18px; overview metrics become two columns. |
| 700px | Inherited spreadsheet rail becomes 105px; markers wrap, bubbles become 22px high, and marker labels become 100px wide. The inherited import workflow strip also becomes one column. |
| 620px | Inherited review rules stack the analysis banner, review fields and comparison metrics; footer wraps; exception/value-group rows can wrap; rule forms become one column. |
| 560px | Screen gutters 14px; navigation icons hidden; header badges and ghost action hidden; headings shrink; stage padding 20px 17px; footer padding 12px 17px, with step text on its own last row; comparison metrics stay one column. Spreadsheet rail stays 105px. |
| 400px | Inherited compatibility outlier controls become one column and decision-bar primary action expands to full width. |

The effective inherited (700px) and (620px) changes matter: do not describe them as beginning only at the final layer's (560px) query. Wide tables retain local horizontal scrolling instead of shrinking the data to fit.

## Elevation & Depth

Task surfaces are flat, separated by borders and tonal backgrounds. Standard action buttons explicitly remove shadows. Active review steps use an inset blue underline (2px), while selected spreadsheet rows retain subtle inset rules from the compatibility stylesheet. Dialogs are the raised exception, with shadow `0 16px 36px #142c4d26` and backdrop `#142c4d66`.

**The Flow First Rule.** Keep the guided action footer static and unobstructed; scrolling evidence and exceptions must not be covered by approval controls.

Buttons transition background and border color (150ms ease). Reduced-motion mode removes these transitions and the toast transform, with a zero-duration opacity transition. This does not claim that every legacy animation is disabled.

## Shapes

Controls and value-group containers use the root restrained corner radius. Badge corners are smaller; task cards, queue, spreadsheet, and workspace containers use the surface radius. Dialogs and the import empty state use the larger dialog radius. Round numbered step markers (24px square) and existing rounded navigation count badges remain native exceptions to rectangular surface geometry.

Borders are generally (1px), including task divisions and inputs. Grouped metric strips clip their corners; the guided card deliberately uses `overflow: visible`. Finding icons use inline SVG with `currentColor`, no fill, stroke width (1.7), and round stroke caps/joins. Finding glyphs render at (16px) inside cells, tabs, legend types, and rail bubbles. Desktop navigation icons are (18px); the brand mark is (29px), reduced to (25px) on mobile.

There are no raster assets in the new visual system. Its assets are inline SVG paths and the self-hosted WOFF2 font; there is no shipping raster provenance to attach to this system.

## Components

### Native buttons

Blue primary, white secondary, and muted ghost actions share restrained corners, padding, and weight from frontmatter. General minimum height is (40px); guided footer, tools, analysis-banner actions, finding-value actions, and navigation retain contextual minimums of (44px) or greater. Final guided approval uses green through `#approveGuided`; other primary actions stay blue. Hover values are separate frontmatter variants. Secondary borders change from `secondary-line` to `secondary-hover-line`. Disabled buttons retain opacity (.5) and `cursor: not-allowed`; navigation overrides opacity to (1) and uses its muted rail text.

Keyboard focus uses outline (3px solid `focus`) with offset (3px) on buttons, fields, summaries, and links. Spreadsheet bubbles use their own category-colored (2px) outline; selected/focused flagged cells use an inset category outline.

### Fields and disclosures

Native inputs, selects, textareas, radio buttons, checkboxes, fieldsets, and `details`/`summary` carry the workflow. Review fields have a white background, field-line border (1px), control corners, padding from frontmatter, and text (14px). Review input/select and cleaning-context textarea focus change their border to `field-focus`; global focus-visible remains available. Native accents use blue generally; inherited key-column fieldsets retain green. Textareas resize vertically. Do not invent a global invalid-field treatment from the preview-exception panel.

### Navigation

The rail exposes Dataset, Explore, Review, Decisions, and Report as native buttons. Default, hover, active, and disabled colors are extracted in frontmatter. Items use weight (600), text (15px), and minimum height (46px) on desktop. Count badges are pale blue with navy text. Mobile navigation is horizontal and scrollable; at the narrowest final breakpoint its SVGs are hidden while text remains.

### Status badges and finding markers

Neutral, warning, and success badges are the implemented visual variants; labels determine their actual meaning. They do not define a new workflow-state taxonomy. Spreadsheet finding markers reuse the seven category color pairs and exact SVG paths from `sheetSvgIcon` in `spreadsheet.js`. Icons are decorative (`aria-hidden`); interactive flagged cells and markers carry textual descriptions. Potential outliers remain explicitly potential.

### Task surfaces and findings queue

White guided cards use a guided-line border and surface corners. Workspace cards use the shared line and card inset. The queue uses queue-bg, separated rows, and a blue active-row backing with dark blue title text. Candidate rows have padding (14px 17px). Active step buttons use `aria-current="step"`, a pale-blue backing (`#eaf1ff`), a blue numbered circle, and an inset blue bottom rule. All step labels are clickable and keyboard-accessible; forward navigation shares interpretation, scope, exception, and preview guards with Continue. Computing a similar-row preview temporarily disables progression and shows a busy label.

### Missingness analysis

Understand adds a plain, divided analytical section after source value groups,
before the original/working distribution. Ranked comparison tables use the
existing profile-table typography and blue selection. Tables scroll locally
inside a bounded 360px region; 520px minimum table width preserves readable data
on mobile. Missing/present histograms reuse source/working series colors with
visible legends, a shared percentile range, and explicit tail counts. Held
comparisons use an inline disclosure with native selectors and number fields;
numeric-band fields disappear for categorical holds. AI explanations follow the
computed evidence and identify summary-only transmission beside the request.

Similar-row treatment uses a native checkbox fieldset for hold/similarity columns,
existing review fields, and explicit fallback guidance. Fill provenance appears
as an open disclosure after preview counts and in decision history, with bounded
scrolling and visible method, fallback count, band labels, or donor row IDs.
At 620px, analytical headings stack and similarity columns become one column.
These additions reuse the current palette and typography; no new visual world
or decorative copy is introduced.

### Signature comparison

Original, working, and proposed distributions share bins, axes, and scale. Bars occupy a (120px) chart height with bin gaps (5px) and series gaps (2px). Visible legends and comparison metrics support the color distinction. Scoped counts, exact record previews, and amber blocked/constraint exceptions precede final approval; the footer stays below them in normal flow.

### Dialogs and feedback

The application uses native `dialog` with the documented backdrop and shadow, padding (25px), reduced to (20px) on narrow screens. Cleaning/rule dialogs use bounded width `min(760px, 94vw)`; the cleaning dialog is capped at (90vh) and scrolls internally. Toast feedback uses `role="status"`, navy fill (`#193757`), text (14px), padding (13px 17px), and a maximum width `min(520px, 90vw)`.

### Observed limitations, not canonized

The final layer is authoritative where its selectors win; it does not reset every compatibility declaration. Remaining examples include `DM Sans` on metric explanatory text, generic project/decision fields and other legacy controls; `DM Mono` on inherited eyebrows and some old analytical widgets; green guided-card text selection and green field caret; review-specific placeholder colors; and inherited green-tinted compatibility panels. The topbar still renders an eyebrow, and guided preview/approval markup still emits stage kickers. These leftovers are not additional house fonts, a new green-selection rule, or a sanctioned kicker style for future surfaces. They are recorded without repair because this pass is documentation-only. This source scan does not verify their rendered frequency or contrast in Playwright.

## Do's and Don'ts

### Do:
- **Do** use Source Sans 3 and tabular numerals for analytical data.
- **Do** use blue for progression and selection, green for final guided approval, and amber for contextual exceptions.
- **Do** pair finding colors with SVG icons and textual descriptions.
- **Do** preserve common bins and scales in original/working/proposed comparisons.
- **Do** keep the review footer static, after the evidence and exceptions.
- **Do** account for inherited responsive rules when extending the final visual layer.

### Don't:
- **Don't** infer a dark theme from the navy navigation rail.
- **Don't** equate a finding color with invalid data or automatic treatment.
- **Don't** replace SVG finding icons with glyph icons or raster images.
- **Don't** promote residual legacy fonts, kickers, or green-selection styling into new system rules.
- **Don't** treat documentation completion as the pending finish-review verdict or as Playwright verification.
