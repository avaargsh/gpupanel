import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { readJSON, writeJSON } from '@/utils/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UiState {
    themeMode: ThemeMode;
    language: string;
    sidebarCollapsed: boolean;
    commandOpen: boolean;
    currentNode: string;
}

const persistedUi = readJSON<Partial<UiState>>('ui');

const initialState: UiState = {
    themeMode: persistedUi?.themeMode ?? 'system',
    language: persistedUi?.language ?? 'zh',
    sidebarCollapsed: persistedUi?.sidebarCollapsed ?? false,
    commandOpen: false,
    currentNode: persistedUi?.currentNode ?? '',
};

const uiSlice = createSlice({
    name: 'ui',
    initialState,
    reducers: {
        setThemeMode(state, action: PayloadAction<ThemeMode>) {
            state.themeMode = action.payload;
            writeJSON('ui', { themeMode: state.themeMode, language: state.language, sidebarCollapsed: state.sidebarCollapsed, currentNode: state.currentNode });
        },
        setLanguage(state, action: PayloadAction<string>) {
            state.language = action.payload;
            writeJSON('ui', { themeMode: state.themeMode, language: state.language, sidebarCollapsed: state.sidebarCollapsed, currentNode: state.currentNode });
        },
        toggleSidebar(state) {
            state.sidebarCollapsed = !state.sidebarCollapsed;
            writeJSON('ui', { themeMode: state.themeMode, language: state.language, sidebarCollapsed: state.sidebarCollapsed, currentNode: state.currentNode });
        },
        setSidebarCollapsed(state, action: PayloadAction<boolean>) {
            state.sidebarCollapsed = action.payload;
            writeJSON('ui', { themeMode: state.themeMode, language: state.language, sidebarCollapsed: state.sidebarCollapsed, currentNode: state.currentNode });
        },
        setCommandOpen(state, action: PayloadAction<boolean>) {
            state.commandOpen = action.payload;
        },
        setCurrentNode(state, action: PayloadAction<string>) {
            state.currentNode = action.payload;
        },
    },
});

export const { setThemeMode, setLanguage, toggleSidebar, setSidebarCollapsed, setCommandOpen, setCurrentNode } = uiSlice.actions;
export default uiSlice.reducer;
