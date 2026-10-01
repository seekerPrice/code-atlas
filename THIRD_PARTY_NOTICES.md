# Third-party notices

Code Atlas depends on open-source packages installed from npm. The lockfile records exact versions. The browser bundle contains code from DOMPurify, highlight.js, and Marked; server and build dependencies are installed separately with `npm ci` or `npm install`.

| Package | License shown in npm registry | Use |
| --- | --- | --- |
| DOMPurify | MPL-2.0 OR Apache-2.0 | HTML sanitization in browser bundle |
| highlight.js | BSD-3-Clause | Source highlighting in browser bundle |
| Marked | MIT | Markdown rendering in browser bundle |
| ignore | MIT | Gitignore matching |
| TypeScript | Apache-2.0 | Source analysis and theme parsing |
| esbuild | MIT | Development build tool |
| jsdom | MIT | Development tests |

The project elects DOMPurify's Apache-2.0 option. The browser bundle's license texts are retained in [`licenses/`](licenses/): DOMPurify (copyright Cure53 and other contributors), highlight.js (copyright Ivan Sagalaev), and Marked (copyright Marked contributors). Full notices and license texts for separately installed dependencies are included in their npm packages under `node_modules` after installation. Their upstream terms apply to their code. Recheck package metadata and the audit before each release.

## Demo soundtrack

"Inspired" by Kevin MacLeod ([incompetech.com](https://incompetech.com/)), ISRC USUAN1600022, is used in `docs/demo/code-atlas-demo.mp4` under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). [Original track](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600022).

Changes: excerpt starting at 16 seconds, volume normalized, fade in and out, and synchronized to the Code Atlas demonstration. The video includes an end credit. Keep this attribution and license link when sharing the video. The music retains its CC BY 4.0 license; Code Atlas's MIT license does not relicense it. No endorsement by the composer is implied.
