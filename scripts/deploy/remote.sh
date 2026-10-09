#!/usr/bin/env bash

ssh_call() {
    local host=$1 quoted
    shift
    printf -v quoted '%q ' "$@"
    ssh -o BatchMode=yes -o ConnectTimeout=8 "$host" "$quoted"
}
transport() {
    [[ -f "$state/transport.json" ]] || { echo '尚未准备远端部署，请先 --upload' >&2; return 2; }
    ssh_host=$(jq -r .ssh_host "$state/transport.json")
    remote_state=$(jq -r .state "$state/transport.json")
    remote_engine=$(jq -r .engine "$state/transport.json")
}
remote_control() {
    if [[ ! -f "$state/transport.json" ]]; then echo '尚无已登记的远端部署'; return; fi
    transport
    ssh_call "$ssh_host" bash "$remote_engine" "$remote_state" "$1"
}
remote_existing() {
    transport
    ssh_call "$ssh_host" bash "$remote_engine" "$remote_state" "$@"
}
remote_upload() {
    for tool in ssh rsync jq; do command -v "$tool" >/dev/null || fail "缺少部署工具：$tool"; done
    local metadata inputs source_id local_source remote_root config_dir config_id incoming remote_uid remote_gid
    metadata=$(APP_CONFIG_PROFILE=remote bun scripts/deploy/plan.ts "$config" remote)
    inputs=$(bun scripts/deploy/inputs.ts)
    source_id=$(jq -r .id <<< "$inputs"); local_source=$(jq -r .directory <<< "$inputs")
    ssh_host=$(jq -r .remote.ssh_host <<< "$metadata")
    remote_uid=$(ssh_call "$ssh_host" id -u)
    remote_gid=$(ssh_call "$ssh_host" id -g)
    remote_root=$(jq -r .remote.root_dir <<< "$metadata")
    if [[ "$remote_root" == '~/'* ]]; then
        local remote_home
        remote_home=$(ssh_call "$ssh_host" bash -c 'printf "%s\n" "$HOME"')
        remote_root="$remote_home/${remote_root:2}"
    fi
    remote_state="$remote_root/.deploy"
    ssh_call "$ssh_host" bash -c '
        set -e; state=$1; root=$2
        test ! -L "$root" && test ! -L "$state" || { echo "部署目录不能是符号链接" >&2; exit 2; }
        if test -d "$state" && ! test -f "$state/owner" && test -n "$(ls -A "$state")"; then
            echo "远端状态目录已有未归属内容" >&2; exit 2
        fi
        mkdir -p "$state"; chmod 700 "$state"
        if test -f "$state/owner"; then test "$(cat "$state/owner")" = lwchart_demo3;
        else printf "lwchart_demo3\n" > "$state/owner"; fi
    ' -- "$remote_state" "$remote_root"
    local remote_source="$remote_state/releases/$source_id/source"
    ssh_call "$ssh_host" mkdir -p "$remote_source" "$remote_state/configs" "$remote_state/incoming"
    rsync -a --checksum --delete --protect-args -e 'ssh -o BatchMode=yes -o ConnectTimeout=8' -- "$local_source/" "$ssh_host:$remote_source/"
    if [[ "$skip_config" == 'true' ]]; then
        local previous
        previous=$(ssh_call "$ssh_host" bash -c '
            set -e; state=$1
            if test -f "$state/active.json"; then cat "$state/active.json";
            elif test -f "$state/pending.json"; then cat "$state/pending.json";
            else echo "首次部署不能跳过完整配置" >&2; exit 2; fi
        ' -- "$remote_state")
        config_id=$(jq -r .configuration_id <<< "$previous")
        metadata=$(jq --argjson previous "$previous" '.config_files=$previous.config_files | .container_name=$previous.container_name | .configuration_id=$previous.configuration_id' <<< "$metadata")
    else
        config_id=$(jq -r .configuration_id <<< "$metadata")
        config_dir="$remote_state/configs/$config_id"
        ssh_call "$ssh_host" bash -c 'mkdir -p "$1"; chmod 700 "$1"' -- "$config_dir"
        while IFS= read -r row; do
            local file name
            file=$(jq -r .source <<< "$row"); name=$(jq -r .name <<< "$row")
            rsync -a --checksum --protect-args --chown="$remote_uid:$remote_gid" --chmod=F600,D700 -e 'ssh -o BatchMode=yes -o ConnectTimeout=8' -- "$file" "$ssh_host:$config_dir/$name"
        done < <(jq -c '.config_files[]' <<< "$metadata")
        metadata=$(jq --arg directory "$config_dir" '.config_files |= map(.source=($directory+"/"+.name))' <<< "$metadata")
    fi
    incoming="$state/incoming.json"
    jq --arg id "$source_id" --arg directory "$remote_source" '. + {source_id:$id,source_dir:$directory}' <<< "$metadata" > "$incoming"
    local remote_incoming="$remote_state/incoming/$source_id-$config_id.json"
    rsync -a --checksum --protect-args --chmod=F600,D700 -e 'ssh -o BatchMode=yes -o ConnectTimeout=8' -- "$incoming" "$ssh_host:$remote_incoming"
    remote_engine="$remote_source/scripts/deploy/engine.sh"
    jq -n --arg host "$ssh_host" --arg state "$remote_state" --arg engine "$remote_engine" \
        '{ssh_host:$host,state:$state,engine:$engine}' > "$state/transport.next"
    mv -- "$state/transport.next" "$state/transport.json"
    ssh_call "$ssh_host" bash "$remote_engine" "$remote_state" apply "$remote_incoming" "$@"
}
