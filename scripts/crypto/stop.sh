#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
selected_config=$(readlink -m -- "$1")

# 仅匹配本仓库入口及所选配置，不按端口或模糊进程名杀其它程序。
matches() {
    local process_pid=$1 process_cwd process_entry process_config
    local -a process_arguments=()
    process_cwd=$(readlink -f -- "/proc/$process_pid/cwd" 2>/dev/null) || return 1
    [[ "$process_cwd" == "$project_root" ]] || return 1
    mapfile -d '' -t process_arguments < "/proc/$process_pid/cmdline" 2>/dev/null || return 1
    [[ ${#process_arguments[@]} == 4 && "${process_arguments[0]##*/}" == 'bun' ]] || return 1
    [[ "${process_arguments[2]}" == 'dev' || "${process_arguments[2]}" == 'serve' ]] || return 1
    process_entry=$(readlink -m -- "$process_cwd/${process_arguments[1]}")
    if [[ "${process_arguments[1]}" == /* ]]; then process_entry=$(readlink -m -- "${process_arguments[1]}"); fi
    [[ "$process_entry" == "$project_root/scripts/crypto/entry.ts" ]] || return 1
    process_config=$(readlink -m -- "$process_cwd/${process_arguments[3]}")
    if [[ "${process_arguments[3]}" == /* ]]; then process_config=$(readlink -m -- "${process_arguments[3]}"); fi
    [[ "$process_config" == "$selected_config" ]]
}

started_at() {
    local process_stat
    local -a process_fields=()
    process_stat=$(cat -- "/proc/$1/stat" 2>/dev/null) || return 1
    read -r -a process_fields <<< "${process_stat##*) }"
    [[ ${#process_fields[@]} -ge 20 ]] || return 1
    printf '%s' "${process_fields[19]}"
}

stopped=0
for process_directory in /proc/[0-9]*; do
    process_pid=${process_directory##*/}
    matches "$process_pid" || continue
    initial_start=$(started_at "$process_pid") || continue
    matches "$process_pid" || continue
    [[ "$(started_at "$process_pid" || true)" == "$initial_start" ]] || continue
    if ! kill -TERM -- "$process_pid" 2>/dev/null; then
        if [[ "$(started_at "$process_pid" || true)" == "$initial_start" ]] && matches "$process_pid"; then
            printf '无法停止看盘进程（PID %s），请核对进程权限\n' "$process_pid" >&2
            exit 1
        fi
        continue
    fi
    for ((attempt = 0; attempt < 50; attempt++)); do
        [[ "$(started_at "$process_pid" || true)" != "$initial_start" ]] && break
        sleep 0.1
    done
    if [[ "$(started_at "$process_pid" || true)" == "$initial_start" ]] && matches "$process_pid"; then
        if ! kill -KILL -- "$process_pid" 2>/dev/null && matches "$process_pid"; then
            printf '看盘进程未能退出（PID %s）\n' "$process_pid" >&2
            exit 1
        fi
    fi
    printf '已停止看盘进程（PID %s）\n' "$process_pid"
    stopped=$((stopped + 1))
done
if (( stopped == 0 )); then echo '所选配置没有运行中的看盘进程'; fi
