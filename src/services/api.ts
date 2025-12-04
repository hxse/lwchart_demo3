import { settings } from '../store.svelte';

export const api = {
    async login() {
        if (!settings.username || !settings.password) {
            throw new Error('用户名或密码未设置');
        }

        const params = new URLSearchParams();
        params.append('username', settings.username);
        params.append('password', settings.password);
        params.append('grant_type', 'password');

        const response = await fetch(`${settings.baseUrl}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`登录失败: ${response.status} ${response.statusText}`);
        }

        // 假设服务器返回 JSON: { access_token: "...", token_type: "bearer" }
        // 或者直接返回 token 字符串
        let tokenValue = '';
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
            const data = await response.json();
            tokenValue = data.access_token || data.token || data;
        } else {
            tokenValue = await response.text();
        }

        // 存储到内存
        settings.token = tokenValue;

        return tokenValue;
    },

    async getToken() {
        if (!settings.token) {
            await this.login();
        }
        return settings.token;
    },

    async fetch(endpoint: string, options: RequestInit = {}) {
        const url = `${settings.baseUrl}${endpoint}`;

        // 确保有 token
        try {
            await this.getToken();
        } catch (e) {
            console.warn('自动登录失败:', e);
            throw new Error('认证失败，请先在设置页面登录');
        }

        // 添加 Authorization header
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${settings.token}`);

        const fetchOptions: RequestInit = {
            ...options,
            headers,
            credentials: 'include',
        };

        let response = await fetch(url, fetchOptions);

        // 如果 401，尝试重新登录
        if (response.status === 401) {
            try {
                await this.login();
                // 更新 token 后重试
                headers.set('Authorization', `Bearer ${settings.token}`);
                response = await fetch(url, { ...fetchOptions, headers });
            } catch (e) {
                throw new Error('认证失败，请检查用户名和密码');
            }
        }

        return response;
    },

    async fetchFileList() {
        const response = await this.fetch('/file/list');
        if (!response.ok) {
            throw new Error(`获取文件列表失败: ${response.status}`);
        }
        return response.json();
    },

    getDownloadUrl(path: string, filename: string) {
        return `${settings.baseUrl}/file/download?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}`;
    }
};
