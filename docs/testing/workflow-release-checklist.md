# Public release workflow audit

Date: 2026-10-01. Baseline: 77 passing automated tests. Final application suite: 83 passing; public fixture: 3 passing.

This checklist records observable workflows, not proof that all arbitrary repositories or AI answers are correct.

- [x] First-run setup and public example
- [x] Project overview, entries, packages, explorer, search
- [x] Source selection, automatic explanation, cancellation, syntax depth
- [x] Function links, preview, Back/Forward, reading trail
- [x] Trace and feature walkthrough
- [x] Source review, Git changes, test evidence, verification observation
- [x] Recommendations, comparison, source evidence, change plan
- [x] Practice, teach-back, learning plan
- [x] Notebook persistence/export and saved answers
- [x] Themes and responsive layout
- [x] Invalid inputs, unavailable AI, stale source, cache boundaries
- [x] Clean install, build, full test suite, release privacy check
- [x] License, contribution/security docs, dependency notices
- [x] Public demo media and full video decode


## Browser evidence

The public Tiny Tasks example was copied into a neutral temporary path for capture. No private repository content was used in the video.

- Opened a project, inspected entries/package statistics, searched for `validateTitle`, and opened its source.
- Automatic explanation returned a real Codex response with checked source links. Saved answers survived a server restart and reopened without a new generation.
- Selected a function, previewed its definition, followed its caller and underlined calls, and navigated Back/Forward.
- Feature search displayed a static walkthrough with unresolved boundaries disclosed. Test evidence linked the example's validation tests and production caller.
- A real recommendations request returned evidence-linked improvements with trade-offs and verification steps. Comparison input and change-plan submission are covered by browser/API integration tests.
- A real teach-back question and demonstration answer produced feedback, a transfer exercise, and one persisted learning-plan record. This demonstration does not represent any person's proficiency.
- Saved a source-linked note, inspected exported Markdown, and recorded a verification observation explicitly labeled user reported.
- Reviewed a real temporary Git fixture's changed validation rule, then checked empty staged and populated unstaged views. The full Git suite additionally covers staged, deleted, untracked, and hostile filter configurations.
- Switched Atlas light, Monokai, Solarized Dark, and Follow VS Code. Checked desktop capture layout at 1920×1080 and the compact browser layout.

## Bugs fixed during the audit

1. Explain selected line now leaves quiz mode and requests a syntax explanation.
2. Saved range answers restore their exact valid range and explanation depth for follow-up questions.
3. Project-overview requests drop prior source selections/ranges instead of being rejected by the backend.
4. The backend rechecks operation state after request-body uploads, preventing overlapping AI calls.
5. Source text search skips stale source and labels bounded results.
6. Reading journeys reject symbols belonging to another file.
7. Saved answers retain requested depth across cache/restart.
8. Compact windows retain the project explanation action; wrapped navigation labels stay left aligned. Verified at 768×1024 and the default narrow app panel.

## Release and media checks

The sanitized source archive passed a fresh dependency install, build, 83 application tests, and 3 public-fixture tests. An independent exported-server smoke check served the HTML/browser bundle, established a session, and indexed the eight-file public example. The final 62.016-second H.264/AAC video is 1920×1080 at 30 fps; full audio/video decode completed without errors, and its scene contact sheet was visually reviewed. The public export excludes private project material and intermediate captures.

## Verification boundaries

Browser checks cover the named happy paths on the local macOS app. Automated tests exercise cancellation, invalid requests, unavailable/fake AI responses, staleness, evidence validation, persistence, and Git boundaries using controlled fixtures; they do not prove every live service state. Login renewal, exhausted allowance, and arbitrary external repositories are not verified. The app does not execute reviewed projects or certify AI claims. Semantic navigation remains strongest for JavaScript/TypeScript; other-language support is limited as documented. Windows release checks are partial; hosted CI has not run before publication.


## Follow-up: evidence, practice and selective caching

The 2026-10-01 follow-up passed 119 application tests (zero failures), the syntax/build/manifest release gate, and 3 public-fixture tests. Browser checks confirmed distinct evidence labels backed by recorded checks, concept-matched curated practice with local known-answer grading, immediate attempt updates, and saved-answer freshness labels. Source explanations now track supporting files and context; unrelated edits do not invalidate them. Overview and feature-wide requests remain conservative. Curated practice currently covers 14 JavaScript examples across seven concepts. Stronger evidence labels remain user reported, not an automated certification by the app.


## Publication refresh — 2026-10-01

The current local release gate passed 119 application tests with no failures (exit 0); the three public fixture tests also passed. Video lint/type checks passed (exit 0). The demo was recaptured with 20px code and 18px explanation text at 1920×1080, shown without camera enlargement, and rebuilt with approved soundtrack A and closing music attribution. The 66.773-second H.264/AAC master decoded fully without errors. Representative scene frames and the ending were visually inspected. The clean publication checkout completed dependency installation, build, and syntax checks with exit 0. The final package and source export use the same approved file allowlist.
