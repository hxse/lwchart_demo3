#!/usr/bin/env bash

# 仅操作同项目、同场景标签的实例；不按端口或模糊名称删除资源。
owned() {
    local selected=$1 expected=$2
    [[ $(podman inspect "$selected" --format '{{index .Config.Labels "app.owner"}}') == 'lwchart_demo3' &&
       $(podman inspect "$selected" --format '{{index .Config.Labels "app.profile"}}') == "$expected" ]]
}
control() {
    local action=$1 active="$deploy_state/active.json" selected expected
    [[ -f "$active" ]] || { echo '尚无已登记的部署实例'; return; }
    selected=$(jq -r .container_name "$active"); expected=$(jq -r .profile "$active")
    podman container exists "$selected" || { echo '已登记容器当前不存在'; return; }
    owned "$selected" "$expected" || { echo '同名容器不属于当前部署，拒绝操作' >&2; return 2; }
    case "$action" in
        status) podman inspect "$selected" --format '{{.Name}} {{.State.Status}} {{.Image}}'; podman port "$selected" ;;
        logs) podman logs --tail 100 "$selected" ;;
        stop) podman stop --time 10 "$selected" ;;
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
    local runtime network port internal config_id old_id='' old_image='' backup='' old_name="$container" ready=false new_image
    config_mounts
    runtime=$(image_check "$image" --plan none)
    network=$(jq -r .container_network <<< "$runtime")
    port=$(jq -r .publish_port <<< "$runtime"); internal=$(jq -r .server_port <<< "$runtime")
    [[ $(jq -r .publish_host <<< "$runtime") == '127.0.0.1' && $(jq -r .container_name <<< "$runtime") == "$container" ]] || {
        echo '运行配置与待用实例元数据不一致' >&2; return 2;
    }
    config_id=$(jq -r .configuration_id "$plan")
    new_image=$(podman image inspect "$image" --format '{{.Id}}')
    [[ $(jq -r .configuration_id <<< "$runtime") == "$config_id" ]] || { echo '配置在准备后已改变，请重新准备部署' >&2; return 2; }
    podman network exists "$network" || { echo '共享网络不存在，请先准备后端网络' >&2; return 2; }
    [[ $(podman network inspect "$network" --format '{{.DNSEnabled}}') == 'true' ]] || { echo '共享网络必须启用 DNS' >&2; return 2; }
    image_check "$image" --probe-backend "$network"
    if [[ -f "$deploy_state/active.json" ]]; then old_name=$(jq -r .container_name "$deploy_state/active.json"); fi
    if [[ "$old_name" != "$container" ]] && podman container exists "$container"; then echo '目标名称已被占用，拒绝创建第二个实例' >&2; return 2; fi
    if podman container exists "$old_name"; then
        owned "$old_name" "$profile" || { echo '同名容器不属于当前部署，拒绝替换' >&2; return 2; }
        old_id=$(podman inspect "$old_name" --format '{{.Id}}'); old_image=$(podman inspect "$old_name" --format '{{.Image}}')
        if [[ "$old_name" == "$container" && "$old_image" == "$new_image" && $(podman inspect "$old_name" --format '{{index .Config.Labels "app.source"}}') == "$source_id" &&
              $(podman inspect "$old_name" --format '{{index .Config.Labels "app.config"}}') == "$config_id" &&
              $(podman inspect "$old_name" --format '{{.State.Running}}') == 'true' ]]; then echo '实例已运行，无需重复启动'; return; fi
        if [[ "$profile" == 'local' ]]; then
            [[ -f "$deploy_state/active.json" && $(jq -r .server_port "$deploy_state/active.json") == "$internal" ]] || {
                echo '本地内部端口已改变或实例未登记，无法保证原配置恢复；原实例未停止' >&2; return 2;
            }
            image_check "$old_image" --check none
        fi
        backup="${container}-previous-$$"
        podman stop --time 10 "$old_id"
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
        if podman container exists "$container" && owned "$container" "$profile"; then podman logs --tail 15 "$container" >&2 || true; fi
        if podman container exists "$container" && owned "$container" "$profile"; then podman rm -f "$container"; fi
        if [[ -n "$backup" ]]; then podman rename "$old_id" "$old_name"; podman start "$old_id"; fi
        echo '新实例未就绪，已保留并恢复原实例（如存在）' >&2; return 1
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
