<template>
    <el-drawer v-model="opened" :title="$t('gpupanel.appEvidenceTitle')" size="520px" @close="close">
        <el-alert :title="$t('gpupanel.appEvidenceNotice')" type="warning" :closable="false" show-icon class="mb-4" />
        <div class="mb-3 flex items-center justify-between gap-2">
            <span class="font-medium">{{ appName }}</span>
            <el-button plain type="primary" :loading="busy" @click="reload">
                {{ $t('gpupanel.appEvidenceRefresh') }}
            </el-button>
        </div>
        <el-alert v-if="failed" type="error" :closable="false" :title="$t('gpupanel.appEvidenceLoadFailed')" />
        <el-skeleton v-else-if="busy" animated :rows="5" />
        <template v-else-if="evidence">
            <el-descriptions :column="1" border>
                <el-descriptions-item :label="$t('gpupanel.appEvidenceClassification')">
                    <el-tag :type="evidence.classification === 'CONFLICT' ? 'danger' : 'warning'">
                        {{ evidence.classification }}
                    </el-tag>
                </el-descriptions-item>
                <el-descriptions-item :label="$t('gpupanel.appEvidenceObservedAt')">
                    {{ new Date(evidence.observedAt).toLocaleString() }}
                </el-descriptions-item>
                <el-descriptions-item :label="$t('gpupanel.appEvidenceAppStatus')">
                    {{ evidence.appStatus || '—' }}
                </el-descriptions-item>
                <el-descriptions-item :label="$t('gpupanel.appEvidenceTask')">
                    {{ evidence.taskId || '—' }}
                </el-descriptions-item>
                <el-descriptions-item :label="$t('gpupanel.appEvidenceTaskStatus')">
                    {{ evidence.taskStatus || '—' }}
                </el-descriptions-item>
            </el-descriptions>
            <el-alert :title="$t('gpupanel.appEvidenceNotVerified')" type="info" :closable="false" show-icon class="mt-4" />
            <div class="mt-4 font-medium">{{ $t('gpupanel.appEvidenceReasons') }}</div>
            <ul v-if="evidence.reasons.length" class="mt-2 list-disc pl-5">
                <li v-for="reason in evidence.reasons" :key="reason" class="break-all">{{ reason }}</li>
            </ul>
            <p v-else class="mt-2 text-sm text-gray-500">{{ $t('gpupanel.appEvidenceNone') }}</p>
            <div class="mt-4 mb-2 font-medium">{{ $t('gpupanel.appEvidenceContainers') }}</div>
            <el-table v-if="evidence.containers.length" :data="evidence.containers" border size="small">
                <el-table-column prop="name" :label="$t('commons.table.name')" min-width="180" show-overflow-tooltip />
                <el-table-column prop="state" :label="$t('commons.table.status')" min-width="110" />
            </el-table>
            <p v-else class="text-sm text-gray-500">{{ $t('gpupanel.appEvidenceNone') }}</p>
        </template>
    </el-drawer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import type { App } from '@/api/interface/app';
import { getLocalAppInstallEvidence } from '@/api/modules/app';
import { parseAppInstallEvidence } from './evidence';

const opened = ref(false);
const busy = ref(false);
const failed = ref(false);
const evidence = ref<App.AppInstallEvidence | null>(null);
const installID = ref(0);
const appName = ref('');
let revision = 0;

function close() {
    ++revision;
    opened.value = false;
    busy.value = false;
    failed.value = false;
    evidence.value = null;
}

async function reload() {
    if (!opened.value || !Number.isSafeInteger(installID.value) || installID.value <= 0) return;
    const ticket = ++revision;
    const id = installID.value;
    busy.value = true;
    failed.value = false;
    evidence.value = null;
    try {
        const response = await getLocalAppInstallEvidence(id);
        if (!opened.value || ticket !== revision) return;
        evidence.value = parseAppInstallEvidence(response.data, id);
    } catch {
        if (!opened.value || ticket !== revision) return;
        failed.value = true;
    } finally {
        if (ticket === revision) busy.value = false;
    }
}

function acceptParams(row: App.AppInstalled) {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) return;
    ++revision;
    installID.value = row.id;
    appName.value = row.name;
    evidence.value = null;
    opened.value = true;
    void reload();
}

onBeforeUnmount(() => { ++revision; });

defineExpose({ acceptParams, close });
</script>
