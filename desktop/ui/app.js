import { Call } from '/wails/runtime.js';
const $ = (id) => document.getElementById(id);
const call = (name, ...args) => Call.ByName('main.DesktopService.' + name, ...args);
let profileDigest = '';
let installDigest = '';
let busy = false;

function show(id, value) {
  $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function setBusy(value, label) {
  busy = value;
  ['refresh', 'terminal', 'editor', 'restore', 'install', 'devpod'].forEach((name) => {
    $(name).disabled = value || (name === 'install' && !installDigest) || (name === 'restore' && !profileDigest);
  });
  $('operation-state').textContent = label;
}
async function action(name, args = [], handler = null) {
  if (busy) return;
  setBusy(true, '执行中');
  try {
    const result = await call(name, ...args);
    const value = typeof result === 'string' && result.trim().startsWith('{') ? JSON.parse(result) : result;
    if (handler) handler(value);
    show('output', value ?? '已请求原生应用打开；请检查桌面');
    $('operation-state').textContent = '已返回（请核对实际状态）';
  } catch (error) {
    show('output', '未完成：' + String(error) + '。如操作结果未知，请先独立核对，不要直接重复安装。');
    $('operation-state').textContent = '未完成 / 状态未知';
  } finally { setBusy(false, $('operation-state').textContent); }
}
$('refresh').addEventListener('click', async () => {
  await action('Overview', [], (p) => {
    profileDigest = p.profileDigest ?? '';
    show('health', p.status ?? 'UNKNOWN');
    const missing = p.apt?.missing ?? [];
    show('tools', (p.tools ?? []).map(x => (x.available ? '✓' : '○') + ' ' + x.name + (x.required ? '（基础）' : '（可选）')).join('\n'));
    $('health').dataset.state = p.status;
    show('install-plan', '缺失系统包：' + (missing.join(', ') || '无') + '\n点击“检查安装计划”以生成当前摘要。');
  });
  await action('InstallPlan', [], (p) => {
    installDigest = p.status === 'READY_FOR_APPROVAL' ? p.planDigest : '';
    show('install-plan', '状态：' + p.status + '\n命令：' + (p.command ?? []).join(' ') + '\n计划 SHA-256：' + (p.planDigest ?? '—') + '\n来源：当前 Ubuntu apt 软件源');
  });
  await action('MirrorEnvironment', [], (p) => show('mirrors', p));
});
$('terminal').addEventListener('click', () => action('OpenTerminal'));
$('editor').addEventListener('click', () => action('OpenEditor'));
$('restore').addEventListener('click', () => {
  if (!profileDigest) return;
  if (window.confirm('恢复无密钥 Profile 到当前用户配置目录？\nSHA-256: ' + profileDigest + '\n不会覆盖已有不同配置。')) {
    action('Restore', [profileDigest]);
  }
});
$('install').addEventListener('click', () => {
  if (!installDigest) return;
  if (window.confirm('安装当前计划缺失的 Ubuntu 软件包？\nSHA-256: ' + installDigest + '\n将触发系统 Polkit 授权提示；状态 UNKNOWN 不可自动重试。')) {
    action('InstallPackages', [installDigest], () => { installDigest = ''; });
  }
});
$('devpod').addEventListener('click', () => action('DevpodPlan', [$('project').value], (p) => show('devpod-result', p)));
show('output', '从检查环境开始。无需 Docker、远程 Core 或 Kubernetes。');
