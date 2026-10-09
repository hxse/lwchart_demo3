import { record, onlyKeys, integer, text } from '../../src/crypto/options';

export interface DeploymentConfig {
    container_network: string; container_name: string; image_name: string;
    publish_host: '127.0.0.1'; publish_port: number; log_max_size: number;
    remote: { ssh_host: string; root_dir: string };
}
const defaults: DeploymentConfig = {
    container_network: 'trading-net', container_name: 'lwchart-market', image_name: 'localhost/lwchart-market',
    publish_host: '127.0.0.1', publish_port: 5174, log_max_size: 10 * 1024 * 1024,
    remote: { ssh_host: 'rn', root_dir: '~/dev/lwchart_demo3' },
};
function name(value: unknown, label: string) {
    const result = text(value, label);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(result)) throw new Error(`${label} 格式无效`);
    return result;
}
export function deploymentConfig(input: unknown): DeploymentConfig {
    const raw = input === undefined ? {} : record(input, 'deploy');
    onlyKeys(raw, Object.keys(defaults), 'deploy');
    const remote = raw.remote === undefined ? {} : record(raw.remote, 'deploy.remote');
    onlyKeys(remote, ['ssh_host', 'root_dir'], 'deploy.remote');
    const value = { ...defaults, ...raw };
    if (value.publish_host !== '127.0.0.1') throw new Error('部署发布地址只允许 127.0.0.1');
    const image = text(value.image_name, '镜像名称');
    if (!/^localhost\/[a-z0-9][a-z0-9._/-]{0,120}$/.test(image) || image.includes('..')) throw new Error('镜像名称必须是 localhost 下的本地名称');
    const root = text(remote.root_dir ?? defaults.remote.root_dir, '远端目录');
    if (!/^(~\/|\/)[a-zA-Z0-9_./ -]+$/.test(root) || root.split('/').includes('..')) throw new Error('远端目录必须是明确的绝对路径或 ~/ 路径');
    return {
        container_network: name(value.container_network, '容器网络'), container_name: name(value.container_name, '容器名称'), image_name: image,
        publish_host: '127.0.0.1', publish_port: integer(value.publish_port, 1, 65535, '发布端口'),
        log_max_size: integer(value.log_max_size, 1024, 100 * 1024 * 1024, '日志上限'),
        remote: { ssh_host: name(remote.ssh_host ?? defaults.remote.ssh_host, 'SSH 主机'), root_dir: root },
    };
}
