<template>
    <div class="workstation-assistant">
        <button
            v-if="!opened"
            type="button"
            class="assistant-launcher"
            :aria-label="copy.open"
            :title="copy.open"
            @click="open"
        >
            <el-icon :size="20"><ChatDotRound /></el-icon>
            <span>{{ copy.launcher }}</span>
        </button>

        <section
            v-else
            ref="panelRef"
            class="assistant-panel"
            role="dialog"
            :aria-label="copy.title"
            aria-modal="false"
            tabindex="-1"
            @keydown.esc.stop="close"
        >
            <header class="assistant-header">
                <div>
                    <strong>{{ copy.title }}</strong>
                    <p>{{ copy.subtitle }}</p>
                </div>
                <button type="button" class="assistant-close" :aria-label="copy.close" @click="close">
                    <el-icon :size="18"><Close /></el-icon>
                </button>
            </header>

            <div class="assistant-body">
                <p class="assistant-status" role="status">{{ copy.unavailable }}</p>
                <p class="assistant-intro">{{ copy.intro }}</p>
                <h3>{{ copy.quickActions }}</h3>
                <nav class="assistant-actions" :aria-label="copy.quickActions">
                    <button
                        v-for="item in visibleActions"
                        :key="item.path"
                        type="button"
                        @click="visit(item.path)"
                    >
                        <span>{{ isChinese ? item.zh : item.en }}</span>
                        <el-icon><ArrowRight /></el-icon>
                    </button>
                </nav>
                <p v-if="visibleActions.length === 0" class="assistant-hint">{{ copy.noAccess }}</p>
            </div>

            <div class="assistant-compose">
                <label for="gpupanel-assistant-question">{{ copy.question }}</label>
                <textarea
                    id="gpupanel-assistant-question"
                    v-model="draft"
                    maxlength="2000"
                    rows="3"
                    :placeholder="copy.placeholder"
                    :aria-describedby="'gpupanel-assistant-disclaimer'"
                />
                <div class="assistant-compose-actions">
                    <button
                        type="button"
                        class="assistant-copy"
                        :disabled="!draft.trim()"
                        @click="copyQuestion"
                    >
                        {{ copy.copyQuestion }}
                    </button>
                    <span role="status" class="assistant-copy-result">{{ feedback }}</span>
                </div>
                <p id="gpupanel-assistant-disclaimer" class="assistant-hint">{{ copy.disclaimer }}</p>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { ArrowRight, ChatDotRound, Close } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useGlobalStore } from '@/composables/useGlobalStore';
import { hasRouteAccess } from '@/utils/rbac';

const router = useRouter();
const { language } = useGlobalStore();
const isChinese = computed(() => language.value === 'zh' || language.value === 'zh-Hant');
const opened = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const draft = ref('');
const feedback = ref('');

const translations = {
    zh: {
        launcher: 'AI 助手',
        open: '打开工作站 AI 助手',
        close: '关闭 AI 助手',
        title: '工作站 AI 助手',
        subtitle: '随时查看当前开发环境',
        unavailable: '聊天服务尚未接通。当前为工作站快捷入口，不会自动执行命令。',
        intro: '先从已有功能查看 GPU、容器或模型状态。后续可接入自动诊断，但所有修改操作仍需明确授权。',
        quickActions: '快速前往',
        noAccess: '当前账号没有可用的工作站快捷入口。',
        question: '整理你的问题',
        placeholder: '例如：为什么容器启动失败？当前仅在本地输入，不会发送到 AI 服务。',
        copyQuestion: '复制问题',
        copied: '已复制',
        copyFailed: '无法自动复制，请手动选择文本',
        disclaimer: '这里还不是真实 AI 对话。输入仅保存在当前页面内存；复制按钮不会上传内容。切勿粘贴密码或密钥。',
    },
    en: {
        launcher: 'AI help',
        open: 'Open workstation AI assistant',
        close: 'Close AI assistant',
        title: 'Workstation AI assistant',
        subtitle: 'Help for your development environment',
        unavailable: 'Chat is not connected yet. This panel offers real workstation shortcuts and never runs commands automatically.',
        intro: 'Start with the existing GPU, container and model pages. Future diagnostics will require explicit authorization for changes.',
        quickActions: 'Open a tool',
        noAccess: 'No workstation shortcuts are available to this account.',
        question: 'Draft a question',
        placeholder: 'Example: Why did my container fail to start? This draft is not sent to an AI service.',
        copyQuestion: 'Copy question',
        copied: 'Copied',
        copyFailed: 'Clipboard unavailable; select and copy your text manually',
        disclaimer: 'This is not a live AI conversation. The draft stays in page memory; copying does not upload it. Do not paste passwords or secrets.',
    },
};
const copy = computed(() => (isChinese.value ? translations.zh : translations.en));

// Keep actions mapped to existing registered routes. Navigation checks are
// advisory only; the router and server remain responsible for permissions.
const actions = [
    { path: '/ai/gpu/current', zh: '查看 GPU', en: 'GPU status' },
    { path: '/containers', zh: '管理容器', en: 'Containers' },
    { path: '/hosts/monitor/monitor', zh: '主机监控', en: 'Host monitoring' },
    { path: '/ai/model/account', zh: '模型服务', en: 'Model services' },
    { path: '/hosts/files', zh: '文件管理', en: 'Files' },
    { path: '/terminal', zh: '打开终端', en: 'Terminal' },
] as const;

const canOpen = (path: string) => {
    const target = router.resolve(path);
    return target.matched.length > 0 && hasRouteAccess(target);
};
const visibleActions = computed(() => actions.filter((item) => canOpen(item.path)));

const open = async () => {
    opened.value = true;
    await nextTick();
    panelRef.value?.focus();
};
const close = () => {
    opened.value = false;
    feedback.value = '';
};
const visit = async (path: string) => {
    if (!canOpen(path)) return;
    await router.push(path);
    close();
};
const copyQuestion = async () => {
    if (!draft.value.trim()) return;
    feedback.value = '';
    try {
        await navigator.clipboard.writeText(draft.value.trim());
        feedback.value = copy.value.copied;
    } catch {
        feedback.value = copy.value.copyFailed;
    }
};
</script>

<style scoped lang="scss">
.workstation-assistant {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 1001;
    font-family: inherit;
}
.assistant-launcher {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 12px 17px;
    border: 0;
    border-radius: 30px;
    color: #fff;
    background: var(--el-color-primary);
    box-shadow: 0 6px 20px rgb(0 0 0 / 18%);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
}
.assistant-launcher:hover { background: var(--el-color-primary-dark-2); }
.assistant-panel {
    display: flex;
    flex-direction: column;
    width: min(410px, calc(100vw - 24px));
    max-height: min(640px, calc(100dvh - 35px));
    overflow: hidden;
    border-radius: 16px;
    border: 1px solid var(--el-border-color-light);
    box-shadow: 0 12px 35px rgb(0 0 0 / 20%);
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
}
.assistant-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18px 18px 13px;
    border-bottom: 1px solid var(--el-border-color-lighter);
}
.assistant-header strong { font-size: 16px; }
.assistant-header p {
    margin: 5px 0 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
}
.assistant-close {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    color: var(--el-text-color-regular);
    background: transparent;
}
.assistant-close:hover { background: var(--el-fill-color-light); }
.assistant-body {
    overflow-y: auto;
    padding: 14px 18px 8px;
    min-height: 0;
}
.assistant-status {
    padding: 10px 12px;
    margin: 0;
    border-radius: 8px;
    background: var(--el-fill-color-light);
    font-size: 12px;
    line-height: 1.6;
}
.assistant-intro {
    font-size: 13px;
    color: var(--el-text-color-regular);
    line-height: 1.7;
}
.assistant-body h3 { font-size: 13px; margin: 14px 0 9px; }
.assistant-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
}
.assistant-actions button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    font-size: 12px;
    font-family: inherit;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
    cursor: pointer;
}
.assistant-actions button:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
}
.assistant-compose {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--el-border-color-lighter);
}
.assistant-compose label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.assistant-compose textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 64px;
    max-height: 135px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color);
    font: inherit;
    font-size: 13px;
}
.assistant-compose-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    margin-top: 8px;
}
.assistant-copy {
    padding: 7px 12px;
    border: 0;
    border-radius: 6px;
    background: var(--el-color-primary);
    color: #fff;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}
.assistant-copy:disabled { opacity: 0.45; cursor: not-allowed; }
.assistant-copy-result { font-size: 12px; color: var(--el-text-color-secondary); }
.assistant-hint {
    margin: 7px 0 0;
    font-size: 11px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
}
button:focus-visible, textarea:focus-visible, section:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
}
@media (max-width: 600px) {
    .workstation-assistant { right: 12px; bottom: 12px; }
    .assistant-panel { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); }
}
</style>
