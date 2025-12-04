// 简单的响应式持久化 store
// 使用类来封装状态，避免模块级别的 runes 问题

class SettingsStore {
    private _baseUrl: string;
    private _username: string;
    private _password: string;
    private _token: string = ''; // 仅内存

    constructor() {
        // 从 localStorage 加载初始值
        if (typeof window !== 'undefined') {
            this._baseUrl = localStorage.getItem('baseUrl') || 'http://127.0.0.1:5123';
            this._username = localStorage.getItem('username') || '';
            this._password = localStorage.getItem('password') || '';
        } else {
            this._baseUrl = 'http://127.0.0.1:5123';
            this._username = '';
            this._password = '';
        }
    }

    get baseUrl() {
        return this._baseUrl;
    }

    set baseUrl(value: string) {
        this._baseUrl = value;
        if (typeof window !== 'undefined') {
            localStorage.setItem('baseUrl', value);
        }
    }

    get username() {
        return this._username;
    }

    set username(value: string) {
        this._username = value;
        if (typeof window !== 'undefined') {
            localStorage.setItem('username', value);
        }
    }

    get password() {
        return this._password;
    }

    set password(value: string) {
        this._password = value;
        if (typeof window !== 'undefined') {
            localStorage.setItem('password', value);
        }
    }

    get token() {
        return this._token;
    }

    set token(value: string) {
        this._token = value;
    }

    get isLoggedIn() {
        return !!this._token;
    }
}

// 导出单例
export const settings = new SettingsStore();
