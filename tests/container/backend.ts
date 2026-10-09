// 仅用于缓存镜像的离线容器验证，不请求真实后端。
const server = Bun.serve({ hostname: '0.0.0.0', port: 5123, async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.json({ ready: true });
    if (url.pathname === '/auth/token') {
        const data = await request.formData();
        if (data.get('username') !== 'container-user' || data.get('password') !== 'CONTAINER_PRIVATE_MARKER') return new Response(null, { status: 401 });
        return Response.json({ access_token: 'container-token', token_type: 'bearer', expires_in: 3600 });
    }
    if (request.headers.get('authorization') !== 'Bearer container-token') return new Response(null, { status: 401 });
    if (url.pathname === '/ccxt/fetch_ohlcv/latest-limit') return Response.json({ rows: [[1718000000000, 100, 102, 98, 101, 1]], last_bar_completion_confirmed: false });
    if (url.pathname === '/tq/fetch_ohlcv') return new Response('[{"datetime":1718000000000000000,"open":100,"high":102,"low":98,"close":101,"volume":1}]', { headers: { 'Content-Type': 'application/json' } });
    return new Response(null, { status: 404 });
} });
process.once('SIGTERM', () => { server.stop(true); process.exit(0); });
