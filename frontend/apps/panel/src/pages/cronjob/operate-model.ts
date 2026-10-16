import type { CronjobInfo, GroupInfo, SpecObj } from "@/api/cronjobApi";
import { defaultSpecObj } from "./helper";
export const TASK_TYPES = [
    "shell",
    "log",
    "website",
    "cutWebsiteLog",
    "app",
    "database",
    "directory",
    "snapshot",
    "curl",
    "cleanLog",
    "ntp",
    "syncIpGroup",
];
export const EXECUTORS = ["bash", "sh", "python", "python2", "python3"];
export const DB_TYPES = ["mysql", "mysql-cluster", "mariadb", "postgresql", "postgresql-cluster", "mongodb"];

export interface Props {
    target: CronjobInfo | null;
    groups: GroupInfo[];
    onClose: () => void;
}

export interface FormState {
    type: string;
    name: string;
    groupID: number;
    specCustom: boolean;
    specObjs: SpecObj[];
    specs: string[];
    websiteList: string[];
    appIdList: string[];
    dbType: string;
    dbNameList: string[];
    isDir: boolean;
    sourceDir: string;
    files: string[];
    urlItems: string[];
    inContainer: boolean;
    containerName: string;
    command: string;
    user: string;
    executor: string;
    scriptMode: string;
    script: string;
    scriptID?: number;
    retainCopies: number;
    timeout: number;
    retryTimes: number;
    secret: string;
    ignoreErr: boolean;
    ignoreFiles: string[];
    scopes: string[];
    withImage: boolean;
    ignoreAppIDs: number[];
}

export const emptyForm = (): FormState => ({
    type: "shell",
    name: "",
    groupID: 0,
    specCustom: false,
    specObjs: [defaultSpecObj("shell")],
    specs: ["0 2 * * *"],
    websiteList: [],
    appIdList: [],
    dbType: "mysql",
    dbNameList: [],
    isDir: true,
    sourceDir: "",
    files: [],
    urlItems: [""],
    inContainer: false,
    containerName: "",
    command: "bash",
    user: "root",
    executor: "bash",
    scriptMode: "input",
    script: "",
    retainCopies: 3,
    timeout: 3600,
    retryTimes: 0,
    secret: "",
    ignoreErr: false,
    ignoreFiles: [],
    scopes: [],
    withImage: false,
    ignoreAppIDs: [],
});
