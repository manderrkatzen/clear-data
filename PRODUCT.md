# ClearData

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Analysts reviewing and cleaning tabular data. Recruiters evaluating a personal project are a secondary audience; the interface must demonstrate real analytical work, not just a marketing presentation.

## Product Purpose

Turn suspicious values into explainable, human-finalized cleaning decisions. Calculate evidence locally, ask AI for ranked interpretations, let the analyst choose the exact treatment scope, and integrate approved changes into the working dataset.

## Operating Context

Users import CSVs or bundled samples, inspect column profiles and highlighted records, work through a guided review, examine cumulative distributions, and revisit decisions through reversible history. Desktop is the principal analytical workspace; mobile must remain functional and legible.

## Capabilities and Constraints

- Existing vanilla JavaScript, HTML, and CSS application with browser-local CSV processing, a profiling worker, and a Cloudflare Worker AI API.
- Automatic AI interpretation on import, bounded evidence, ranked alternatives, and no autonomous source changes.
- Unknown, not applicable, legitimate zero, and formatting errors are distinct analytical meanings.
- Treatments require a scoped preview and explicit approval. Original values and row identities are preserved; rollback retains later approved patches.
- Existing production Worker and URL remain fixed. GitHub commits and hosted deployments are separate checkpoints.
- Excel workbook import is an open discussion item and is not part of this implementation.
- AI confidence scores are model-assessed recommendation rankings, not calibrated probabilities.

## Brand Commitments

Keep the ClearData name. The user authorized replacement of the old visual system and delegated the design direction. Prioritize an analyst-first interface with readable data, focused steps, clear exceptions, and consistent behavior across screens.

## Evidence on Hand

Healthcare, sales, and marketing CSV samples; deterministic regression checks; browser exercises; original/working/proposed comparisons; actual decision and rollback records. No fabricated customers, commercial claims, or performance benchmarks.

## Product Principles

1. Evidence precedes interpretation; interpretation precedes treatment.
2. AI assists judgment; the analyst finalizes every solution.
3. Suspicious is not synonymous with incorrect or missing.
4. The scope and consequences of a treatment must be visible before approval.
5. Approved solutions accumulate transparently and remain reversible.
