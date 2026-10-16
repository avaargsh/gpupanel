import type { SpecObj } from "@/api/cronjobApi";
import type { TFunction } from "i18next";
/**
 * 计划任务辅助方法（移植自旧版 `frontend/src/views/cronjob/cronjob/helper.ts`）。
 * 旧版依赖全局 i18n，这里改为显式传入 i18next 的 `t`，保持函数纯粹、便于测试。
 */

export const specTypes = ["perMonth", "perWeek", "perDay", "perHour", "perNDay", "perNHour", "perNMinute", "perNSecond"] as const;

export const weekOptions = [1, 2, 3, 4, 5, 6, 0];

export const loadZero = (i: number) => (i < 10 ? `0${i}` : `${i}`);

export function weekLabel(t: TFunction, value: number): string {
    switch (value) {
        case 1:
            return t("cronjob.monday");
        case 2:
            return t("cronjob.tuesday");
        case 3:
            return t("cronjob.wednesday");
        case 4:
            return t("cronjob.thursday");
        case 5:
            return t("cronjob.friday");
        case 6:
            return t("cronjob.saturday");
        default:
            return t("cronjob.sunday");
    }
}

export function transObjToSpec(specType: string, week: number, day: number, hour: number, minute: number, second: number): string {
    switch (specType) {
        case "perMonth":
            return `${minute} ${hour} ${day} * *`;
        case "perWeek":
            return `${minute} ${hour} * * ${week}`;
        case "perNDay":
            return `${minute} ${hour} */${day} * *`;
        case "perDay":
            return `${minute} ${hour} * * *`;
        case "perNHour":
            return `${minute} */${hour} * * *`;
        case "perHour":
            return `${minute} * * * *`;
        case "perNMinute":
            return `@every ${minute}m`;
        case "perNSecond":
            return `@every ${second}s`;
        default:
            return "";
    }
}

export function transSpecToObj(spec: string): SpecObj | null {
    const specs = (spec || "").split(" ");
    const obj: SpecObj = { specType: "perDay", week: 0, day: 1, hour: 0, minute: 0, second: 0 };
    if (spec.startsWith("@every")) {
        const value = specs[1] || "";
        if (value.endsWith("m")) {
            obj.specType = "perNMinute";
            obj.minute = Number(value.replace("m", ""));
        } else {
            obj.specType = "perNSecond";
            obj.second = Number(value.replace("s", ""));
        }
        return obj;
    }
    if (specs.length !== 5) return null;
    obj.minute = Number(specs[0]);
    if (specs[1] === "*") {
        obj.specType = "perHour";
        return obj;
    }
    if (specs[1].startsWith("*/")) {
        obj.specType = "perNHour";
        obj.hour = Number(specs[1].replace("*/", ""));
        return obj;
    }
    obj.hour = Number(specs[1]);
    if (specs[2].startsWith("*/")) {
        obj.specType = "perNDay";
        obj.day = Number(specs[2].replace("*/", ""));
        return obj;
    }
    if (specs[2] !== "*") {
        obj.specType = "perMonth";
        obj.day = Number(specs[2]);
        return obj;
    }
    if (specs[4] !== "*") {
        obj.specType = "perWeek";
        obj.week = Number(specs[4]);
        return obj;
    }
    obj.specType = "perDay";
    return obj;
}

export function specToText(t: TFunction, spec: string): string {
    const obj = transSpecToObj(spec);
    if (!obj) return spec;
    switch (obj.specType) {
        case "perMonth":
            return t("cronjob.perMonthHelper", { day: obj.day, hour: obj.hour, minute: loadZero(obj.minute) });
        case "perWeek":
            return t("cronjob.perWeekHelper", {
                week: weekLabel(t, obj.week),
                hour: obj.hour,
                minute: loadZero(obj.minute),
            });
        case "perDay":
            return t("cronjob.perDayHelper", { hour: obj.hour, minute: loadZero(obj.minute) });
        case "perHour":
            return t("cronjob.perHourHelper", { minute: loadZero(obj.minute) });
        case "perNDay":
            return t("cronjob.perNDayHelper", { day: obj.day, hour: obj.hour, minute: loadZero(obj.minute) });
        case "perNHour":
            return t("cronjob.perNHourHelper", { hour: obj.hour, minute: loadZero(obj.minute) });
        case "perNMinute":
            return t("cronjob.perNMinuteHelper", { minute: loadZero(obj.minute) });
        case "perNSecond":
            return t("cronjob.perNSecondHelper", { second: loadZero(obj.second) });
        default:
            return spec;
    }
}

export function defaultSpecObj(type: string): SpecObj {
    const obj: SpecObj = { specType: "perDay", week: 1, day: 1, hour: 0, minute: 0, second: 0 };
    switch (type) {
        case "shell":
        case "log":
        case "cleanLog":
            obj.specType = "perDay";
            obj.hour = 3;
            break;
        case "website":
        case "app":
        case "database":
        case "directory":
        case "snapshot":
        default:
            obj.specType = "perDay";
            obj.hour = 2;
            break;
    }
    return obj;
}

/** 是否需要选择备份账号 / 保留份数等备份相关配置。 */
export function hasBackup(type: string): boolean {
    return ["app", "website", "database", "directory", "snapshot", "log"].includes(type);
}

/** 是否需要排除规则（忽略文件）。 */
export function hasExclusion(type: string, isDir: boolean): boolean {
    return type === "app" || type === "website" || type === "snapshot" || (type === "directory" && isDir);
}

/** 是否需要脚本内容编辑。 */
export function hasScript(type: string): boolean {
    return type === "shell";
}

/** 是否为网站相关类型。 */
export function isWebsite(type: string): boolean {
    return type === "website" || type === "cutWebsiteLog";
}
