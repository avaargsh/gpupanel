<template>
    <div class="gpupanel-local-apps">
        <DockerStatus :key="currentNode" v-model:isActive="isActive" v-model:isExist="isExist" />
        <LayoutContent v-if="isExist" v-loading="loading" :class="{ mask: !isActive }" :title="$t('gpupanel.catalogNav')">
            <template #search>
                <Tags @change="changeTag" />
            </template>
            <template #leftToolBar>
                <el-button v-permission type="primary" plain :disabled="syncing || !isActive" @click="syncLocal">
                    {{ $t('gpupanel.catalogLocalSync') }}
                </el-button>
                <el-button plain @click="refresh">{{ $t('commons.button.refresh') }}</el-button>
            </template>
            <template #rightToolBar>
                <TableSearch v-model:searchName="req.name" @search="searchByName" />
            </template>
            <template #main>
                <el-alert type="info" :closable="false" :title="$t('gpupanel.catalogNotice')" class="mb-3" />
                <el-alert v-if="legacyInstallRequested" type="warning" :closable="false"
                    :title="$t('gpupanel.catalogLegacyInstallLink')" class="mb-3" />
                <el-alert v-if="loadError" type="error" :closable="false" :title="$t('gpupanel.catalogLoadFailed')" class="mb-3">
                    <template #default>
                        <el-button type="primary" plain @click="refresh">{{ $t('gpupanel.catalogRetry') }}</el-button>
                    </template>
                </el-alert>
                <div v-if="!loadError && apps.length" class="gpupanel-local-apps__grid">
                    <AppCard v-for="app in apps" :key="app.id" :app="app"
                        @open-install="openInstall" @open-detail="openDetail" />
                </div>
                <el-empty v-else-if="!loading && !loadError" :description="$t('gpupanel.catalogEmpty')">
                    <el-button v-if="hasFilters" @click="clearFilters">{{ $t('gpupanel.catalogClearFilters') }}</el-button>
                </el-empty>
                <div v-if="!loadError && paginationConfig.total > 0" class="gpupanel-local-apps__pagination">
                    <fu-table-pagination v-model:current-page="paginationConfig.currentPage"
                        v-model:page-size="paginationConfig.pageSize" v-bind="paginationConfig"
                        :page-sizes="[30, 60, 90]" :layout="isMobile ? 'total, prev, next' : 'total, sizes, prev, pager, next, jumper'"
                        @change="refresh" />
                </div>
            </template>
        </LayoutContent>
    </div>
    <Install ref="installRef" />
    <Detail ref="detailRef" />
    <TaskLog ref="taskLogRef" @close="finishLocalSync" />
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { App } from '@/api/interface/app';
import { getAppByKey, searchApp, syncLocalApp } from '@/api/modules/app';
import { useGlobalStore } from '@/composables/useGlobalStore';
import { newUUID } from '@/utils/id';
import { jumpToInstall } from '@/utils/app';
import AppCard from './app/index.vue';
import Tags from '../components/tag.vue';
import DockerStatus from '@/views/container/docker-status/index.vue';
import Install from '../detail/install/index.vue';
import Detail from '../detail/index.vue';
import TaskLog from '@/components/log/task/index.vue';
import { parseLocalAppPage } from './local-app-page';

const route = useRoute();
const { currentNode, isMobile } = useGlobalStore();
const apps = ref<App.AppItem[]>([]);
const loading = ref(false);
const loadError = ref(false);
const syncing = ref(false);
const isActive = ref(false);
const isExist = ref(false);
const installRef = ref<InstanceType<typeof Install>>();
const detailRef = ref<InstanceType<typeof Detail>>();
const taskLogRef = ref<InstanceType<typeof TaskLog>>();
const paginationConfig = reactive({
    cacheSizeKey: 'local-app-page-size',
    currentPage: 1,
    pageSize: 30,
    total: 0,
});
const req = reactive({ name: '', tags: [] as string[] });
const hasFilters = computed(() => !!req.name.trim() || req.tags.length > 0);
// Legacy ?install= links must not open or execute an unreviewed application.
// Installation is only available from a verified local search result and user click.
const legacyInstallRequested = computed(() => typeof route.query.install === 'string');
let searchRevision = 0;
let mounted = false;

const refresh = async () => {
    const revision = ++searchRevision;
    const node = currentNode.value;
    loading.value = true;
    loadError.value = false;
    try {
        // The original remote 1Panel catalog is retired. Do not send 'all'
        // or 'remote' to this backend; locally owned app definitions only.
        const response = await searchApp({
            page: paginationConfig.currentPage,
            pageSize: paginationConfig.pageSize,
            name: req.name.trim(),
            tags: [...req.tags],
            resource: 'local',
            showCurrentArch: false,
        });
        if (revision !== searchRevision || node !== currentNode.value) return;
        const page = parseLocalAppPage(response.data);
        apps.value = page.items;
        paginationConfig.total = page.total;
    } catch {
        if (revision !== searchRevision || node !== currentNode.value) return;
        apps.value = [];
        paginationConfig.total = 0;
        loadError.value = true;
    } finally {
        if (revision === searchRevision && node === currentNode.value) loading.value = false;
    }
};
const searchByName = () => {
    paginationConfig.currentPage = 1;
    void refresh();
};
const changeTag = (key: string) => {
    req.tags = key === 'all' ? [] : [key];
    paginationConfig.currentPage = 1;
    void refresh();
};
const clearFilters = () => {
    req.name = '';
    req.tags = [];
    paginationConfig.currentPage = 1;
    void refresh();
};
const openInstall = async (item: App.AppItem) => {
    if (!isExist.value || !isActive.value || syncing.value) return;
    if (!apps.value.some((app) => app.id === item.id && app.key === item.key)) return;
    const node = currentNode.value;
    try {
        const response = await getAppByKey(item.key, node || undefined);
        if (node !== currentNode.value || !isActive.value) return;
        // Upstream special runtime routes are reused only for the selected
        // authenticated backend app. The ordinary dialog still requires confirm.
        if (jumpToInstall(response.data.type, response.data.key)) return;
        installRef.value?.acceptParams({ app: response.data });
    } catch {
        loadError.value = true;
    }
};
const openDetail = (key: string) => {
    if (apps.value.some((item) => item.key === key) && isActive.value) {
        detailRef.value?.acceptParams(key, 'install');
    }
};
const syncLocal = async () => {
    if (!isExist.value || !isActive.value || syncing.value) return;
    syncing.value = true;
    const taskID = newUUID();
    try {
        // HTTP acceptance is not completion: keep the operation marked busy
        // until the user closes the actual task log and the list is re-read.
        await syncLocalApp({ taskID });
        taskLogRef.value?.openWithTaskID(taskID);
    } catch {
        syncing.value = false;
        loadError.value = true;
    }
};
const finishLocalSync = () => {
    syncing.value = false;
    void refresh();
};
onMounted(() => {
    mounted = true;
    void refresh();
});
onActivated(() => {
    if (mounted) void refresh();
});
watch(currentNode, () => {
    ++searchRevision;
    syncing.value = false;
    apps.value = [];
    paginationConfig.total = 0;
    paginationConfig.currentPage = 1;
    void refresh();
});
onBeforeUnmount(() => {
    ++searchRevision;
});
</script>

<style lang="scss" scoped>
.gpupanel-local-apps {
    &__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    &__pagination { display: flex; justify-content: flex-end; margin: 14px 0; }
    @media (max-width: 1200px) { &__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 680px) { &__grid { grid-template-columns: 1fr; } }
}
</style>
