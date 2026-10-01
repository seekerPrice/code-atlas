# Backend release audit

The local backend was reviewed against the project architecture and exercised with temporary source and Git fixtures. The audit covered server startup and local API access, indexed source boundaries, explanation and cache freshness, Git change selection, feature and test discovery, source search, and the Codex bridge. No external project was executed or changed.

## Fixed and reproduced

| Area | Failure demonstrated before the fix | Result |
| --- | --- | --- |
| Explanation concurrency | A request that paused while uploading its body could pass the initial busy check; another explanation could start before the first body completed, allowing both to call the explanation bridge. | The operation state is checked again after body parsing. A regression test holds the first upload open and confirms only one bridge call and a `409` response for the late request. Project opening uses the same post-body check. |
| Source text search | Text search returned newly edited source as though it belonged to the older index revision. | Changed or unreadable files are excluded and the response reports limited results. |
| File search bounds | More than 80 matching paths were truncated without a `limited` flag. | The flag now reflects truncation. |
| Reading journey selection | A symbol from another file could be supplied with a selected file, producing a journey that started in the wrong source. | The API rejects symbols that do not belong to the selected file. |
| Saved explanation depth | Saved answers omitted the requested explanation depth, so restoring a syntax explanation lost its context. | New answers retain depth through immediate delivery, persistent cache reuse, and the saved-answer list. |

## Verification

- `npm test`: 83 passed, 0 failed after integration with the frontend workflow fixes.
- Focused tests reproduced each listed failure before its fix, then passed afterward. Temporary fixtures were removed by the tests.
- The installed Codex CLI reports a ChatGPT login. Bridge tests check that API credential variables are removed and ChatGPT authentication is forced in the execution arguments. No live generation was made for this audit.
- Git tests check staged, unstaged, deleted, and untracked changes with temporary repositories, and verify that a configured clean filter is not executed.

## Practical limits

Passing tests do not prove every project shape or every Codex service state. A live explanation, login renewal, model allowance exhaustion, and a user closing the browser mid-generation were not exercised against the signed-in service. Static navigation and test discovery remain heuristic, and the index intentionally skips some files. Source citations validate that a location was supplied, not that an AI claim is correct.
