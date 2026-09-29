# 抓取 Electron 窗口内容，用于在无人值守时验证界面。
#
# 用法：
#   pwsh -NoProfile -File scripts/capture-window.ps1 -Out shot.png
#   pwsh -NoProfile -File scripts/capture-window.ps1 -Out shot.png -ProcessName 万年历
#
# 开发模式（npm run dev）进程名是 electron；打包后是 productName（万年历）。
param(
  [string]$Out = "$env:TEMP\tyme-shot.png",
  [string]$ProcessName = 'electron'
)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinShot {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
Add-Type -AssemblyName System.Drawing

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1
if (-not $proc) { Write-Host "NO WINDOW FOUND for process '$ProcessName'"; exit 1 }

$h = $proc.MainWindowHandle
$r = New-Object WinShot+RECT
[WinShot]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
if ($w -le 0 -or $ht -le 0) { Write-Host "WINDOW HAS NO SIZE ($w x $ht)"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [WinShot]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc); $g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Host "ok=$ok pid=$($proc.Id) size=${w}x${ht} -> $Out"
