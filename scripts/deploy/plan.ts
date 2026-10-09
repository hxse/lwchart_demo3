import { configProfile, readConfig, configurationFiles, configurationId } from '../config-profile';
import { record, integer } from '../../src/crypto/options';
import { deploymentConfig } from './schema';

export async function deploymentPlan(path: string, selected: string) {
    const profile = configProfile(selected);
    if (profile === 'dev') throw new Error('部署目标必须是 local 或 remote');
    const config = await readConfig(path, profile);
    const deploy = deploymentConfig(config.deploy);
    const server = record(config.server, 'server');
    const config_files = await configurationFiles(path, profile);
    if (config_files.some(file => /[:,\r\n]/.test(file.source))) throw new Error('容器配置路径不能含冒号、逗号或换行');
    return { ...deploy, server_port: integer(server.port, 1, 65535, '端口'),
        profile, config_files, configuration_id: await configurationId(config_files) };
}
if (import.meta.main) {
    try { console.log(JSON.stringify(await deploymentPlan(process.argv[2] || 'config.toml', process.argv[3] || ''))); }
    catch (e) { console.error(e instanceof Error ? e.message : '无法读取部署配置'); process.exit(2); }
}
