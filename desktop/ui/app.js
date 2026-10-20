import { Call } from '/wails/runtime.js';
const $ = (id) => document.getElementById(id);
const call = (name, ...args) => Call.ByName('main.DesktopService.' + name, ...args);
let profileDigest = '';
let installDigest = '';
let bundleDigest = '';
let profileImportDigest = '';
let busy = false;

function show(id, value) {
  $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function setBusy(value, label) {
  busy = value;
  ['refresh', 'terminal', 'editor', 'restore', 'install', 'devpod', 'bundle-export', 'bundle-inspect', 'bundle-restore', 'profile-backup', 'profile-inspect', 'profile-import', 'versions'].forEach((name) => {
    $(name).disabled = value || (name === 'install' && !installDigest) || (name === 'restore' && !profileDigest) || (name === 'bundle-restore' && !bundleDigest) || (name === 'profile-import' && !profileImportDigest);
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

$('bundle-export').addEventListener('click', () => {
  const name = $('project').value.trim();
  if (window.confirm('仅备份项目的白名单配置和锁文件，绝不覆盖同名 Bundle。\n项目：' + name + '\n请自行检查源文件是否包含敏感值。')) {
    action('BundleExport', [name]);
  }
});
$('bundle-file').addEventListener('input', () => {
  bundleDigest = '';
  $('bundle-restore').disabled = true;
});
$('bundle-inspect').addEventListener('click', () => {
  bundleDigest = '';
  action('BundleInspect', [$('bundle-file').value.trim()], (p) => {
    bundleDigest = p.status === 'READY_FOR_APPROVAL' ? p.bundleDigest : '';
    show('bundle-plan', {
      status: p.status,
      project: p.project,
      scope: p.scope,
      sha256: p.bundleDigest,
      files: (p.files ?? []).map(x => x.path),
    });
  });
});
$('bundle-restore').addEventListener('click', () => {
  if (!bundleDigest) return;
  const filename = $('bundle-file').value.trim();
  if (window.confirm('仅恢复白名单项目文件到新目录，不覆盖同名项目。\nBundle：' + filename + '\nSHA-256: ' + bundleDigest)) {
    action('BundleRestore', [filename, bundleDigest], () => { bundleDigest = ''; });
  }
});

$('profile-backup').addEventListener('click', () => {
  if (window.confirm('导出无凭据的工作站 Profile 到 ~/GPUPanel/backups/workstation-profile.json？\n已有文件将被拒绝覆盖。此文件不包含开发环境本身。')) {
    action('ProfileBackup');
  }
});
$('profile-inspect').addEventListener('click', () => {
  profileImportDigest = '';
  $('profile-import').disabled = true;
  action('ProfileImportPlan', [], (p) => {
    profileImportDigest = p.status === 'READY' ? p.profileDigest : '';
    show('profile-import-plan', {
      status: p.status,
      sha256: p.profileDigest,
      source: '~/GPUPanel/backups/workstation-profile.json',
      tools: (p.tools ?? []).map(x => x.name),
      aptMissing: p.apt?.missing ?? [],
      mirrors: p.mirrors ?? {},
      action: '仅保存 Profile；软件安装需单独确认',
    });
  });
});
$('profile-import').addEventListener('click', () => {
  if (!profileImportDigest) return;
  const approved = profileImportDigest;
  if (window.confirm('导入旧电脑 Profile 到本机用户配置目录？\nSHA-256: ' + approved + '\n已有不同配置绝不覆盖。导入不会安装软件或设置全局镜像。')) {
    profileImportDigest = '';
    $('profile-import').disabled = true;
    action('ProfileImport', [approved]);
  }
});

$('versions').addEventListener('click', () => {
  action('Versions', [], (report) => {
    show('version-report', (report.tools ?? []).map(x =>
      (x.status === 'VERSION_REPORTED' ? '✓ ' : '○ ') +
      x.tool + ': ' + (x.version ?? x.status)).join('\n') +
      '\n仅核对 CLI 版本，不验证 Docker Daemon 或开发工具是否完整可用');
  });
});
