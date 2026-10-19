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

/**
 * The backend AppInstall evidence endpoint selects the latest persisted
 * TaskInstall task by resource ID. Correlate its returned taskId with the
 * clicked task before presenting any resource observation as related.
 * Old/ambiguous tasks must never borrow a newer task's evidence.
 */
export function linkedInstallId(task: {
    id: string;
    type: string;
    operate: string;
    resourceID: number;
}): number | null {
    return task.type === 'App' && task.operate === 'TaskInstall'
        && typeof task.id === 'string'
        && task.id.length > 0 && task.id.length <= 128
        && Number.isSafeInteger(task.resourceID)
        && task.resourceID > 0
        ? task.resourceID : null;
}
