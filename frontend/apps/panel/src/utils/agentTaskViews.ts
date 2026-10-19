/** Persisted Agent TaskLog projections. Never equate these with Host approvals. */
export interface AgentExecutionTask {
    id: string;
    status: string;
    createdAt: string;
}

const needsAttention = new Set(['Executing', 'Failed', 'Unknown', 'Canceled']);

/** Read-only, non-mutating, no state translation or success inference. */
export function projectAgentTasks<T extends AgentExecutionTask>(tasks: readonly T[]) {
    return {
        activity: [...tasks],
        needsAttention: tasks.filter((task) => needsAttention.has(task.status)),
    };
}
