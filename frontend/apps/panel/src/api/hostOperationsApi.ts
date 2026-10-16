import { baseApi } from './baseApi';

export interface HostOperation {
    id: string; kind: string; target: string; host: string; impact: string; expected: string;
    hash: string; state: 'planned' | 'running' | 'completed' | 'verified' | 'failed' | 'unknown';
    output: string; error: string; verified: boolean; createdAt: string; expiresAt: string;
}
export const hostOperationsApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getHostOperations: build.query<HostOperation[], void>({
            query: () => '/hosts/operations', providesTags: ['Host'],
        }),
        planHostOperation: build.mutation<HostOperation, { kind: string; target: string; key: string }>({
            query: (body) => ({ url: '/hosts/operations/plan', method: 'POST', body }), invalidatesTags: ['Host'],
        }),
        confirmHostOperation: build.mutation<HostOperation, { id: string; hash: string }>({
            query: ({ id, hash }) => ({ url: `/hosts/operations/${id}/confirm`, method: 'POST', body: { hash, confirm: true } }),
            invalidatesTags: ['Host', 'Container'],
        }),
    }),
});
export const { useGetHostOperationsQuery, usePlanHostOperationMutation, useConfirmHostOperationMutation } = hostOperationsApi;
