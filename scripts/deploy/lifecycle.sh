#!/usr/bin/env bash

# 仅操作同项目、同场景标签的实例；不按端口或模糊名称删除资源。
owned() {
    local selected=$1 expected=$2
    [[ $(podman inspect "$selected" --format '{{index .Config.Labels "app.owner"}}') == 'lwchart_demo3' &&
       $(podman inspect "$selected" --format '{{index .Config.Labels "app.profile"}}') == "$expected" ]]
}
container_presence() {
    local status=0
    podman container exists "$1" >/dev/null || status=$?
    case "$status" in
        0) echo present ;;
        1) echo absent ;;
        *) echo '无法查询容器是否存在，拒绝继续启停' >&2; return "$status" ;;
    esac
}
running_state() {
    local value
    value=$(podman inspect "$1" --format '{{.State.Running}}') || return
    [[ "$value" == 'true' || "$value" == 'false' ]] || { echo '无法确认容器运行状态' >&2; return 2; }
    printf '%s\n' "$value"
}
control() {
    local action=$1 active="$deploy_state/active.json" selected expected presence running
    [[ -f "$active" ]] || { echo '尚无已登记的部署实例'; return; }
    selected=$(jq -r .container_name "$active"); expected=$(jq -r .profile "$active")
    presence=$(container_presence "$selected") || return
    [[ "$presence" == 'present' ]] || { echo '已登记容器当前不存在'; return; }
    owned "$selected" "$expected" || { echo '同名容器不属于当前部署，拒绝操作' >&2; return 2; }
    case "$action" in
        status) podman inspect "$selected" --format '{{.Name}} {{.State.Status}} {{.Image}}'; podman port "$selected" ;;
        logs) podman logs --tail 100 "$selected" ;;
        stop)
            running=$(running_state "$selected") || return
            if [[ "$running" == 'false' ]]; then echo '实例已停止'; return; fi
            podman stop --time 10 "$selected"
            running=$(running_state "$selected") || return
            [[ "$running" == 'false' ]] || { echo '实例未能停止，拒绝继续启动' >&2; return 2; }
            ;;
    esac
}
config_mounts() {
    mounts=()
    while IFS= read -r row; do
        local source name
        source=$(jq -r .source <<< "$row"); name=$(jq -r .name <<< "$row")
        [[ -f "$source" ]] || { echo '完整配置快照缺失' >&2; return 2; }
        mounts+=(--mount "type=bind,src=$source,dst=/app/config/$name,ro")
    done < <(jq -c '.config_files[]' "$plan")
}
image_check() {
    local selected=$1 action=$2 network=$3
    podman run --rm --pull=never --network "$network" --userns=keep-id --user "$(id -u):$(id -g)" \
        --read-only --tmpfs /tmp:rw,mode=1777 --cap-drop=all --security-opt=no-new-privileges \
        --env "APP_CONFIG_PROFILE=$profile" "${mounts[@]}" "$selected" "$action" /app/config/config.toml
}
start_instance() {
    local runtime network port internal config_id old_id='' old_image='' backup='' old_name="$container" ready=false presence running
    if [[ -f "$deploy_state/active.json" ]]; then old_name=$(jq -r .container_name "$deploy_state/active.json"); fi
    if [[ "$old_name" != "$container" ]]; then
        presence=$(container_presence "$container") || return
        [[ "$presence" == 'absent' ]] || { echo '目标名称已被占用，拒绝创建第二个实例' >&2; return 2; }
    fi
    presence=$(container_presence "$old_name") || return
    if [[ "$presence" == 'present' ]]; then
        owned "$old_name" "$profile" || { echo '同名容器不属于当前部署，拒绝替换' >&2; return 2; }
        running=$(running_state "$old_name") || return
        [[ "$running" == 'false' ]] || {
            echo '实例已运行，--start 不会替换；请使用 --restart' >&2; return 2;
        }
        old_id=$(podman inspect "$old_name" --format '{{.Id}}'); old_image=$(podman inspect "$old_name" --format '{{.Image}}')
    fi
    config_mounts
    runtime=$(image_check "$image" --plan none)
    network=$(jq -r .container_network <<< "$runtime")
    port=$(jq -r .publish_port <<< "$runtime"); internal=$(jq -r .server_port <<< "$runtime")
    [[ $(jq -r .publish_host <<< "$runtime") == '127.0.0.1' && $(jq -r .container_name <<< "$runtime") == "$container" ]] || {
        echo '运行配置与待用实例元数据不一致' >&2; return 2;
    }
    config_id=$(jq -r .configuration_id "$plan")
    [[ $(jq -r .configuration_id <<< "$runtime") == "$config_id" ]] || { echo '配置在准备后已改变，请重新准备部署' >&2; return 2; }
    podman network exists "$network" || { echo '共享容器网络不存在，请先准备配置指定的网络' >&2; return 2; }
    [[ $(podman network inspect "$network" --format '{{.DNSEnabled}}') == 'true' ]] || { echo '共享网络必须启用 DNS' >&2; return 2; }
    if [[ -n "$old_id" ]]; then
        backup="${container}-previous-$$"
        podman rename "$old_id" "$backup"
    fi
    local candidate_failed=false
    podman run -d --pull=never --name "$container" --network "$network" --userns=keep-id --user "$(id -u):$(id -g)" \
        --label app.owner=lwchart_demo3 --label "app.profile=$profile" --label "app.source=$source_id" --label "app.config=$config_id" \
        --env "APP_CONFIG_PROFILE=$profile" --read-only --tmpfs /tmp:rw,mode=1777 --cap-drop=all --security-opt=no-new-privileges \
        --log-driver=k8s-file --log-opt "max-size=$(jq -r .log_max_size <<< "$runtime")" \
        --publish "127.0.0.1:$port:$internal" "${mounts[@]}" "$image" /app/config/config.toml || candidate_failed=true
    if [[ "$candidate_failed" == 'false' ]]; then
        for ((attempt=0; attempt<30; attempt++)); do
            if curl --noproxy '*' --fail --silent --max-time 1 "http://127.0.0.1:$port/healthz" >/dev/null &&
               [[ $(podman inspect "$container" --format '{{.State.Running}}') == 'true' ]]; then ready=true; break; fi
            [[ $(podman inspect "$container" --format '{{.State.Running}}') == 'true' ]] || break
            sleep 0.2
        done
    fi
    if [[ "$ready" != 'true' ]]; then
        presence=$(container_presence "$container") || return
        if [[ "$presence" == 'present' ]] && owned "$container" "$profile"; then
            podman logs --tail 15 "$container" >&2 || true
            podman rm -f "$container"
        fi
        if [[ -n "$backup" ]]; then podman rename "$old_id" "$old_name"; fi
        echo '新实例未就绪，原实例保持停止；不会自动恢复启动' >&2; return 1
    fi
    jq --arg image "$image" --argjson port "$port" --argjson internal "$internal" \
        '. + {image:$image,publish_port:$port,server_port:$internal}' "$plan" > "$deploy_state/active.next"
    mv -- "$deploy_state/active.next" "$deploy_state/active.json"
    if [[ -n "$old_id" ]]; then
        podman rm "$old_id"
        local current_image
        current_image=$(podman inspect "$container" --format '{{.Image}}')
        if [[ "$old_image" != "$current_image" && -z $(podman ps -a --filter "ancestor=$old_image" -q) ]]; then
            podman rmi "$old_image" || echo '旧镜像仍有引用，已保留；新实例正常运行' >&2
        fi
    fi
    echo "看盘容器已就绪：http://127.0.0.1:$port"
}
