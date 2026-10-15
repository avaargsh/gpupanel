<template>
    <div>
        <RouterButton :buttons="buttons" />
        <LayoutContent>
            <RouterViewCache />
        </LayoutContent>
    </div>
</template>

<script lang="ts" setup>
import i18n from '@/lang';

// Never block navigation to Installed Apps on an upstream update API call.
const buttons = [
    { label: i18n.global.t('gpupanel.catalogNav'), path: '/apps/all' },
    { label: i18n.global.t('gpupanel.catalogInstalled'), path: '/apps/installed' },
];
</script>
