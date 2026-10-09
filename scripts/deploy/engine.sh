#!/usr/bin/env bash
set -euo pipefail

deploy_state=$1
shift
for tool in podman jq curl flock sha256sum; do command -v "$tool" >/dev/null || { echo "缺少部署工具：$tool" >&2; exit 2; }; done
mkdir -p -- "$deploy_state"
if [[ "$1" != 'status' && "$1" != 'logs' ]]; then
    exec 9>"$deploy_state/operation.lock"
    flock -n 9 || { echo '此实例正在执行另一项部署操作' >&2; exit 2; }
fi
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
source "$script_dir/lifecycle.sh"
# 容器后台进程不得继承部署互斥锁。
podman() { command podman "$@" 8>&- 9>&-; }
if [[ "$1" == 'status' || "$1" == 'logs' || "$1" == 'stop' ]]; then control "$1"; exit 0; fi
if [[ "$1" == 'apply' ]]; then
    incoming=$2
    [[ -f "$incoming" ]] || { echo '待用版本元数据缺失' >&2; exit 2; }
    source_dir=$(jq -r .source_dir "$incoming")
    [[ -f "$source_dir/.manifest.sha256" ]] || { echo '缺少源码内容清单' >&2; exit 2; }
    (cd -- "$source_dir"; sha256sum --quiet -c .manifest.sha256)
    cp -- "$incoming" "$deploy_state/pending.next"
    mv -- "$deploy_state/pending.next" "$deploy_state/pending.json"
    shift 2
    if (( $# == 0 )); then echo '完整待用版本已准备'; exit 0; fi
fi
plan="$deploy_state/pending.json"
[[ -f "$plan" ]] || { echo '没有完整待用版本，请先准备或上传' >&2; exit 2; }
profile=$(jq -r .profile "$plan")
container=$(jq -r .container_name "$plan")
source_dir=$(jq -r .source_dir "$plan")
source_id=$(jq -r .source_id "$plan")
image=$(jq -r .image_name "$plan"):$source_id
[[ "$profile" == 'local' || "$profile" == 'remote' ]] || { echo '部署场景无效' >&2; exit 2; }
[[ $(podman info --format '{{.Host.Arch}}') == 'amd64' ]] || { echo '本任务镜像基底仅支持已核对的原生 amd64' >&2; exit 2; }
for action in "$@"; do
    if [[ "$action" == 'build' ]]; then
        (cd -- "$source_dir"; sha256sum --quiet -c .manifest.sha256)
        if podman image exists "$image"; then echo '复用同内容生产镜像';
        else podman build --layers --label app.owner=lwchart_demo3 --label "app.source=$source_id" -t "$image" -f "$source_dir/Containerfile" "$source_dir"; fi
        printf '%s\n' "$image" > "$deploy_state/prepared-image"
    elif [[ "$action" == 'start' ]]; then
        podman image exists "$image" || { echo '没有配套镜像，请先执行 --build' >&2; exit 2; }
        start_instance
    else echo '部署动作无效' >&2; exit 2
    fi
done
