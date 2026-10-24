import { baseApi } from '@/api/baseApi';

export interface VMAccessStatus {
    connection: 'qemu:///system';
    identity: 'Unbound' | 'PeerObserved';
    linuxUid?: number;
    libvirtAuthorization: 'NotAssessed';
    inventoryAuthorized: false;
    executionAuthorized: false;
}

export const vmAccessApi = baseApi.injectEndpoints({
    endpoints: build => ({
        vmAccess: build.query<VMAccessStatus, void>({
            query: () => ({ url: '/core/vms/access' }),
        }),
    }),
});
export const { useVmAccessQuery } = vmAccessApi;
