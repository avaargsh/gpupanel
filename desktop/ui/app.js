import { Call } from '/wails/runtime.js';
const $ = (id) => document.getElementById(id);
const call = (name, ...args) => Call.ByName('main.DesktopService.' + name, ...args);
let profileDigest = '';
let installDigest = '';
let bundleDigest = '';
let profileImportDigest = '';
let launcherDigest = '';
let uvDigest = '';
let uvToolDigest = '';
let sourceExportDigest = '';
let sourceRestoreDigest = '';
let busy = false;

function show(id, value) {
  $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function setBusy(value, label) {
  busy = value;
  ['refresh', 'terminal', 'editor', 'restore', 'install', 'devpod', 'bundle-export', 'bundle-inspect', 'bundle-restore', 'profile-backup', 'profile-inspect', 'profile-import', 'versions', 'launcher-plan', 'launcher-install', 'uv-plan', 'uv-create', 'uv-status', 'uvtool-plan', 'uvtool-install', 'uvtool-status', 'source-plan', 'source-export', 'source-inspect', 'source-restore'].forEach((name) => {
    $(name).disabled = value || (name === 'install' && !installDigest) || (name === 'restore' && !profileDigest) || (name === 'bundle-restore' && !bundleDigest) || (name === 'profile-import' && !profileImportDigest) || (name === 'launcher-install' && !launcherDigest) || (name === 'uv-create' && !uvDigest) || (name === 'uvtool-install' && !uvToolDigest) || (name === 'source-export' && !sourceExportDigest) || (name === 'source-restore' && !sourceRestoreDigest);
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
    if (name === 'InstallPackages') {
      const states = {
        VERIFIED: '系统软件包已验证',
        AUTH_CANCELLED: '用户取消授权 / 未执行',
        AUTH_NOT_GRANTED: '未获得授权 / 未执行',
        POLKIT_UNAVAILABLE: '没有可用 Polkit / 未执行',
        ROOT_REFUSED: '禁止 root 启动 / 未执行',
        REFUSED_PLAN_MISMATCH: '安装计划已变化 / 未执行',
        UNKNOWN: '安装结果未知 / 必须先对账',
      };
      $('operation-state').textContent = states[value?.status] ?? '安装回执不可信 / 不可重试';
    } else {
      $('operation-state').textContent = '已返回（请核对实际状态）';
    }
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
$('terminal').addEventListener('click', () => {
  const project = $('project').value.trim();
  action('OpenProjectTerminal', [project]);
});
$('editor').addEventListener('click', () => {
  const project = $('project').value.trim();
  action('OpenProjectEditor', [project]);
});
$('restore').addEventListener('click', () => {
  if (!profileDigest) return;
  if (window.confirm('恢复无密钥 Profile 到当前用户配置目录？\nSHA-256: ' + profileDigest + '\n不会覆盖已有不同配置。')) {
    action('Restore', [profileDigest]);
  }
});
$('install').addEventListener('click', () => {
  if (!installDigest) return;
  if (window.confirm('安装当前计划缺失的 Ubuntu 软件包？\nSHA-256: ' + installDigest + '\n将触发系统 Polkit 授权提示；状态 UNKNOWN 不可自动重试。')) {
    const approved = installDigest;
    installDigest = '';
    $('install').disabled = true;
    action('InstallPackages', [approved], (receipt) => {
      show('install-plan', {
        status: receipt.status,
        executed: receipt.executed,
        reconciliationRequired: receipt.reconciliationRequired ?? false,
        installed: receipt.installed ?? [],
        hint: receipt.hint ?? '取消或未获授权不会运行 apt；如需再次尝试请重新检查环境与计划',
        nextAction: receipt.status === 'UNKNOWN'
          ? '先人工核对 dpkg 状态与 /var/log/apt/history.log，不得自动重试'
          : '若仍需安装，重新检查环境，审核新的 SHA-256，再经 Polkit 授权',
      });
    });
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

$('launcher-plan').addEventListener('click', () => {
  launcherDigest = '';
  $('launcher-install').disabled = true;
  action('LauncherPlan', [], (p) => {
    launcherDigest = p.status === 'READY_FOR_APPROVAL' ? p.planDigest : '';
    show('launcher-report', {
      status: p.status,
      binary: p.binary,
      target: p.target,
      executableSHA256: p.binarySHA256 ?? '',
      digest: p.planDigest ?? '',
      note: '仅用户本地应用菜单；不覆盖已有文件，不安装系统服务',
    });
  });
});
$('launcher-install').addEventListener('click', () => {
  if (!launcherDigest) return;
  const approved = launcherDigest;
  if (window.confirm('创建当前用户 GPUPanel Desktop 应用菜单快捷方式？\n计划 SHA-256：' + approved + '\n绝不覆盖已有文件。')) {
    launcherDigest = '';
    $('launcher-install').disabled = true;
    action('LauncherInstall', [approved]);
  }
});

$('uv-plan').addEventListener('click', () => {
  uvDigest = '';
  $('uv-create').disabled = true;
  action('UvProjectPlan', [], (p) => {
    uvDigest = p.status === 'READY_FOR_APPROVAL' ? p.planDigest : '';
    show('uv-report', {
      status: p.status,
      directory: p.target,
      planDigest: p.planDigest ?? '',
      files: p.changes ?? [],
      note: p.note ?? 'uv CLI 作为本机可选工具，不自动安装或下载依赖',
    });
  });
});
$('uv-create').addEventListener('click', () => {
  if (!uvDigest) return;
  const approved = uvDigest;
  if (window.confirm('离线创建 ~/GPUPanel/projects/uv-python-starter？\n计划 SHA-256: ' + approved + '\n仅当目标不存在且 uv 就绪时执行，不下载第三方包或覆盖已有代码。')) {
    uvDigest = '';
    $('uv-create').disabled = true;
    action('UvProjectCreate', [approved], (p) => show('uv-report', p));
  }
});
$('uv-status').addEventListener('click', () => {
  action('UvProjectStatus', [], (p) => show('uv-report', p));
});

$('uvtool-plan').addEventListener('click', () => {
  uvToolDigest = '';
  $('uvtool-install').disabled = true;
  action('UvToolPlan', [], (p) => {
    uvToolDigest = p.status === 'READY_FOR_APPROVAL' ? p.planDigest : '';
    show('uvtool-report', {
      status: p.status,
      version: p.version,
      cacheFile: p.archive,
      officialURL: p.officialURL,
      expectedSHA256: p.expectedSHA256,
      destination: p.target,
      planDigest: p.planDigest ?? '',
      note: '仅从已验证的本地压缩包安装；下载或镜像源不自动获得信任',
    });
  });
});
$('uvtool-install').addEventListener('click', () => {
  if (!uvToolDigest) return;
  const approved = uvToolDigest;
  if (window.confirm('仅从 SHA-256 验证通过的离线 uv 原版文件安装到当前用户目录？\n计划 SHA-256：' + approved + '\n不覆盖已安装版本或改写 shell 配置。')) {
    uvToolDigest = '';
    $('uvtool-install').disabled = true;
    action('UvToolInstall', [approved], (p) => show('uvtool-report', p));
  }
});
$('uvtool-status').addEventListener('click', () => action('UvToolStatus', [], (p) => show('uvtool-report', p)));

$('project').addEventListener('input', () => {
  sourceExportDigest = '';
  $('source-export').disabled = true;
});
$('source-plan').addEventListener('click', () => {
  sourceExportDigest = '';
  $('source-export').disabled = true;
  const project = $('project').value.trim();
  action('SourcePlan', [project], (p) => {
    sourceExportDigest = p.status === 'READY_FOR_APPROVAL' ? p.manifestDigest : '';
    show('source-report', {
      status: p.status, project: p.project, scope: p.scope,
      manifestDigest: p.manifestDigest, excludedEntries: p.excludedEntries,
      files: (p.files ?? []).map(x => ({path: x.path, size: x.size})),
      warning: '数据、密钥、.git、虚拟环境、依赖缓存及未列出的文件均不在快照内；请自行检查文件内容',
    });
  });
});
$('source-export').addEventListener('click', () => {
  if (!sourceExportDigest) return;
  const project = $('project').value.trim();
  const digest = sourceExportDigest;
  if (!window.confirm('导出受限源码快照？请核对计划 SHA-256：' + digest +
    '\n将创建 ~/GPUPanel/backups/' + project + '-source-v1.zip，不覆盖已有文件。此文件不包含数据、密钥或完整 IDE 环境。')) return;
  sourceExportDigest = '';
  $('source-export').disabled = true;
  action('SourceExport', [project, digest], (p) => show('source-report', p));
});
$('source-file').addEventListener('input', () => {
  sourceRestoreDigest = '';
  $('source-restore').disabled = true;
});
$('source-inspect').addEventListener('click', () => {
  sourceRestoreDigest = '';
  $('source-restore').disabled = true;
  action('SourceInspect', [$('source-file').value.trim()], (p) => {
    sourceRestoreDigest = p.status === 'READY_FOR_APPROVAL' ? p.bundleDigest : '';
    show('source-restore-report', {
      status: p.status, project: p.project, scope: p.scope,
      bundleDigest: p.bundleDigest,
      files: (p.files ?? []).map(x => ({path: x.path, size: x.size})),
      warning: '只恢复经过验证的源码/锁文件；不执行任何文件，不覆盖已有项目',
    });
  });
});
$('source-restore').addEventListener('click', () => {
  if (!sourceRestoreDigest) return;
  const digest = sourceRestoreDigest;
  const name = $('source-file').value.trim();
  if (!window.confirm('原子恢复源码到全新项目目录？\n快照：' + name +
    '\nZIP SHA-256：' + digest + '\n目标已存在时拒绝覆盖；不恢复密钥或数据。')) return;
  sourceRestoreDigest = '';
  $('source-restore').disabled = true;
  action('SourceRestore', [name, digest], (p) => show('source-restore-report', p));
});
