import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from '@/api/baseApi';
import authReducer from '@/features/auth/authSlice';
import uiReducer, { setCurrentNode } from '@/features/ui/uiSlice';
import { clearCredentials } from '@/features/auth/authSlice';

const scopeListener = createListenerMiddleware();
scopeListener.startListening({
    predicate: (action) => setCurrentNode.match(action) || clearCredentials.match(action),
    effect: (_action, api) => { api.dispatch(baseApi.util.resetApiState()); },
});

export const store = configureStore({
    reducer: {
        auth: authReducer,
        ui: uiReducer,
        [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }).prepend(scopeListener.middleware).concat(baseApi.middleware),
    devTools: import.meta.env.MODE !== 'production',
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
