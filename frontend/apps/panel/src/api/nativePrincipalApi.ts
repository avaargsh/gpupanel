import { baseApi } from '@/api/baseApi';

export interface NativePeerChallenge {
    challenge: string;
    socketPath: string;
    expiresInSeconds: number;
    executionAuthorized: false;
}
export interface NativePeerStatus {
    state: 'Unbound' | 'PeerObserved';
    executionAuthorized?: false;
    proof?: {
        uid: number;
        expiresAt: string;
        identityObserved: boolean;
        executionAuthorized: false;
    };
}

export const nativePrincipalApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        beginNativePeer: build.mutation<NativePeerChallenge, { uid: number }>({
            query: (body) => ({ url: '/core/native-principal/begin', method: 'POST', body }),
        }),
        nativePeerStatus: build.query<NativePeerStatus, void>({
            query: () => ({ url: '/core/native-principal/status' }),
        }),
        revokeNativePeer: build.mutation<unknown, void>({
            query: () => ({ url: '/core/native-principal/revoke', method: 'POST' }),
        }),
    }),
});
export const { useBeginNativePeerMutation, useLazyNativePeerStatusQuery, useRevokeNativePeerMutation } = nativePrincipalApi;
