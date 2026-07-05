#!/usr/bin/env bash
# 使い方:
#   ./deploy.sh "コミットメッセージ"
#   npm run deploy -- "コミットメッセージ"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MSG="${*:-更新}"

CURRENT="$(grep -oE 'shelf-cleaning-v[0-9]+' sw.js | head -1 | grep -oE '[0-9]+$')"
NEXT=$((CURRENT + 1))

echo "キャッシュ v${CURRENT} → v${NEXT} に更新..."

perl -pi -e "s/shelf-cleaning-v${CURRENT}/shelf-cleaning-v${NEXT}/g" sw.js
perl -pi -e "s/\\?v=${CURRENT}/?v=${NEXT}/g" sw.js index.html js/app.js simple/sw.js simple/index.html simple/js/app.js 2>/dev/null || perl -pi -e "s/\\?v=${CURRENT}/?v=${NEXT}/g" sw.js index.html js/app.js

git add -A

if git diff --staged --quiet; then
  echo "変更なし（デプロイ不要）"
  exit 0
fi

git commit -m "$MSG"
git push origin main

echo ""
echo "デプロイ完了"
echo "  バージョン: v${NEXT}"
echo "  URL: https://ufjkkaio.github.io/sev145/"
