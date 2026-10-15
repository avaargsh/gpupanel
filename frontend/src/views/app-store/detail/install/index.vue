<template>
    <DrawerPro v-model="open" :header="$t('commons.button.install')" size="large"
        :confirm-before-close="loading" @before-close="guardDrawerClose" @close="handleClose">
        <el-alert v-if="initError" type="error" :closable="false"
            :title="$t('gpupanel.appInstallLoadFailed')" class="mb-3">
            <template #default>
                <el-button plain type="primary" :disabled="loading" @click="retryInit">
                    {{ $t('gpupanel.catalogRetry') }}
                </el-button>
            </template>
        </el-alert>
        <el-alert v-if="phase === 'uncertain'" type="warning" :closable="false"
            :title="$t('gpupanel.appInstallUncertain')" class="mb-3">
            <template #default>
                <p role="status">{{ $t('gpupanel.appInstallTaskHint') }}</p>
                <p class="gpupanel-install-origin">{{ pendingAppKey }} · {{ pendingNode }}</p>
                <code class="gpupanel-install-task-id">{{ lastAttemptTaskID }}</code>
                <div class="gpupanel-install-actions">
                    <el-button type="primary" plain @click="inspectUncertainTask">
                        {{ $t('gpupanel.appInstallInspectTask') }}
                    </el-button>
                    <el-button plain @click="acknowledgeReview">
                        {{ $t('gpupanel.appInstallReviewDone') }}
                    </el-button>
                </div>
            </template>
        </el-alert>
        <AppInstallForm ref="installFormRef" v-model="formData" :loading="loading || phase === 'uncertain'"
            :batch-install-support="batchInstallSupport" />
        <template #footer>
            <span class="dialog-footer">
                <el-button :disabled="loading" @click="handleClose">
                    {{ $t('commons.button.cancel') }}
                </el-button>
                <el-button type="primary" :loading="loading" :disabled="loading || initError ||
                    phase === 'uncertain' || !formData.appDetailId" @click="handleSubmit">
                    {{ $t('commons.button.confirm') }}
                </el-button>
            </span>
        </template>
    </DrawerPro>
    <TaskLog ref="taskLogRef" />
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';
import AppInstallForm from '@/views/app-store/detail/form/index.vue';
import { installApp, installAppToNodes } from '@/api/modules/app';
import { MsgError } from '@/utils/message';
import { newUUID } from '@/utils/id';
import { routerToName } from '@/utils/router';
import TaskLog from '@/components/log/task/index.vue';
import i18n from '@/lang';
import { useGlobalStore } from '@/composables/useGlobalStore';
import { readPendingAppInstall, savePendingAppInstall, clearPendingAppInstall } from '@/utils/app-install-pending';

defineOptions({ name: 'AppInstallPage' });

type SubmissionPhase = 'idle' | 'validating' | 'confirming' | 'submitting' | 'uncertain';
const router = useRouter();
const { currentNode } = useGlobalStore();
const recoveredReceipt = readPendingAppInstall();
const open = ref(false);
const phase = ref<SubmissionPhase>(recoveredReceipt ? 'uncertain' : 'idle');
const initializing = ref(false);
const initError = ref(false);
const lastAttemptTaskID = ref(recoveredReceipt?.taskID || '');
const pendingNode = ref(recoveredReceipt?.node || '');
const pendingAppKey = ref(recoveredReceipt?.appKey || '');
const loading = computed(() => initializing.value ||
    phase.value === 'validating' || phase.value === 'confirming' || phase.value === 'submitting');
const installFormRef = ref<InstanceType<typeof AppInstallForm>>();
const taskLogRef = ref<InstanceType<typeof TaskLog>>();
const appKey = ref('');
const batchInstallSupport = ref(false);

const formData = ref({
    appDetailId: 0,
    params: {},
    name: '',
    advanced: true,
    cpuQuota: 0,
    memoryLimit: 0,
    memoryUnit: 'M',
    containerName: '',
    allowPort: false,
    editCompose: false,
    dockerCompose: '',
    version: '',
    appID: '',
    pullImage: true,
    taskID: '',
    gpuConfig: false,
    specifyIP: '',
    format: 'utf8mb4',
    collation: '',
});

const guardDrawerClose = (done: () => void) => {
    // The drawer's close/back/escape paths must not dismiss an in-flight POST.
    if (!loading.value) done();
};
const handleClose = () => {
    if (loading.value) return;
    open.value = false;
    if (phase.value === 'uncertain') {
        // Preserve the unresolved task even if the drawer is dismissed. Any
        // later app-install click will reopen this receipt, not silently reset it.
        return;
    }
    phase.value = 'idle';
    initError.value = false;
    lastAttemptTaskID.value = '';
    pendingNode.value = '';
    pendingAppKey.value = '';
    installFormRef.value?.resetForm();
    if (router.currentRoute.value.query.install) routerToName('AppAll');
};

const initSelectedApp = async () => {
    if (initializing.value) return;
    initializing.value = true;
    initError.value = false;
    try {
        await nextTick();
        installFormRef.value?.resetForm();
        if (!installFormRef.value) throw new Error('install form unavailable');
        await installFormRef.value.initForm(appKey.value);
    } catch {
        // Do not expose backend error details (local paths, secrets, etc.).
        initError.value = true;
    } finally {
        initializing.value = false;
    }
};
const retryInit = () => {
    if (!loading.value) void initSelectedApp();
};

const openTaskLog = (taskID: string) => {
    taskLogRef.value?.openWithTaskID(taskID, undefined, pendingNode.value || currentNode.value);
};
const inspectUncertainTask = () => {
    if (pendingNode.value !== currentNode.value) {
        MsgError(i18n.global.t('gpupanel.appInstallSwitchNode'));
        return;
    }
    if (lastAttemptTaskID.value) openTaskLog(lastAttemptTaskID.value);
};
const acknowledgeReview = async () => {
    if (phase.value !== 'uncertain' || !lastAttemptTaskID.value) return;
    if (pendingNode.value !== currentNode.value) {
        MsgError(i18n.global.t('gpupanel.appInstallSwitchNode'));
        return;
    }
    try {
        await ElMessageBox.confirm(i18n.global.t('gpupanel.appInstallRetryConfirm'),
            i18n.global.t('gpupanel.appInstallReviewDone'), {
                confirmButtonText: i18n.global.t('commons.button.confirm'),
                cancelButtonText: i18n.global.t('commons.button.cancel'),
                type: 'warning',
            });
    } catch {
        return;
    }
    clearPendingAppInstall();
    phase.value = 'idle';
    lastAttemptTaskID.value = '';
    pendingNode.value = '';
    pendingAppKey.value = '';
};

// The phase switches synchronously before any validation/confirmation await,
// so repeated clicks cannot create more than one concurrent install request.
const handleSubmit = async () => {
    if (phase.value !== 'idle' || initializing.value || initError.value || !formData.value.appDetailId) return;
    phase.value = 'validating';
    try {
        const valid = await installFormRef.value?.validate();
        if (!valid) return;
        const submitData = installFormRef.value?.getFormData();
        if (!submitData || !submitData.appDetailId) return;

        if (submitData.editCompose && !submitData.dockerCompose) {
            MsgError(i18n.global.t('app.composeNullErr'));
            return;
        }
        if (submitData.cpuQuota < 0) submitData.cpuQuota = 0;
        if (submitData.memoryLimit < 0) submitData.memoryLimit = 0;

        if (!installFormRef.value?.isHostMode() && !submitData.allowPort) {
            phase.value = 'confirming';
            try {
                await ElMessageBox.confirm(i18n.global.t('app.installWarn'),
                    i18n.global.t('app.checkTitle'), {
                        confirmButtonText: i18n.global.t('commons.button.confirm'),
                        cancelButtonText: i18n.global.t('commons.button.cancel'),
                    });
            } catch {
                // User rejected the confirmation. No task has been submitted.
                return;
            }
        }

        phase.value = 'submitting';
        const taskID = newUUID();
        const receipt = { taskID, node: currentNode.value || 'local', appKey: appKey.value };
        // Save BEFORE HTTP POST. Without a recoverable receipt, fail closed:
        // a reload during an ambiguous request could otherwise duplicate work.
        if (!savePendingAppInstall(receipt)) {
            phase.value = 'idle';
            MsgError(i18n.global.t('gpupanel.appInstallStorageUnavailable'));
            return;
        }
        lastAttemptTaskID.value = taskID;
        pendingNode.value = receipt.node;
        pendingAppKey.value = receipt.appKey;
        submitData.taskID = taskID;
        try {
            if (submitData.pushNode) {
                submitData.appKey = appKey.value;
                await installAppToNodes(submitData);
            } else {
                await installApp(submitData);
            }
        } catch {
            // A transport error does not prove the server failed to accept POST.
            // Keep this task ID inspectable; prohibit blind duplicate retries.
            phase.value = 'uncertain';
            return;
        }
        clearPendingAppInstall();
        phase.value = 'idle';
        handleClose();
        // An accepted request is NOT a completed deployment. Show task evidence.
        openTaskLog(taskID);
    } finally {
        if (phase.value === 'validating' || phase.value === 'confirming') phase.value = 'idle';
    }
};

const acceptParams = async (props: { app: { key: string; batchInstallSupport?: boolean }; params?: unknown }) => {
    if (loading.value || open.value) return;
    if (phase.value === 'uncertain') {
        open.value = true;
        return;
    }
    appKey.value = props.app.key;
    batchInstallSupport.value = !!props.app.batchInstallSupport;
    phase.value = 'idle';
    lastAttemptTaskID.value = '';
    open.value = true;
    await initSelectedApp();
};

defineExpose({ acceptParams });
</script>

<style scoped>
.gpupanel-install-task-id { display: block; overflow-wrap: anywhere; margin-top: 8px; }
.gpupanel-install-origin { overflow-wrap: anywhere; margin: 4px 0; }
.gpupanel-install-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
</style>
