#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
target='' config='config.toml' upload=false build=false start=false skip_config=false control_action='' help_requested=false
seen=()
help() {
    echo 'just deploy --target=local|remote [--config=config.toml] [--upload] [--build] [--start] [--skip-config]'
    echo 'just deploy --target=local|remote --status|--logs|--stop：独立控制，不启用开机自启'
}
fail() { echo "$1" >&2; exit 2; }
for arg in "$@"; do
    key=${arg%%=*}
    for prior in "${seen[@]}"; do [[ "$prior" != "$key" ]] || fail '参数不能重复'; done
    seen+=("$key")
    case "$arg" in
        --help) help_requested=true ;;
        --target=local|--target=remote) target=${arg#--target=} ;;
        --config=*) config=${arg#--config=}; [[ -n "$config" ]] || fail '配置路径不能为空' ;;
        --upload) upload=true ;;
        --build) build=true ;;
        --start) start=true ;;
        --skip-config) skip_config=true ;;
        --status|--logs|--stop) [[ -z "$control_action" ]] || fail '控制动作必须单独使用'; control_action=${arg#--} ;;
        *) fail '部署参数无效，请使用 --help' ;;
    esac
done
if [[ "$help_requested" == 'true' ]]; then help; exit 0; fi
if [[ "$upload$build$start$control_action" == 'falsefalsefalse' ]]; then
    [[ "$skip_config" == 'false' ]] || fail '--skip-config 只能用于远程上传'
    help; exit 0
fi
[[ -n "$target" ]] || fail '部署动作必须明确 --target=local 或 remote'
[[ "$target" == 'remote' || "$upload" == 'false' ]] || fail '--upload 仅用于远程'
[[ "$skip_config" == 'false' || ( "$target" == 'remote' && "$upload" == 'true' ) ]] || fail '--skip-config 只能用于远程上传'
[[ -z "$control_action" || "$upload$build$start" == 'falsefalsefalse' ]] || fail '控制动作不能与上传、构建或启动组合'
cd -- "$root"
state="$root/.deploy/$target"
mkdir -p -- "$state"
if [[ -n "$control_action" ]]; then
    if [[ "$target" == 'local' ]]; then exec bash scripts/deploy/engine.sh "$state" "$control_action"; fi
    source scripts/deploy/remote.sh
    remote_control "$control_action"
    exit 0
fi
for tool in bun jq flock; do command -v "$tool" >/dev/null || fail "缺少部署工具：$tool"; done
exec 8>"$state/driver.lock"
flock -n 8 || fail '此目标已有另一项部署操作'
actions=()
[[ "$build" == 'false' ]] || actions+=(build)
[[ "$start" == 'false' ]] || actions+=(start)
if [[ "$target" == 'remote' ]]; then
    source scripts/deploy/remote.sh
    if [[ "$upload" == 'true' ]]; then remote_upload "${actions[@]}";
    else remote_existing "${actions[@]}"; fi
    exit 0
fi
plan_json=$(APP_CONFIG_PROFILE=local bun scripts/deploy/plan.ts "$config" local)
if [[ "$build" == 'true' ]]; then inputs=$(bun scripts/deploy/inputs.ts);
else
    [[ -f "$state/pending.json" ]] || fail '未准备本地版本，请先 --build'
    current=$(bun scripts/deploy/inputs.ts --fingerprint)
    [[ $(jq -r .id <<< "$current") == $(jq -r .source_id "$state/pending.json") ]] || fail '源码已改变，请先重新 --build'
    inputs=$(jq '{id:.source_id,directory:.source_dir}' "$state/pending.json")
fi
jq --arg id "$(jq -r .id <<< "$inputs")" --arg directory "$(jq -r .directory <<< "$inputs")" \
    '. + {source_id:$id,source_dir:$directory}' <<< "$plan_json" > "$state/incoming.json"
exec bash scripts/deploy/engine.sh "$state" apply "$state/incoming.json" "${actions[@]}"
