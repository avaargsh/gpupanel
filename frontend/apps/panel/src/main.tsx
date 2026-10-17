import 'reset-css/reset.css';
import '@/theme/globals.css';
// 工作区共用的页面级样式（workbench / host / app / container / database / website）。
import '@/pages/workbench.css';
import '@/pages/management.css';
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
