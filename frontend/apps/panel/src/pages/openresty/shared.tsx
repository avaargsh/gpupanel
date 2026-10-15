import { useCheckAppInstalledQuery } from '@/api/openrestyApi';

/** nginx 体积类指令：可能带 k/m/g 单位后缀，后缀进率为 1024。 */
export const SIZE_KEYS = ['client_header_buffer_size', 'client_max_body_size', 'gzip_min_length', 'brotli_min_length'];

/**
 * 解析体积参数，保留原始单位，避免把字节值当作 KB 回写。
 * 返回数值与单位（小写，空字符串表示字节）。
 */
export function parseSizeParam(value: string): { num: number; unit: string } {
    const matched = /^(\d+)\s*([kKmMgG]?)$/.exec(value.trim());
    if (!matched) {
        return { num: Number(value.match(/\d+/g)?.[0] ?? 0), unit: '' };
    }
    return { num: Number(matched[1]), unit: matched[2] === '' ? '' : matched[2].toLowerCase() };
}

/** 只取数字部分（用于 gzip_comp_level / keepalive_timeout 等纯数值指令）。 */
export function parseIntParam(value: string): number {
    return Number(value.match(/\d+/g)?.[0] ?? 0);
}

/** 使用记住的单位（默认为 defaultUnit）拼回字符串。 */
export function withUnit(unit: string | undefined, value: number, defaultUnit: string): string {
    return String(value) + (unit === undefined ? defaultUnit : unit);
}

/** 输入框后缀展示实际使用的单位；空单位按字节显示为大写 B。 */
export function unitLabel(unit: string | undefined, defaultUnit: string): string {
    const u = unit === undefined ? defaultUnit : unit;
    return u === '' ? 'B' : u.toUpperCase();
}

/** OpenResty 安装/运行状态，用于页面可用性判断。 */
export function useOpenrestyInstalled() {
    const query = useCheckAppInstalledQuery({ key: 'openresty', name: '' });
    const installed = query.data?.isExist ?? false;
    const running = installed && query.data?.status === 'Running';
    return { query, installed, running };
}
