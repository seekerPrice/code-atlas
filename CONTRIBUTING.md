# Contributing to Code Atlas

Thanks for helping make code easier to understand. Issues and pull requests are welcome.

## Local setup

Use Node.js 22 or newer. Run `npm ci`, `npm run build`, and `npm test`. The app's static browsing features work without Codex; AI features need a signed-in Codex CLI. Please use the included Tiny Tasks example or your own test project for contributions. Never include code, screenshots, logs, or credentials from a project you do not have permission to share.

Before opening a pull request, run `npm run release:check`. Describe the behavior you changed and how you verified it. Add a focused test when behavior or a security boundary changes. Keep documentation and examples generic and reproducible.

By contributing, you agree that your contribution is licensed under the MIT License in [LICENSE](LICENSE).
