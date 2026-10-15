import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { readJSON, removeKey, writeJSON } from '@/utils/storage';

const STORAGE_KEY = 'auth';

export interface AuthState {
    token: string | null;
    name: string | null;
    role: string | null;
    isAuthenticated: boolean;
}

interface PersistedAuth {
    token: string | null;
    name: string | null;
    role: string | null;
}

const persisted = readJSON<PersistedAuth>(STORAGE_KEY);

const initialState: AuthState = {
    token: persisted?.token ?? null,
    name: persisted?.name ?? null,
    role: persisted?.role ?? null,
    isAuthenticated: Boolean(persisted?.token || persisted?.name),
};

function persist(state: AuthState): PersistedAuth {
    const snapshot: PersistedAuth = { token: state.token, name: state.name, role: state.role };
    writeJSON(STORAGE_KEY, snapshot);
    return snapshot;
}

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setCredentials(state, action: PayloadAction<{ token: string; name: string; role?: string }>) {
            state.token = action.payload.token;
            state.name = action.payload.name;
            state.role = action.payload.role ?? null;
            // 旧后端返回 JWT token；新版 core 走会话 Cookie，token 可能为空，
            // 因此只要拿到用户名即视为已登录。
            state.isAuthenticated = Boolean(action.payload.token || action.payload.name);
            persist(state);
        },
        setProfile(state, action: PayloadAction<{ name?: string; role?: string }>) {
            if (action.payload.name !== undefined) state.name = action.payload.name;
            if (action.payload.role !== undefined) state.role = action.payload.role;
            persist(state);
        },
        clearCredentials(state) {
            state.token = null;
            state.name = null;
            state.role = null;
            state.isAuthenticated = false;
            removeKey(STORAGE_KEY);
        },
    },
});

export const { setCredentials, setProfile, clearCredentials } = authSlice.actions;
export default authSlice.reducer;
