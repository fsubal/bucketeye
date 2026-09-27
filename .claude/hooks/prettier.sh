#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit) フック: Claude Code が編集したファイルにプロジェクトの Prettier をかける。
# VS Code の formatOnSave と同じ .prettierrc.json を使うので、人が保存しても差分が出ない。
# 整形に失敗しても（構文エラーの途中状態など）編集自体は止めない。
set -u

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$root" || exit 0

# mise があれば mise.toml の Node で動かす（無ければ PATH の node）
run=()
if command -v mise >/dev/null 2>&1; then run=(mise x --); fi

# stdin の JSON から編集されたファイルのパスを取り出す（jq に依存しない）
file="$("${run[@]}" node -e '
  let s = "";
  process.stdin.on("data", (c) => (s += c)).on("end", () => {
    try {
      const j = JSON.parse(s);
      process.stdout.write(String(j.tool_response?.filePath ?? j.tool_input?.file_path ?? ""));
    } catch {}
  });
')"

[ -n "$file" ] || exit 0
# プロジェクトの外のファイルは触らない
case "$file" in
  "$root"/*) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

# --ignore-unknown: Prettier が扱えない拡張子は無視。.prettierignore（dist/ など）も効く
"${run[@]}" "$root/node_modules/.bin/prettier" --write --ignore-unknown --log-level warn "$file" >/dev/null 2>&1 || true
exit 0
