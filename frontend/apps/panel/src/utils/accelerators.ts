/** Intel's API uses basic/stats objects, unlike flat NVIDIA/AMD devices. */
export interface XpuSnapshot {
    basic: { deviceID: number; deviceName: string; uuid: string; pciBdfAddress: string;
        driverVersion: string; memory: string; freeMemory: string };
    stats: { gpuUtil: string; memoryUsed: string; temperature: string; power: string };
    processStatus: string;
    processes: { pid: number; command: string; memory: string }[] | null;
}

export function normalizeXpu(device: XpuSnapshot) {
    return {
        architecture: '', memoryReserved: '', computeMode: '', migMode: '',
        performanceState: '', persistenceMode: '', memoryTemperature: '', hotspotTemperature: '',
        fanSpeed: '', fanRPM: '', powerLimit: '', maxPowerLimit: '',
        type: 'intel', index: device.basic.deviceID, productName: device.basic.deviceName,
        uuid: device.basic.uuid, busID: device.basic.pciBdfAddress,
        driverVersion: device.basic.driverVersion, memoryFree: device.basic.freeMemory,
        memTotal: device.basic.memory, memUsed: device.stats.memoryUsed,
        gpuUtil: device.stats.gpuUtil, temperature: device.stats.temperature, powerDraw: device.stats.power,
        processStatus: device.processStatus,
        processes: (device.processes ?? []).map((p) => ({ pid: String(p.pid), type: 'xpu', processName: p.command, usedMemory: p.memory })),
    };
}
