# Open-source release audit

Checked 2026-10-01 for the first public Code Atlas release.

## Scope and provenance

The release consists of Code Atlas source, the Tiny Tasks teaching example, public demo material, and build/test tools. Local research, acceptance artifacts from a nonpublic repository, screenshots, caches, dependencies, and generated logs are excluded from Git staging and the npm archive. The archive uses a file allowlist enforced by `scripts/release.mjs`; unexpected files or machine-specific paths make the check fail. Generated `public/app.js` is built before packaging and is not tracked in the source repository.

The MIT license covers Code Atlas contributions. It does not relicense third-party dependencies or the demo soundtrack. Browser-bundled dependency license texts and notices are included under `licenses/` and in `THIRD_PARTY_NOTICES.md`.

## Dependency review

The npm registry metadata for every locked package version was checked. All 72 packages declared a license: 59 MIT, 2 MIT-0, 3 BSD-3-Clause, 2 BSD-2-Clause, 2 Apache-2.0, 1 dual MPL-2.0 or Apache-2.0, 1 ISC, 1 CC0-1.0, and 1 BlueOak-1.0.0. The project elects DOMPurify's Apache-2.0 option. No package had an undeclared license in registry metadata. The seven direct development and runtime packages are covered in `THIRD_PARTY_NOTICES.md`.

The updated public demo is a 66.773-second, 1920×1080, 30 fps H.264/AAC file. The video and poster copies match the reviewed originals by SHA-256 (`c152044d2c579257221aa2301659381e1926f3f0246c1c05652e6aff4e851a7a` and `091cdb3ee71b75e9e9cfbb4e0afec05b294c425ab981f47cd18ce6c357b5e270`). The editing project's lint/type checks and a complete exported-video decode exited successfully. The opening, closing, and representative scene frames were visually reviewed. The fresh footage uses the public Tiny Tasks example; the demo README records source provenance, assistant-supplied demonstration answers and checks, and timing edits.

The final demo uses approved soundtrack A, "Inspired" by Kevin MacLeod, under CC BY 4.0. The end credit, demo README, and third-party notices identify the composer, original track, license, and editing changes. Audio from the old synthesized track is absent. The final video uses 16 fresh 1920×1080 public-example captures, with 20px code and 18px explanations. Screens are presented at native size with no camera enlargement. Browser captures are JPEG; Remotion intermediate frames are lossless PNG. The complete final audio/video stream decoded without errors; scene frames, the closing credit, and the last frame were reviewed. The earlier half-width music comparison is not the release master.

`npm audit --json` against the official npm registry reported zero vulnerabilities at all severity levels for this lockfile. This is a point-in-time advisory check, not a guarantee that the dependencies are vulnerability-free. No dependency was upgraded solely for the release.

## Verification

The release gate runs syntax checks, the Node test suite, the browser build, and an npm archive manifest/content check. The GitHub Actions matrix runs the full gate on Ubuntu and macOS. Windows runs install, syntax, build, manifest, and Tiny Tasks fixture checks; the full application suite includes POSIX permission and symlink tests, so Windows support remains partial. The fixture tests use native TypeScript stripping on Node 22. A clean `npm ci` from the committed lockfile should be used before each release, followed by `npm run release:check` and `npm run release:pack`.

The GitHub-ready source export contains the lockfile, CI workflow, and launch script. The npm `.tgz` does not include the lockfile because npm's package format omits it. Install a source checkout with `npm ci`; install an unpacked npm archive with `npm install`.

Current publication verification: `npm run release:check` exited 0 with 119 application tests passed, 0 failures, syntax checks, browser build, and 68-file release manifest. The video project's lint and TypeScript checks exited 0, and the final video decoded completely with exit 0. All 3 Tiny Tasks fixture tests passed. No application tests were added or removed for this media revision.

The publication checkout completed a fresh `npm ci`, browser build, and syntax checks, all with exit 0. The checked source export contains 74 approved files. Earlier release preparation also exercised the server's session and project-index endpoints from an exported checkout. CI runs the configured platform matrix when the source is pushed; its results are available in the repository's GitHub Actions page. Windows coverage is limited to install, syntax, build, manifest, and fixture checks.
