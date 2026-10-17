import { join, resolve } from 'node:path';

/** 只消费复制后的声明，禁止通过 src 或 Svelte 源码补齐缺失类型。 */
export async function validateDeclarations(root: string, directory: string, target: string) {
    const esm = join(directory, 'declaration-es.ts');
    const umd = join(directory, 'declaration-umd.ts');
    await Bun.write(esm, `
import Dashboard, { mountDashboard } from ${JSON.stringify(join(target, 'chart-dashboard.es.js'))};
import type { DashboardProps, ChartConfigJSON, SeriesItemConfig, IndicatorAnnotation, SeriesConfig, SeriesDataPatch, ChartApi, PaneWeightMode } from ${JSON.stringify(join(target, 'chart-dashboard.es.js'))};
import type { Component } from 'svelte';
import type { UTCTimestamp } from 'lightweight-charts';
const props: DashboardProps = { zipData: new Blob(), config: { show: ['0,0,0,1'] } };
const component: Component<DashboardProps> = Dashboard;
mountDashboard(document.createElement('div'), props);
const annotation: IndicatorAnnotation = { id: 'rsi', spec: { type: 'rsi', period: 14 }, output: 'value' };
const item: SeriesItemConfig = { type: 'line', show: true, indicator: annotation, referenceFor: undefined };
const reference: SeriesItemConfig = { type: 'hline', show: false, referenceFor: 'rsi', hLineOpt: { value: 50, color: '#888888' } };
const config: ChartConfigJSON = { template: 'single', showBottomRow: false, viewMode: 'chart', selectedInternalFileName: 'a.json', chart: [[[item, reference]]] };
const line: SeriesConfig = { type: 'Line', data: [], pane: 1, name: 'line', displayName: 'RSI14', valueFormatter: String, paneWeight: 1 };
const patch: SeriesDataPatch = { name: 'line', data: [{ time: 1718000000 as UTCTimestamp, value: 0, color: '#888888' }, { time: 1718000060 as UTCTimestamp, customValues: { displayValue: '未定义' } }] };
declare const api: ChartApi;
const weightMode: PaneWeightMode = 'preset';
api.updateSeriesData([patch]); api.replaceSeriesData([patch]);
api.setPriceLineGroup({ series: 'line', id: 'example', autoscale: true, labelPosition: 'left',
  lines: [{ id: 'entry', price: 100, color: '#60a5fa', title: '示例' }] });
api.clearPriceLineGroup('line', 'example');
// @ts-expect-error 标签只支持原生价格轴或绘图区左侧
api.setPriceLineGroup({ series: 'line', id: 'example', labelPosition: 'right', lines: [] });
// @ts-expect-error 价格线价格必须为数值
api.setPriceLineGroup({ series: 'line', id: 'example', lines: [{ id: 'entry', price: '100', color: '#fff', title: '示例' }] });
// @ts-expect-error 非法角色必须被产物中的类型拒绝
annotation.output = 'unknown';
// @ts-expect-error 仅允许两种明确的权重模式
const invalidMode: PaneWeightMode = 'unknown';
// @ts-expect-error displayName 是文本
line.displayName = false;
// @ts-expect-error 引用组身份是文本
item.referenceFor = 42;
// @ts-expect-error 指标参数不可缺失
annotation.spec = { type: 'ema' };
// @ts-expect-error 补丁数值不能是文本
patch.data = [{ time: 1718000000 as UTCTimestamp, value: 'invalid' }];
// @ts-expect-error 挂载入口采用真实 props 类型
mountDashboard(document.createElement('div'), { unknown: true });
void [component, config, weightMode, invalidMode];
`);
    const reference = join(target, 'chart-dashboard.umd.d.ts').replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    await Bun.write(umd, `/// <reference path="${reference}" />
const globalSpec: ChartDashboardLib.IndicatorSpec = { type: 'macd', fast: 12, slow: 26, signal: 9 };
ChartDashboardLib.mountDashboard(document.createElement('div'), { zipData: new ArrayBuffer(0) });
void globalSpec;
`);
    const config = join(directory, 'declaration-consumer.json');
    await Bun.write(config, JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext',
        moduleResolution: 'bundler', strict: true, noEmit: true, types: [], lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        paths: { svelte: [resolve(root, 'node_modules/svelte/types/index.d.ts')],
            'svelte/*': [resolve(root, 'node_modules/svelte/*')],
            'lightweight-charts': [resolve(root, 'node_modules/lightweight-charts/dist/typings.d.ts')] } }, files: [esm, umd] }));
    const child = Bun.spawn(['bun', '--bun', resolve(root, 'node_modules/@typescript/native/bin/tsc'), '-p', config],
        { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const [output, errors, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (status) throw new Error(`Notebook 声明消费验证失败\n${output}${errors}`);
}
