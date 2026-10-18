import { expect, test } from 'bun:test';
import { convertToBlob } from '../../src/pages/ChartDashboard/state/FileLoader';

test('Base64 转 Blob 保留完整字节、空输入及 MIME，非法编码仍明确报错', async () => {
    const bytes = Uint8Array.from({ length: 1024 }, (_, index) => index % 256);
    const encoded = btoa(String.fromCharCode(...bytes));
    const blob = convertToBlob(encoded);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(blob.type).toBe('application/zip');
    expect(convertToBlob('').size).toBe(0);
    expect(new Uint8Array(await convertToBlob('AAH/').arrayBuffer())).toEqual(new Uint8Array([0, 1, 255]));
    let failure: unknown;
    try { convertToBlob('not base64!'); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(DOMException); expect((failure as DOMException).name).toBe('InvalidCharacterError');
});

test('已有 Blob 原样返回，ArrayBuffer 分支保留数据和独立 Blob 快照', async () => {
    const original = new Blob(['already'], { type: 'text/plain' });
    expect(convertToBlob(original)).toBe(original);
    const bytes = new Uint8Array([0, 1, 255]), blob = convertToBlob(bytes.buffer);
    bytes[1] = 99;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0, 1, 255]));
    expect(blob.type).toBe('application/zip');
});
