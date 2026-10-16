import 'reset-css/reset.css';
import '@/theme/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('未找到 #root 挂载点');

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
