#!/usr/bin/env bash
set -euo pipefail

scenario=$1
shift
config_path='config.toml'
action='dev'
if [[ "$scenario" == 'legacy' ]]; then action='build'; fi
action_count=0
show_help=false
for argument in "$@"; do
    case "$argument" in
        --help) show_help=true ;;
        --config=*) config_path=${argument#--config=}; [[ -n "$config_path" ]] || { echo '配置路径不能为空' >&2; exit 2; } ;;
        --dev|--build|--serve|--stop)
            action=${argument#--}
            action_count=$((action_count + 1)) ;;
        *) echo '未知参数，请使用 --help' >&2; exit 2 ;;
    esac
done
if (( action_count > 1 )); then echo '动作参数互斥' >&2; exit 2; fi
if [[ "$scenario" == 'legacy' && "$action" != 'build' ]]; then echo '旧场景仅支持 --build' >&2; exit 2; fi
if [[ "$show_help" == 'true' ]]; then
    if [[ "$scenario" == 'legacy' ]]; then
        echo 'just legacy [--build] [--config=config.toml]：构建并复制 Notebook 图表库'
    else
        echo 'just crypto [--dev|--build|--serve|--stop] [--config=config.toml]：运行、构建或停止看盘'
    fi
    exit 0
fi
if [[ "$scenario" == 'legacy' ]]; then
    library_target=$(bun scripts/legacy-config.ts "$config_path")
    bun --bun node_modules/vite/bin/vite.js build --config vite.config.lib.ts
    mkdir -p -- "$library_target"
    cp -r -- dist-lib/. "$library_target/"
else
    if [[ "$action" == 'stop' ]]; then exec bash scripts/crypto/stop.sh "$config_path"; fi
    exec bun scripts/crypto/entry.ts "$action" "$config_path"
fi
