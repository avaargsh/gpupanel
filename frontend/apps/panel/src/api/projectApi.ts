import { baseApi } from '@/api/baseApi';

// Core metadata only. Neither sourceHint nor Registered authorizes running
// files or creating an actual Workspace/Session.
export interface RegisteredWorkspace {
    id: string;
    projectId: string;
    name: string;
    state: 'NotProvisioned' | string;
    createdAt: number;
    updatedAt: number;
}

export interface RegisteredProject {
    id: string;
    name: string;
    sourceHint: 'uv' | 'catalog' | 'manual';
    state: 'Registered' | string;
    workspaces: RegisteredWorkspace[];
    createdAt: number;
    updatedAt: number;
}

export type ProjectRegistration = {
    name: string;
    sourceHint: 'uv' | 'catalog' | 'manual';
};

export const projectApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getProjects: build.query<RegisteredProject[], void>({
            query: () => ({ url: '/core/projects', method: 'GET' }),
            providesTags: ['Project'],
        }),
        registerProject: build.mutation<RegisteredProject, ProjectRegistration>({
            query: (body) => ({ url: '/core/projects', method: 'POST', body }),
            invalidatesTags: ['Project'],
        }),
    }),
});

export const { useGetProjectsQuery, useRegisterProjectMutation } = projectApi;
