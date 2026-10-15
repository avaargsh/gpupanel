import CryptoJS from 'crypto-js';
import JSEncrypt from 'jsencrypt';
import { getCookie } from '@/utils/cookie';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

function rsaEncrypt(data: string, publicKey: string): string | false {
    if (!data) {
        return data;
    }
    const jsEncrypt = new JSEncrypt();
    jsEncrypt.setPublicKey(publicKey);
    return jsEncrypt.encrypt(data);
}

function aesEncrypt(data: string, key: string): string {
    const keyBytes = CryptoJS.enc.Utf8.parse(key);
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(data, keyBytes, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    });
    return `${iv.toString(CryptoJS.enc.Base64)}:${encrypted.toString()}`;
}

function generateAESKey(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 密码传输加密（对齐旧版前端 utils/auth.ts）：
 * AES-CBC 加密密码，RSA(PKCS#1 v1.5) 加密 AES 密钥，格式 `keyCipher:passwordCipher`。
 * 公钥取后端在任意 `/api/v1/core/*` 响应中下发的 `panel_public_key` Cookie；
 * 未取到或无法使用公钥时拒绝发送，避免降级为明文。
 */
export function encryptPassword(password: string): string {
    if (!password) {
        return '';
    }
    const cookieKey = getCookie('panel_public_key');
    if (!cookieKey) {
        throw new Error('登录公钥不可用，请刷新重试 / Login public key unavailable; retry');
    }
    let publicKey = '';
    try {
        publicKey = window.atob(cookieKey.replaceAll('"', ''));
    } catch {
        throw new Error('登录公钥不可用，请刷新重试 / Login public key unavailable; retry');
    }
    const aesKey = generateAESKey();
    const keyCipher = rsaEncrypt(aesKey, publicKey);
    if (!keyCipher) {
        throw new Error('登录公钥不可用，请刷新重试 / Login public key unavailable; retry');
    }
    return `${keyCipher}:${aesEncrypt(password, aesKey)}`;
}

let publicKeyPromise: Promise<void> | null = null;

/**
 * 登录前确保已拿到 RSA 公钥 Cookie。
 * 后端在任意 `/api/v1/core/*` 响应中通过 `SetPasswordPublicKey` 中间件下发该 Cookie，
 * 此处借一次无副作用的 `captcha` 请求获取。
 */
export function ensurePasswordPublicKey(): Promise<void> {
    if (getCookie('panel_public_key')) {
        return Promise.resolve();
    }
    if (!publicKeyPromise) {
        publicKeyPromise = fetch(`${API_BASE}/core/auth/captcha`, { credentials: 'include' })
            .then((response) => {
                if (!response.ok || !getCookie('panel_public_key')) throw new Error('Login public key unavailable');
            })
            .finally(() => { publicKeyPromise = null; });
    }
    return publicKeyPromise;
}
