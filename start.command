#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if [[ -x .venv/bin/python ]]; then
  .venv/bin/python launcher.py "$@"
  result=$?
elif command -v uv >/dev/null 2>&1; then
  uv sync --frozen && uv run python launcher.py "$@"
  result=$?
else
  echo "Для запуска установите uv по инструкции https://docs.astral.sh/uv/"
  result=1
fi
if [[ $result -ne 0 ]]; then
  read -r "?Не удалось запустить Pitwall. Нажмите Enter, чтобы закрыть окно."
fi
exit $result
