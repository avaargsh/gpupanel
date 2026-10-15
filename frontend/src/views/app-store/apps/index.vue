<template>
    <div>
        <docker-status v-model:isActive="isActive" v-model:isExist="isExist" />
        <LayoutContent v-loading="loading" v-if="isExist" :class="{ mask: !isActive }" :title="$t('app.app', 2)">
            <template #search>
                <Tags @change="changeTag" />
            </template>
            <template #leftToolBar>
                <el-button v-permission @click="sync" type="primary" plain :disabled="syncing">
                    <span>
                        {{ customAppStoreEnabled ? $t('app.syncCustomApp') : $t('app.syncAppList') }}
                    </span>
                </el-button>
                <el-button v-permission @click="syncLocal" type="primary" plain :disabled="syncing" class="ml-2">
                    {{ $t('app.syncLocalApp') }}
                </el-button>
            </template>
            <template #rightToolBar>
                <el-checkbox class="!mr-2.5" v-model="req.showCurrentArch" @change="searchFromFilters()">
                    {{ $t('app.showCurrentArch') }}
                </el-checkbox>
                <el-checkbox
                    class="!mr-2.5"
                    v-model="req.resource"
                    true-value="all"
                    false-value="remote"
                    @change="searchFromFilters()"
                >
                    {{ $t('app.showLocal') }}
                </el-checkbox>
                <TableSearch @search="searchByName()" v-model:searchName="req.name" />
            </template>
            <template #main>
                <div>
                    <MainDiv :heightDiff="300">
                        <el-alert type="info" :title="$t('app.appHelper')" :closable="false" />
                        <el-row :gutter="5" v-if="apps.length > 0">
                            <el-col
                                class="app-col-12"
                                v-for="(app, index) in apps"
                                :key="index"
                                :xs="24"
                                :sm="12"
                                :md="8"
                                :lg="8"
                                :xl="6"
                            >
                                <AppCard :app="app" @open-install="openInstall" @open-detail="openDetail" />
                            </el-col>
                        </el-row>
                        <div v-if="catalogError && !loading" role="alert" class="gpupanel-catalog-feedback">
                            <p>{{ $t('gpupanel.catalogLoadFailed') }}</p>
                            <el-button type="primary" plain @click="search(req)">{{ $t('gpupanel.catalogRetry') }}</el-button>
                        </div>
                        <div v-else-if="noApp && !loading" class="gpupanel-catalog-feedback">
                            <p>{{ $t('gpupanel.catalogEmpty') }}</p>
                            <el-button type="primary" plain @click="resetCatalogFilters">{{ $t('gpupanel.catalogClearFilters') }}</el-button>
                        </div>
                    </MainDiv>
                    <div class="page-button">
                        <fu-table-pagination
                            v-model:current-page="paginationConfig.currentPage"
                            v-model:page-size="paginationConfig.pageSize"
                            v-bind="paginationConfig"
                            @change="search(req)"
                            :page-sizes="[30, 60, 90]"
                            :layout="isMobile ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
                        />
                    </div>
                </div>
            </template>
        </LayoutContent>
    </div>
    <Install ref="installRef" />
    <Detail ref="detailRef" />
    <TaskLog ref="taskLogRef" @close="refresh" />
</template>

<script lang="ts" setup>
import { useSearchReset } from '@/composables/useSearchReset';
import { App } from '@/api/interface/app';
import { toRef, onMounted, reactive, ref } from 'vue';
import { searchApp, syncApp, syncCutomAppStore, syncLocalApp, getCurrentNodeCustomAppConfig } from '@/api/modules/app';
import Install from '../detail/install/index.vue';
import router from '@/routers';
import { MsgSuccess } from '@/utils/message';
import { newUUID } from '@/utils/id';
import Detail from '../detail/index.vue';
import TaskLog from '@/components/log/task/index.vue';
import bus from '@/global/bus';
import Tags from '@/views/app-store/components/tag.vue';
import DockerStatus from '@/views/container/docker-status/index.vue';
import AppCard from '@/views/app-store/apps/app/index.vue';
import MainDiv from '@/components/main-div/index.vue';
import { jumpToInstall } from '@/utils/app';
import { useGlobalStore } from '@/composables/useGlobalStore';
const { isProductPro, isOffline, isMobile, isEnterprise } = useGlobalStore();

const paginationConfig = reactive({
    cacheSizeKey: 'app-page-size',
    currentPage: 1,
    pageSize: Number(localStorage.getItem('app-page-size')) || 60,
    total: 0,
});

const req = reactive({
    name: '',
    tags: [],
    page: 1,
    pageSize: 60,
    resource: 'all',
    showCurrentArch: false,
});
useSearchReset(
    { search: toRef(req, 'name'), page: toRef(paginationConfig, 'currentPage') },
    { onRevisit: () => search(req) },
);

const apps = ref<App.AppItem[]>([]);
const loading = ref(false);
const canUpdate = ref(false);
const syncing = ref(false);
const installRef = ref();
const installKey = ref('');
const mainHeight = ref(0);
const detailRef = ref();
const taskLogRef = ref();
const syncCustomAppstore = ref(false);
const customAppStoreEnabled = ref(false);
const isActive = ref(false);
const isExist = ref(false);
const noApp = ref(false);
const catalogError = ref(false);
let latestCatalogRequest = 0;

const refresh = () => {
    search(req);
};

const search = async (req: App.AppReq) => {
    const requestId = ++latestCatalogRequest;
    loading.value = true;
    catalogError.value = false;
    noApp.value = false;
    req.pageSize = paginationConfig.pageSize;
    req.page = paginationConfig.currentPage;
    localStorage.setItem('app-page-size', req.pageSize + '');

    // Snapshot the filters: a later user edit must never mutate an in-flight query.
    const customReq = {
        page: req.page,
        pageSize: req.pageSize,
        tags: [...(req.tags || [])],
        name: req.name?.trim() || '',
        resource: req.resource,
        showCurrentArch: req.showCurrentArch,
    };
    if (syncCustomAppstore.value && req.resource === 'remote') {
        customReq.resource = 'custom';
    }
    try {
        const response = await searchApp(customReq);
        // Older responses must not override the result for the most recent filters.
        if (requestId !== latestCatalogRequest) return;
        const items = response.data?.items;
        const total = response.data?.total;
        if (!Array.isArray(items) || !Number.isFinite(total) || total < 0) {
            throw new Error('Invalid application catalog response');
        }
        apps.value = items;
        paginationConfig.total = total;
        noApp.value = items.length === 0;
    } catch {
        if (requestId !== latestCatalogRequest) return;
        apps.value = [];
        paginationConfig.total = 0;
        catalogError.value = true;
    } finally {
        if (requestId === latestCatalogRequest) loading.value = false;
    }
};

const searchFromFilters = () => {
    paginationConfig.currentPage = 1;
    void search(req);
};

const resetCatalogFilters = () => {
    req.name = '';
    req.tags = [];
    req.resource = 'all';
    req.showCurrentArch = false;
    paginationConfig.currentPage = 1;
    void search(req);
};

const openInstall = (app: App.App) => {
    if (!jumpToInstall(app.type, app.key)) {
        const params = {
            app: app,
        };
        installRef.value.acceptParams(params);
    }
};

const openDetail = (key: string) => {
    detailRef.value.acceptParams(key, 'install');
};

const openTaskLog = (taskID: string) => {
    taskLogRef.value.openWithTaskID(taskID);
};

const sync = async () => {
    syncing.value = true;
    const taskID = newUUID();
    const syncReq = {
        taskID: taskID,
    };
    try {
        let res;
        if ((isOffline.value && !isEnterprise.value) || (isProductPro.value && syncCustomAppstore.value)) {
            res = await syncCutomAppStore(syncReq);
        } else {
            res = await syncApp(syncReq);
        }
        if (res.message != '' && res.message != 'success') {
            MsgSuccess(res.message);
        } else {
            openTaskLog(taskID);
        }
        canUpdate.value = false;
        search(req);
    } finally {
        syncing.value = false;
    }
};

const syncLocal = () => {
    const taskID = newUUID();
    const syncReq = {
        taskID: taskID,
    };
    syncing.value = true;
    syncLocalApp(syncReq)
        .then(() => {
            openTaskLog(taskID);
            canUpdate.value = false;
            search(req);
        })
        .finally(() => {
            syncing.value = false;
        });
};

const changeTag = (key: string) => {
    paginationConfig.currentPage = 1;
    req.tags = [];
    if (key !== 'all') {
        req.tags = [key];
    }
    search(req);
};

const searchByName = () => {
    paginationConfig.currentPage = 1;
    void search(req);
};

onMounted(async () => {
    bus.on('refreshApp', () => {
        search(req);
    });
    if (router.currentRoute.value.query.install) {
        installKey.value = String(router.currentRoute.value.query.install);
        const params = {
            app: {
                key: installKey.value,
            },
        };
        installRef.value.acceptParams(params);
    }
    search(req);
    if (isProductPro.value) {
        const res = await getCurrentNodeCustomAppConfig();
        if (res && res.data) {
            customAppStoreEnabled.value = res.data.status === 'Enable';
            syncCustomAppstore.value = customAppStoreEnabled.value;
        }
    } else {
        syncCustomAppstore.value = isOffline.value;
    }
    mainHeight.value = window.innerHeight - 380;
    window.onresize = () => {
        return (() => {
            mainHeight.value = window.innerHeight - 380;
        })();
    };
});
</script>

<style lang="scss" scoped>
.header {
    padding-bottom: 10px;
}

@media only screen and (min-width: 768px) and (max-width: 1200px) {
    .app-col-12 {
        max-width: 50%;
        flex: 0 0 50%;
    }
}

.page-button {
    float: right;
    margin-bottom: 10px;
    margin-top: 10px;
}

.gpupanel-catalog-feedback {
    min-height: 190px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--el-text-color-secondary);
    text-align: center;
}
</style>
