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


export interface ProvisionIntent {
    id: string;
    projectId: string;
    workspaceId: string;
    state: 'AwaitingHostBinding';
    planDigest: string;
    profile: string;
}

export interface ProvisionPlan {
    projectId: string;
    workspaceId: string;
    profile: 'uv-python-stdlib-offline-v1';
    planDigest: string;
    workspaceState: 'NotProvisioned';
    executionAvailable: false;
    blocker: 'HostRunnerUnbound';
    intent: ProvisionIntent | null;
}

export type WorkspaceRef = { projectId: string; workspaceId: string };

export interface LocalEvidenceInput {
    intentId: string;
    planDigest: string;
    receiptDigest: string;
    evidenceDigest: string;
}

export interface LocalEvidenceResult {
    evidence: (LocalEvidenceInput & { id: string; trustState: 'OperatorReported' }) | null;
    trustState: 'OperatorReported' | 'NoObservation';
    workspaceState: 'NotProvisioned';
    attested: false;
    blocker: 'IndependentHostAttestationRequired';
}

export interface LinuxPrincipalPreflight {
    uid: number;
    state: 'CandidateUnbound' | 'CandidateRejected';
    requirementsMet: boolean;
    executionAuthorized: false;
    blocker: string;
}

export const projectApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        preflightLinuxPrincipal: build.mutation<LinuxPrincipalPreflight, { uid: number }>({
            query: (body) => ({
                url: '/hosts/operations/workspace-principal/preflight',
                method: 'POST',
                body,
            }),
        }),
        getLocalEvidence: build.query<LocalEvidenceResult, WorkspaceRef>({
            query: ({ projectId, workspaceId }) => ({
                url: `/core/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/local-evidence`,
                method: 'GET',
            }),
            providesTags: ['Project'],
        }),
        reportLocalEvidence: build.mutation<LocalEvidenceResult, WorkspaceRef & LocalEvidenceInput>({
            query: ({ projectId, workspaceId, ...body }) => ({
                url: `/core/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/local-evidence`,
                method: 'POST',
                body,
            }),
            invalidatesTags: ['Project'],
        }),
        getProvisionPlan: build.query<ProvisionPlan, WorkspaceRef>({
            query: ({ projectId, workspaceId }) => ({
                url: `/core/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/provision-plan`,
                method: 'GET',
            }),
            providesTags: ['Project'],
        }),
        requestProvisionIntent: build.mutation<ProvisionPlan, WorkspaceRef & { planDigest: string }>({
            query: ({ projectId, workspaceId, planDigest }) => ({
                url: `/core/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/provision-intent`,
                method: 'POST',
                body: { planDigest },
            }),
            invalidatesTags: ['Project'],
        }),
        getProject: build.query<RegisteredProject, string>({
            query: (id) => ({ url: `/core/projects/${encodeURIComponent(id)}`, method: 'GET' }),
            providesTags: ['Project'],
        }),
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

export const { useGetProjectsQuery, useGetProjectQuery, useRegisterProjectMutation, useGetProvisionPlanQuery, useRequestProvisionIntentMutation, useGetLocalEvidenceQuery, useReportLocalEvidenceMutation, usePreflightLinuxPrincipalMutation } = projectApi;
