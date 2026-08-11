const childProcess = require('node:child_process');
const { promisify } = require('node:util');

const execFile = promisify(childProcess.execFile);
const ENABLED = 0;
const notificationStateScript = String.raw`
$ErrorActionPreference = 'Stop'
$manager = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
$notifier = $manager::CreateToastNotifier('ua.limit.desktop')
[Console]::Out.Write([int]$notifier.Setting)
`;

function parseNotificationSetting(value) {
  const setting = Number(String(value).trim());
  if (!Number.isInteger(setting) || setting < 0 || setting > 4) {
    throw new Error('Windows returned an invalid notification setting');
  }
  return setting;
}

async function getWindowsNotificationSetting({ execute = execFile } = {}) {
  const { stdout } = await execute(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      notificationStateScript,
    ],
    { maxBuffer: 4096, timeout: 5000, windowsHide: true },
  );
  const setting = parseNotificationSetting(stdout);
  return {
    setting,
    canPresent: setting === ENABLED,
  };
}

module.exports = {
  ENABLED,
  getWindowsNotificationSetting,
  parseNotificationSetting,
};
