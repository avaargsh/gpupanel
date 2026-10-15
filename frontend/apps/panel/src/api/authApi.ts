import { baseApi } from '@/api/baseApi';
import type { RootState } from '@/store';
import { encodeBase64, getEntranceCode } from '@/utils/base64';
import { encryptPassword, ensurePasswordPublicKey } from '@/utils/authCrypto';

export interface LoginRequest {
    name: string;
    password: string;
    captcha?: string;
    captchaID?: string;
    authMethod?: string;
    authSource?: 'local' | 'ldap';
}

export interface LoginResponse {
    name: string;
    role: string;
    token: string;
    mfaStatus: string;
    mfaSession: string;
}

export interface MFALoginRequest {
    sessionId: string;
    code: string;
    authMethod?: string;
}

export interface CaptchaResponse {
    imagePath: string;
    captchaID: string;
}

/** 当前登录用户信息（用于 API 密钥模块读取旧版接口密钥）。 */
export interface CurrentUserInfo {
    name: string;
    role: string;
    apiKey: string;
}

export const authApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        login: build.mutation<LoginResponse, LoginRequest>({
            queryFn: async (body, api, _extraOptions, baseQuery) => {
                // 后端要求密码使用服务端下发的 RSA 公钥加密后再传输。
                try { await ensurePasswordPublicKey(); }
                catch { return { error: { status: 'CUSTOM_ERROR' as const, error: 'Login public key unavailable' } }; }
                const language = (api.getState() as RootState).ui.language || 'zh';
                const result = await baseQuery({
                    url: '/core/auth/login',
                    method: 'POST',
                    headers: { EntranceCode: encodeBase64(getEntranceCode()) },
                    body: {
                        name: body.name,
                        password: encryptPassword(body.password),
                        captcha: body.captcha ?? '',
                        captchaID: body.captchaID ?? '',
                        language,
                        authMethod: body.authMethod ?? 'jwt',
                        authSource: body.authSource ?? 'local',
                    },
                });
                if (result.error) {
                    return { error: result.error };
                }
                return { data: result.data as LoginResponse };
            },
            invalidatesTags: ['Auth'],
        }),
        mfaLogin: build.mutation<LoginResponse, MFALoginRequest>({
            query: (body) => ({
                url: '/core/auth/mfalogin',
                method: 'POST',
                headers: { EntranceCode: encodeBase64(getEntranceCode()) },
                body: {
                    sessionId: body.sessionId,
                    code: body.code,
                    authMethod: body.authMethod ?? 'jwt',
                },
            }),
        }),
        getLoginSetting: build.query<{ needCaptcha: boolean }, void>({
            query: () => ({ url: '/core/auth/setting' }),
        }),
        getCaptcha: build.query<CaptchaResponse, void>({
            query: () => ({ url: '/core/auth/captcha', method: 'GET' }),
        }),
        logout: build.mutation<void, void>({
            query: () => ({ url: '/core/auth/logout', method: 'POST' }),
            invalidatesTags: ['Auth'],
        }),
        getCurrentUser: build.query<CurrentUserInfo, void>({
            query: () => ({ url: '/core/auth/current', method: 'GET' }),
            providesTags: ['Auth'],
        }),
        generateApiKey: build.mutation<string, void>({
            query: () => ({ url: '/core/auth/api/generate', method: 'POST' }),
        }),
    }),
});

export const {
    useLoginMutation,
    useMfaLoginMutation,
    useGetCaptchaQuery,
    useGetLoginSettingQuery,
    useLogoutMutation,
    useLazyGetCurrentUserQuery,
    useGetCurrentUserQuery,
    useGenerateApiKeyMutation,
} = authApi;
