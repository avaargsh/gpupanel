// ⚠️ 必须位于最顶部：为 Semi Design 注入 React 19 所需的 createRoot，
// 且要在任何 Semi 组件被导入之前执行。详见 https://semi.design/zh-CN/ecosystem/react19
import '@douyinfe/semi-ui/react19-adapter';
import 'reset-css/reset.css';
import '@/theme/semi-override.css';
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
