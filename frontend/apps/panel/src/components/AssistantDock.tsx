import { useState } from 'react';
import { Button, TextArea, Modal, Space } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import { workstationLinks } from './FirstRun';

/** Optional draft and navigation only. No chat/execution provider is connected. */
export default function AssistantDock() {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [feedback, setFeedback] = useState('');
    return <>
        <Button style={{ position: 'fixed', bottom: 18, right: 24 }} onClick={() => setOpen(true)}>AI 助手 / AI assistant</Button>
        <Modal title="工作站 AI 助手 / Workstation AI assistant" visible={open} onCancel={() => setOpen(false)} footer={null}>
            <p role="status">聊天服务尚未接通 / Chat is not connected yet</p>
            <Space wrap>{workstationLinks.map((link) => <Link key={link.path} to={link.path} onClick={() => setOpen(false)}>{link.label}</Link>)}</Space>
            <label htmlFor="assistant-draft">问题草稿 / Question draft</label>
            <TextArea id="assistant-draft" value={draft} maxCount={2000} onChange={setDraft} />
            <Button disabled={!draft.trim()} onClick={async () => {
                try { await navigator.clipboard.writeText(draft); setFeedback('已复制 / Copied'); }
                catch { setFeedback('无法复制，请手动选择 / Copy unavailable; select the text manually'); }
            }}>复制问题 / Copy question</Button>
            <span role="status">{feedback}</span>
            <p>草稿仅在当前组件内存中保存，不会发送、执行或授予主机权限。 / Draft stays in memory; no sending, execution or Host authority.</p>
        </Modal>
    </>;
}
