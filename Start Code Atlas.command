#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [[ ! -d node_modules ]]; then
  npm install --no-audit --no-fund || exit 1
fi
npm run build || exit 1
(sleep 2; open "http://127.0.0.1:${PORT:-4317}") &
npm start
