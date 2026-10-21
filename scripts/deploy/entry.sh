#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
target='' config='config.toml' upload=false build=false skip_config=false lifecycle_action='' query_action='' help_requested=false
seen=()
help() {
    echo 'just deploy --target=local|remote [--config=config.toml] [--upload] [--build] [--start|--restart|--stop] [--skip-config]'
    echo '--build 成功后才启停；--start 拒绝已运行实例；--restart 停止后重新加载配置启动'
    echo 'just deploy --target=local|remote --status|--logs：独立查询，不启用开机自启'
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
        --start|--restart|--stop) [[ -z "$lifecycle_action" ]] || fail '--stop、--start、--restart 三选一'; lifecycle_action=${arg#--} ;;
        --skip-config) skip_config=true ;;
        --status|--logs) [[ -z "$query_action" ]] || fail '状态或日志必须单独查询'; query_action=${arg#--} ;;
        *) fail '部署参数无效，请使用 --help' ;;
    esac
done
if [[ "$help_requested" == 'true' ]]; then help; exit 0; fi
if [[ "$upload$build$lifecycle_action$query_action" == 'falsefalse' ]]; then
    [[ "$skip_config" == 'false' ]] || fail '--skip-config 只能用于远程上传'
    help; exit 0
fi
[[ -n "$target" ]] || fail '部署动作必须明确 --target=local 或 remote'
[[ "$target" == 'remote' || "$upload" == 'false' ]] || fail '--upload 仅用于远程'
[[ "$skip_config" == 'false' || ( "$target" == 'remote' && "$upload" == 'true' ) ]] || fail '--skip-config 只能用于远程上传'
[[ -z "$query_action" || "$upload$build$lifecycle_action" == 'falsefalse' ]] || fail '状态或日志不能与上传、构建或启停组合'
cd -- "$root"
state="$root/.deploy/$target"
mkdir -p -- "$state"
if [[ -n "$query_action" || ( "$lifecycle_action" == 'stop' && "$upload$build" == 'falsefalse' ) ]]; then
    control_action=${query_action:-$lifecycle_action}
    if [[ "$target" == 'local' ]]; then exec bash scripts/deploy/engine.sh "$state" "$control_action"; fi
    source scripts/deploy/remote.sh
    remote_control "$control_action"
    exit 0
fi
for tool in jq flock; do command -v "$tool" >/dev/null || fail "缺少部署工具：$tool"; done
exec 8>"$state/driver.lock"
flock -n 8 || fail '此目标已有另一项部署操作'
actions=()
[[ "$build" == 'false' ]] || actions+=(build)
[[ -z "$lifecycle_action" ]] || actions+=("$lifecycle_action")
if [[ "$target" == 'remote' ]]; then
    source scripts/deploy/remote.sh
    if [[ "$upload" == 'true' ]]; then
        command -v bun >/dev/null || fail '缺少部署工具：bun'
        remote_upload "${actions[@]}";
    else remote_existing "${actions[@]}"; fi
    exit 0
fi
command -v bun >/dev/null || fail '缺少部署工具：bun'
plan_json=$(APP_CONFIG_PROFILE=local bun scripts/deploy/plan.ts "$config" local)
if [[ "$build" == 'true' ]]; then inputs=$(bun scripts/deploy/inputs.ts);
else
    [[ -f "$state/pending.json" ]] || fail '未准备本地版本，请先 --build'
    inputs=$(jq '{id:.source_id,directory:.source_dir}' "$state/pending.json")
fi
jq --arg id "$(jq -r .id <<< "$inputs")" --arg directory "$(jq -r .directory <<< "$inputs")" \
    '. + {source_id:$id,source_dir:$directory}' <<< "$plan_json" > "$state/incoming.json"
exec bash scripts/deploy/engine.sh "$state" apply "$state/incoming.json" "${actions[@]}"
