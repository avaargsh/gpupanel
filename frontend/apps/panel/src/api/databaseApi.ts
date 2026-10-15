import { baseApi } from '@/api/baseApi';
import { encodeBase64 } from '@/utils/base64';

/**
 * 数据库模块 API —— 对齐旧前端 frontend/src/api/modules/database.ts。
 *
 * 后端把「数据库实例（本机应用 / 远程连接）」抽象为 /databases/db/*（DatabaseInfo），
 * 把实例内的库抽象为各引擎自己的 search/add/del 接口（MySQL / PG / MongoDB）。
 * Redis 为键值型，没有库列表，改为读取 status / conf / persistence。
 *
 * 约定：涉及密码的字段后端要求 base64 传输，这里在 API 层统一编码，
 * 页面只传明文，保持调用端简单一致。
 */

export interface PageResult<T> {
    items: T[];
    total: number;
}

const enc = (value?: string) => (value ? encodeBase64(value) : value);

// ---------------------------------------------------------------- 公共

export interface DBBaseInfo {
    name: string;
    containerName: string;
    port: number;
}

export interface DBConfUpdate {
    type: string;
    database: string;
    file: string;
}

export interface DescriptionUpdate {
    id: number;
    description: string;
}

export interface ChangeInfo {
    id: number;
    type: string;
    database: string;
    from: string;
    value?: string;
}

// ---------------------------------------------------------------- 实例（/db/*）

export interface DatabaseInfo {
    id: number;
    createdAt: string;
    name: string;
    from: string;
    type: string;
    version: string;
    address: string;
    port: number;
    initialDB: string;
    username: string;
    password: string;
    ssl: boolean;
    rootCert: string;
    clientKey: string;
    clientCert: string;
    skipVerify: boolean;
    timeout: number;
    description: string;
}

export interface DatabaseOption {
    id: number;
    type: string;
    from: string;
    database: string;
    version: string;
    address: string;
}

export interface DatabaseItem {
    id: number;
    from: string;
    database: string;
    name: string;
}

export interface DatabaseCreate {
    name: string;
    type: string;
    from: string;
    version: string;
    address?: string;
    port?: number;
    initialDB?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    rootCert?: string;
    clientKey?: string;
    clientCert?: string;
    skipVerify?: boolean;
    timeout?: number;
    description?: string;
}

export interface DatabaseUpdate extends DatabaseCreate {
    id: number;
}

export interface DatabaseDelete {
    id: number;
    forceDelete: boolean;
    deleteBackup: boolean;
}

export interface DBResource {
    type: string;
    name: string;
}

// ---------------------------------------------------------------- MySQL

export interface SearchDBParams {
    page?: number;
    pageSize?: number;
    info?: string;
    database: string;
    orderBy?: 'name' | 'createdAt';
    order?: 'null' | 'ascending' | 'descending';
}

export interface MysqlDBInfo {
    id: number;
    createdAt: string;
    name: string;
    from: string;
    mysqlName: string;
    format: string;
    collation: string;
    username: string;
    password: string;
    permission: string;
    isDelete: boolean;
    description: string;
    authorizedUsers?: MysqlUser[];
}

export interface MysqlDBCreate {
    name: string;
    from: string;
    database: string;
    format: string;
    collation: string;
    username: string;
    password: string;
    permission: string;
    description: string;
}

export interface MysqlDBDeleteCheck {
    id: number;
    type: string;
    database: string;
}

export interface MysqlDBDelete extends MysqlDBDeleteCheck {
    forceDelete: boolean;
    deleteBackup: boolean;
}

export interface MysqlUser {
    username: string;
    host: string;
    password: string;
    description: string;
    isDelete: boolean;
}

export interface MysqlUserCreate {
    database: string;
    username: string;
    password: string;
    host: string;
    description: string;
    dbs?: string[];
}

export interface MysqlUserUpdate {
    database: string;
    username: string;
    host: string;
    newHost: string;
    description: string;
}

export interface MysqlUserPassword {
    database: string;
    username: string;
    host: string;
    password: string;
}

export interface MysqlGrant {
    database: string;
    username: string;
    host: string;
}

export interface MysqlGrantCreate {
    database: string;
    db: string;
    username: string;
    host: string;
}

export interface MysqlVariables {
    binlog_cache_size: string;
    innodb_buffer_pool_size: string;
    innodb_log_buffer_size: string;
    join_buffer_size: string;
    key_buffer_size: string;
    max_connections: string;
    max_heap_table_size: string;
    query_cache_size: string;
    query_cache_type: string;
    read_buffer_size: string;
    read_rnd_buffer_size: string;
    sort_buffer_size: string;
    table_open_cache: string;
    thread_cache_size: string;
    thread_stack: string;
    tmp_table_size: string;
    slow_query_log: string;
    long_query_time: string;
}

export interface MysqlStatus {
    Aborted_clients: string;
    Aborted_connects: string;
    Bytes_received: string;
    Bytes_sent: string;
    Com_commit: string;
    Com_rollback: string;
    Connections: string;
    Created_tmp_disk_tables: string;
    Created_tmp_tables: string;
    Innodb_buffer_pool_pages_dirty: string;
    Innodb_buffer_pool_read_requests: string;
    Innodb_buffer_pool_reads: string;
    Key_read_requests: string;
    Key_reads: string;
    Key_write_requests: string;
    Key_writes: string;
    Max_used_connections: string;
    Open_tables: string;
    Opened_files: string;
    Opened_tables: string;
    Qcache_hits: string;
    Qcache_inserts: string;
    Questions: string;
    Select_full_join: string;
    Select_range_check: string;
    Sort_merge_passes: string;
    Table_locks_waited: string;
    Threads_cached: string;
    Threads_connected: string;
    Threads_created: string;
    Threads_running: string;
    Uptime: string;
}

export interface FormatCollationOption {
    format: string;
    collations: string[];
}

// ---------------------------------------------------------------- PostgreSQL

export interface PostgresqlDBInfo {
    id: number;
    createdAt: string;
    name: string;
    postgresqlName: string;
    from: string;
    format: string;
    username: string;
    password: string;
    superUser: boolean;
    isDelete: boolean;
    description: string;
}

export interface PostgresqlDBCreate {
    name: string;
    from: string;
    database: string;
    format: string;
    username: string;
    password: string;
    superUser: boolean;
    description: string;
}

export interface PgBind {
    name: string;
    database: string;
    username: string;
    password: string;
    superUser: boolean;
}

export interface PgChangePrivileges {
    name: string;
    database: string;
    username: string;
    superUser: boolean;
}

export interface PostgresqlDBDeleteCheck {
    id: number;
    type: string;
    database: string;
}

export interface PostgresqlDBDelete extends PostgresqlDBDeleteCheck {
    forceDelete: boolean;
    deleteBackup: boolean;
}

// ---------------------------------------------------------------- MongoDB

export interface MongodbDBInfo {
    id: number;
    createdAt: string;
    name: string;
    mongodbName: string;
    from: string;
    username: string;
    password: string;
    isDelete: boolean;
    description: string;
}

export interface MongodbDBCreate {
    name: string;
    from: string;
    database: string;
    username: string;
    password: string;
    permission: 'dbOwner' | 'read' | 'readWrite' | 'userAdmin';
    description: string;
}

export interface MongodbDBDeleteCheck {
    id: number;
    type: string;
    database: string;
}

export interface MongodbDBDelete extends MongodbDBDeleteCheck {
    forceDelete: boolean;
    deleteBackup: boolean;
}

export interface MongodbBind {
    database: string;
    name: string;
    username: string;
    password: string;
}

export interface MongodbPassword {
    database: string;
    name: string;
    password: string;
}

export interface MongodbPrivileges {
    database: string;
    name: string;
    username: string;
    permission: string;
}

// ---------------------------------------------------------------- Redis

export interface RedisStatus {
    database: string;
    tcp_port: string;
    uptime_in_days: string;
    connected_clients: string;
    used_memory: string;
    used_memory_rss: string;
    used_memory_peak: string;
    mem_fragmentation_ratio: string;
    total_connections_received: string;
    total_commands_processed: string;
    instantaneous_ops_per_sec: string;
    keyspace_hits: string;
    keyspace_misses: string;
    latest_fork_usec: string;
}

export interface RedisConf {
    database: string;
    name: string;
    port: number;
    containerName: string;
    timeout: string;
    maxclients: string;
    requirepass: string;
    maxmemory: string;
}

export interface RedisPersistence {
    database: string;
    appendonly: string;
    appendfsync: string;
    save: string;
}

export interface RedisConfUpdate {
    database: string;
    timeout: string;
    maxclients: string;
    maxmemory: string;
    /** 后端字段名为 dbType，取值 redis / redis-cluster */
    dbType: string;
}

export interface RedisPersistenceUpdate {
    database: string;
    appendonly: string;
    appendfsync: string;
    save: string;
    /** aof / rbd */
    type: string;
    /** 后端字段名为 dbType，取值 redis / redis-cluster */
    dbType: string;
}

const nodeQuery = (node?: string) => (node ? `?operateNode=${encodeURIComponent(node)}` : '');

/** 远程连接若启用 SSL，证书字段同样需要 base64 传输 */
const withCerts = <T extends DatabaseCreate>(body: T): T => {
    if (body.ssl) {
        return { ...body, rootCert: enc(body.rootCert), clientKey: enc(body.clientKey), clientCert: enc(body.clientCert) };
    }
    return body;
};

export const databaseApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // ---------- 公共 ----------
        loadDBBaseInfo: build.query<DBBaseInfo, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/common/info', method: 'POST', body: { type: body.type, name: body.database } }),
        }),
        loadDBFile: build.mutation<string, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/common/load/file', method: 'POST', body: { type: body.type, name: body.database } }),
        }),
        updateDBFile: build.mutation<unknown, DBConfUpdate>({
            query: (body) => ({ url: '/databases/common/update/conf', method: 'POST', body }),
        }),
        loadRemoteAccess: build.query<boolean, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/remote', method: 'POST', body: { type: body.type, name: body.database } }),
        }),

        // ---------- 实例 ----------
        listDatabaseInstances: build.query<DatabaseOption[], { type: string; node?: string }>({
            query: ({ type, node }) => ({ url: `/databases/db/list/${type}${nodeQuery(node)}`, method: 'GET' }),
            providesTags: ['Database'],
        }),
        searchDatabaseInstances: build.query<PageResult<DatabaseInfo>, { type: string; info?: string; page?: number; pageSize?: number }>({
            query: (body) => ({
                url: '/databases/db/search',
                method: 'POST',
                body: { page: 1, pageSize: 20, orderBy: 'createdAt', order: 'descending', ...body },
            }),
            providesTags: ['Database'],
        }),
        checkDatabase: build.mutation<boolean, DatabaseCreate>({
            query: (body) => ({ url: '/databases/db/check', method: 'POST', body: withCerts(body) }),
        }),
        addDatabase: build.mutation<unknown, DatabaseCreate>({
            query: (body) => ({ url: '/databases/db', method: 'POST', body: withCerts(body) }),
            invalidatesTags: ['Database'],
        }),
        updateDatabase: build.mutation<unknown, DatabaseUpdate>({
            query: (body) => ({ url: '/databases/db/update', method: 'POST', body: withCerts(body) }),
            invalidatesTags: ['Database'],
        }),
        deleteCheckDatabase: build.mutation<DBResource[], { id: number }>({
            query: (body) => ({ url: '/databases/db/del/check', method: 'POST', body }),
        }),
        deleteDatabase: build.mutation<unknown, DatabaseDelete>({
            query: (body) => ({ url: '/databases/db/del', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),

        // ---------- MySQL ----------
        searchMysql: build.query<PageResult<MysqlDBInfo>, SearchDBParams & { node?: string }>({
            query: ({ node, ...body }) => ({
                url: `/databases/search${nodeQuery(node)}`,
                method: 'POST',
                body: { page: 1, pageSize: 20, info: '', orderBy: 'createdAt', order: 'null', ...body },
            }),
            providesTags: ['Database'],
        }),
        addMysql: build.mutation<unknown, MysqlDBCreate>({
            query: (body) => ({ url: '/databases', method: 'POST', body: { ...body, password: enc(body.password) } }),
            invalidatesTags: ['Database'],
        }),
        updateMysqlDescription: build.mutation<unknown, DescriptionUpdate>({
            query: (body) => ({ url: '/databases/description/update', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        deleteCheckMysql: build.mutation<string[], MysqlDBDeleteCheck>({
            query: (body) => ({ url: '/databases/del/check', method: 'POST', body }),
        }),
        deleteMysql: build.mutation<unknown, MysqlDBDelete>({
            query: (body) => ({ url: '/databases/del', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        loadMysqlFromRemote: build.mutation<unknown, { from: string; type: string; database: string }>({
            query: (body) => ({ url: '/databases/load', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        changeMysqlPassword: build.mutation<unknown, ChangeInfo>({
            query: (body) => ({ url: '/databases/change/password', method: 'POST', body: { ...body, value: enc(body.value) } }),
        }),
        changeMysqlAccess: build.mutation<unknown, ChangeInfo>({
            query: (body) => ({ url: '/databases/change/access', method: 'POST', body }),
        }),
        loadMysqlVariables: build.query<MysqlVariables, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/variables', method: 'POST', body: { type: body.type, name: body.database } }),
        }),
        loadMysqlStatus: build.query<MysqlStatus, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/status', method: 'POST', body: { type: body.type, name: body.database } }),
        }),
        loadMysqlFormatOptions: build.query<FormatCollationOption[], { database: string }>({
            query: (body) => ({ url: '/databases/format/options', method: 'POST', body: { name: body.database } }),
        }),

        // MySQL 用户 / 授权
        searchMysqlUsers: build.query<MysqlUser[], { database: string }>({
            query: (body) => ({ url: '/databases/users/search', method: 'POST', body }),
            providesTags: ['Database'],
        }),
        createMysqlUser: build.mutation<unknown, MysqlUserCreate>({
            query: (body) => ({ url: '/databases/users', method: 'POST', body: { ...body, password: enc(body.password) } }),
            invalidatesTags: ['Database'],
        }),
        deleteMysqlUser: build.mutation<unknown, { database: string; username: string; host: string }>({
            query: (body) => ({ url: '/databases/users/del', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        updateMysqlUser: build.mutation<unknown, MysqlUserUpdate>({
            query: (body) => ({ url: '/databases/users/update', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        changeMysqlUserPassword: build.mutation<unknown, MysqlUserPassword>({
            query: (body) => ({ url: '/databases/users/password', method: 'POST', body: { ...body, password: enc(body.password) } }),
        }),
        searchMysqlGrants: build.query<MysqlGrant[], { database: string; username: string; host: string }>({
            query: (body) => ({ url: '/databases/grants/search', method: 'POST', body }),
        }),
        mysqlGrantSummary: build.query<Record<string, MysqlUser[]>, { database: string; dbs: string[] }>({
            query: (body) => ({ url: '/databases/grants/summary', method: 'POST', body }),
        }),
        grantMysqlUser: build.mutation<unknown, MysqlGrantCreate>({
            query: (body) => ({ url: '/databases/grants', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        revokeMysqlGrant: build.mutation<unknown, MysqlGrantCreate>({
            query: (body) => ({ url: '/databases/grants/del', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),

        // ---------- PostgreSQL ----------
        searchPostgresql: build.query<PageResult<PostgresqlDBInfo>, SearchDBParams & { node?: string }>({
            query: ({ node, ...body }) => ({
                url: `/databases/pg/search${nodeQuery(node)}`,
                method: 'POST',
                body: { page: 1, pageSize: 20, info: '', orderBy: 'createdAt', order: 'null', ...body },
            }),
            providesTags: ['Database'],
        }),
        addPostgresql: build.mutation<unknown, PostgresqlDBCreate>({
            query: (body) => ({ url: '/databases/pg', method: 'POST', body: { ...body, password: enc(body.password) } }),
            invalidatesTags: ['Database'],
        }),
        updatePostgresqlDescription: build.mutation<unknown, DescriptionUpdate>({
            query: (body) => ({ url: '/databases/pg/description', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        bindPostgresqlUser: build.mutation<unknown, PgBind>({
            query: (body) => ({ url: '/databases/pg/bind', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        changePostgresqlPrivileges: build.mutation<unknown, PgChangePrivileges>({
            query: (body) => ({ url: '/databases/pg/privileges', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        deleteCheckPostgresql: build.mutation<DBResource[], PostgresqlDBDeleteCheck>({
            query: (body) => ({ url: '/databases/pg/del/check', method: 'POST', body }),
        }),
        deletePostgresql: build.mutation<unknown, PostgresqlDBDelete>({
            query: (body) => ({ url: '/databases/pg/del', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        changePostgresqlPassword: build.mutation<unknown, ChangeInfo>({
            query: (body) => ({ url: '/databases/pg/password', method: 'POST', body: { ...body, value: enc(body.value) } }),
        }),

        // ---------- MongoDB ----------
        searchMongodb: build.query<PageResult<MongodbDBInfo>, SearchDBParams & { node?: string }>({
            query: ({ node, ...body }) => ({
                url: `/databases/mongodb/search${nodeQuery(node)}`,
                method: 'POST',
                body: { page: 1, pageSize: 20, info: '', orderBy: 'createdAt', order: 'null', ...body },
            }),
            providesTags: ['Database'],
        }),
        addMongodb: build.mutation<unknown, MongodbDBCreate>({
            query: (body) => ({ url: '/databases/mongodb', method: 'POST', body: { ...body, password: enc(body.password) } }),
            invalidatesTags: ['Database'],
        }),
        updateMongodbDescription: build.mutation<unknown, DescriptionUpdate>({
            query: (body) => ({ url: '/databases/mongodb/description', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        bindMongodbUser: build.mutation<unknown, MongodbBind>({
            query: (body) => ({ url: '/databases/mongodb/bind', method: 'POST', body: { ...body, password: enc(body.password) } }),
            invalidatesTags: ['Database'],
        }),
        changeMongodbPassword: build.mutation<unknown, MongodbPassword>({
            query: (body) => ({ url: '/databases/mongodb/password', method: 'POST', body: { ...body, password: enc(body.password) } }),
        }),
        changeMongodbRootPassword: build.mutation<unknown, ChangeInfo>({
            query: (body) => ({ url: '/databases/mongodb/root/password', method: 'POST', body: { ...body, value: enc(body.value) } }),
        }),
        loadMongodbPrivileges: build.mutation<string, { database: string; name: string; username: string }>({
            query: (body) => ({ url: '/databases/mongodb/privileges', method: 'POST', body }),
        }),
        changeMongodbPrivileges: build.mutation<unknown, MongodbPrivileges>({
            query: (body) => ({ url: '/databases/mongodb/privileges/change', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),
        deleteCheckMongodb: build.mutation<DBResource[], MongodbDBDeleteCheck>({
            query: (body) => ({ url: '/databases/mongodb/del/check', method: 'POST', body }),
        }),
        deleteMongodb: build.mutation<unknown, MongodbDBDelete>({
            query: (body) => ({ url: '/databases/mongodb/del', method: 'POST', body }),
            invalidatesTags: ['Database'],
        }),

        // ---------- Redis ----------
        loadRedisStatus: build.query<RedisStatus, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/redis/status', method: 'POST', body: { type: body.type, name: body.database } }),
        }),
        loadRedisConf: build.query<RedisConf, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/redis/conf', method: 'POST', body: { type: body.type, name: body.database } }),
        }),
        loadRedisPersistence: build.query<RedisPersistence, { type: string; database: string }>({
            query: (body) => ({ url: '/databases/redis/persistence/conf', method: 'POST', body: { type: body.type, name: body.database } }),
        }),
        updateRedisConf: build.mutation<unknown, RedisConfUpdate>({
            query: (body) => ({ url: '/databases/redis/conf/update', method: 'POST', body }),
        }),
        updateRedisPersistence: build.mutation<unknown, RedisPersistenceUpdate>({
            query: (body) => ({ url: '/databases/redis/persistence/update', method: 'POST', body }),
        }),
        changeRedisPassword: build.mutation<unknown, { database: string; value: string }>({
            query: (body) => ({ url: '/databases/redis/password', method: 'POST', body: { database: body.database, value: enc(body.value) } }),
        }),
    }),
});

export const {
    useLoadDBBaseInfoQuery,
    useLoadDBFileMutation,
    useUpdateDBFileMutation,
    useListDatabaseInstancesQuery,
    useSearchDatabaseInstancesQuery,
    useCheckDatabaseMutation,
    useAddDatabaseMutation,
    useUpdateDatabaseMutation,
    useDeleteCheckDatabaseMutation,
    useDeleteDatabaseMutation,
    useSearchMysqlQuery,
    useAddMysqlMutation,
    useUpdateMysqlDescriptionMutation,
    useDeleteCheckMysqlMutation,
    useDeleteMysqlMutation,
    useLoadMysqlFromRemoteMutation,
    useChangeMysqlPasswordMutation,
    useChangeMysqlAccessMutation,
    useLoadMysqlVariablesQuery,
    useLoadMysqlStatusQuery,
    useLoadMysqlFormatOptionsQuery,
    useLoadRemoteAccessQuery,
    useSearchMysqlUsersQuery,
    useCreateMysqlUserMutation,
    useDeleteMysqlUserMutation,
    useUpdateMysqlUserMutation,
    useChangeMysqlUserPasswordMutation,
    useSearchMysqlGrantsQuery,
    useMysqlGrantSummaryQuery,
    useGrantMysqlUserMutation,
    useRevokeMysqlGrantMutation,
    useLoadRedisStatusQuery,
    useLoadRedisConfQuery,
    useLoadRedisPersistenceQuery,
    useUpdateRedisConfMutation,
    useUpdateRedisPersistenceMutation,
    useChangeRedisPasswordMutation,
    useSearchPostgresqlQuery,
    useAddPostgresqlMutation,
    useUpdatePostgresqlDescriptionMutation,
    useBindPostgresqlUserMutation,
    useChangePostgresqlPrivilegesMutation,
    useDeleteCheckPostgresqlMutation,
    useDeletePostgresqlMutation,
    useChangePostgresqlPasswordMutation,
    useSearchMongodbQuery,
    useAddMongodbMutation,
    useUpdateMongodbDescriptionMutation,
    useBindMongodbUserMutation,
    useChangeMongodbPasswordMutation,
    useChangeMongodbRootPasswordMutation,
    useLoadMongodbPrivilegesMutation,
    useChangeMongodbPrivilegesMutation,
    useDeleteCheckMongodbMutation,
    useDeleteMongodbMutation,
} = databaseApi;
