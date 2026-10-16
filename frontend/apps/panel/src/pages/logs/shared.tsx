import type { TFunction } from "i18next";

/**
 * 面板日志来源（source）取值 —— 对齐旧版 `views/log/operation` 的下拉选项，
 * 展示时映射到 `logs.source.*`，缺失时回退原始值。
 */
export const LOG_SOURCES: { value: string; key: string }[] = [
    { value: "apps", key: "apps" },
    { value: "openresty", key: "openresty" },
    { value: "websites", key: "websites" },
    { value: "monitor", key: "monitor" },
    { value: "runtimes", key: "runtimes" },
    { value: "ai", key: "ai" },
    { value: "ai-proxy", key: "ai_proxy" },
    { value: "ai_benchmark", key: "ai_benchmark" },
    { value: "skills-hub", key: "skills_hub" },
    { value: "databases", key: "databases" },
    { value: "containers", key: "containers" },
    { value: "hosts", key: "hosts" },
    { value: "files", key: "files" },
    { value: "cronjobs", key: "cronjobs" },
    { value: "toolbox", key: "toolbox" },
    { value: "process", key: "process" },
    { value: "waf", key: "waf" },
    { value: "nodes", key: "nodes" },
    { value: "tampers", key: "tampers" },
    { value: "xsetting", key: "xsetting" },
    { value: "licenses", key: "licenses" },
    { value: "logs", key: "logs" },
    { value: "settings", key: "settings" },
    { value: "alert", key: "alert" },
    { value: "backups", key: "backups" },
    { value: "groups", key: "groups" },
    { value: "roles", key: "roles" },
    { value: "auth-sources", key: "auth_sources" },
    { value: "commands", key: "commands" },
];

/** 面板日志来源本地化：`source` 中的 `-` 映射为 i18n key 中的 `_`。 */
export function sourceLabel(t: TFunction, source: string): string {
    if (!source) return "-";
    const key = source.includes("-") ? source.replace("-", "_") : source;
    const result = t(`logs.source.${key}`, { defaultValue: source });
    return result;
}

export const LOG_PRIORITIES = ["0", "1", "2", "3", "4", "5", "6", "7"] as const;

/** syslog 优先级 → 中文/英文标签。 */
export function priorityLabel(t: TFunction, value: string): string {
    const map: Record<string, string> = {
        "0": "priorityEmergency",
        "1": "priorityAlert",
        "2": "priorityCritical",
        "3": "priorityError",
        "4": "priorityWarning",
        "5": "priorityNotice",
        "6": "priorityInfo",
        "7": "priorityDebug",
    };
    const key = map[value];
    return key ? t(`logs.system.${key}`) : value || "-";
}

/** syslog 优先级 → Semi Tag 颜色。 */
export function priorityColor(value: string): "red" | "orange" | "blue" {
    if (["0", "1", "2", "3"].includes(value)) return "red";
    if (value === "4") return "orange";
    return "blue";
}

/** 日期格式化：后端 time.Time 序列化为 ISO 字符串，转本地可读格式。 */
export function formatDateTime(value?: string | number | Date | null): string {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours(),
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 今天的 00:00:00（用于主机系统日志默认起始时间）。 */
export function startOfToday(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

/** SSH 登录方式本地化：password / publickey / keyboard-interactive。 */
export function authModeLabel(t: TFunction, mode: string): string {
    if (!mode) return "-";
    const map: Record<string, string> = {
        password: "logs.ssh.authPassword",
        publickey: "logs.ssh.authPublickey",
        "keyboard-interactive": "logs.ssh.authKeyboard",
    };
    const key = map[mode.toLowerCase()];
    return key ? t(key) : mode;
}

/**
 * 面板日志操作详情 token 词典（对齐旧版 `views/log/operation`）：
 * 后端 `detail*` 形如 `[enable] [AppName]`，其中 `[Token]` 需替换为本地化的
 * 按钮 / 状态 / 配置项词。先按原样精确匹配，再退化为小写匹配。
 */
const DETAIL_TOKEN_EXACT: Record<string, string> = {
    UserName: "userName",
    PanelName: "panelName",
    Language: "language",
    Theme: "theme",
    MenuTabs: "menuTabs",
    MenuAccordion: "menuAccordion",
    SessionTimeout: "sessionTimeout",
    SecurityEntrance: "securityEntrance",
    ExpirationDays: "expirationDays",
    ComplexityVerification: "complexityVerification",
    MFAStatus: "mfaStatus",
    GPUMonitorStatus: "gpuMonitorStatus",
    GPUMonitorStoreDays: "gpuMonitorStoreDays",
    GPUMonitorInterval: "gpuMonitorInterval",
    VLLMMonitorStatus: "vllmMonitorStatus",
    VLLMMonitorStoreDays: "vllmMonitorStoreDays",
    VLLMMonitorInterval: "vllmMonitorInterval",
    MonitorInterval: "monitorInterval",
    MonitorStatus: "monitorStatus",
    MonitorStoreDays: "monitorStoreDays",
    ApiInterfaceStatus: "apiInterfaceStatus",
    ComponentSize: "componentSize",
    Region: "region",
    SystemIP: "systemIP",
    ProxyType: "proxyType",
    ProxyUrl: "proxyUrl",
    ProxyPort: "proxyPort",
    ProxyPasswdKeep: "proxyPasswdKeep",
    ProxyDocker: "proxyDocker",
    SyncToNode: "syncToNode",
    IPWhiteList: "ipWhiteList",
    ApiKeyValidityTime: "apiKeyValidityTime",
    DeveloperMode: "developerMode",
};

const DETAIL_TOKEN_NORMALIZED: Record<string, string> = {
    enable: "enable",
    disable: "disable",
    start: "start",
    stop: "stop",
    restart: "restart",
    reload: "reload",
    sync: "sync",
    update: "update",
    upgrade: "upgrade",
    open: "open",
    close: "close",
    up: "up",
    down: "down",
    login: "login",
    delete: "delete",
    create: "create",
    add: "add",
    edit: "edit",
    save: "save",
    clean: "clean",
    clear: "clear",
    get: "get",
    install: "install",
    uninstall: "uninstall",
    backup: "backup",
    recover: "recover",
    upload: "upload",
    download: "download",
    bind: "bind",
    unbind: "unbind",
    verify: "verify",
    rebuild: "rebuild",
    remove: "remove",
    kill: "kill",
    pause: "pause",
    unpause: "unpause",
    allow: "allow",
    deny: "deny",
    accept: "accept",
    drop: "drop",
    reject: "reject",
    running: "running",
    stopped: "stopped",
    success: "success",
    failed: "failed",
    created: "created",
    restarting: "restarting",
    paused: "paused",
    exited: "exited",
    dead: "dead",
    light: "light",
    dark: "dark",
    darkgold: "darkgold",
    auto: "auto",
    cn: "cn",
    intl: "intl",
    status: "status",
    all: "all",
    operate: "operate",
    true: "true",
    false: "false",
    disablebanping: "disableBanPing",
    enablebanping: "enableBanPing",
};

/** 面板日志操作详情 token 本地化：把 `[Token]` 替换为对应语言词条，未收录的原样保留。 */
export function localizeOperationDetail(t: TFunction, log: string): string {
    if (!log) return "";
    return log.replace(/\[([^\]]+)\]/g, (matched, token: string) => {
        const key = DETAIL_TOKEN_EXACT[token] ?? DETAIL_TOKEN_NORMALIZED[token.toLowerCase()];
        return key ? `[${t(`logs.operation.token.${key}`)}]` : matched;
    });
}
