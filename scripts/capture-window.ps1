# 抓取窗口内容，用于在无人值守时验证界面。
#
# 用法：
#   pwsh -NoProfile -File scripts/capture-window.ps1 -Out shot.png
#   pwsh -NoProfile -File scripts/capture-window.ps1 -Out shot.png -ProcessName 'chinese-calendar*'
#
# 默认用通配：`tauri dev` 的进程名是 `chinese-calendar`，而发布产物的文件名带着版本号
# （`chinese-calendar-0.1.4-portable.exe`），进程名跟着文件名走，精确匹配会漏掉后者。
param(
  [string]$Out = "$env:TEMP\tyme-shot.png",
  [string]$ProcessName = 'chinese-calendar*'
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
# flags=2 是 PW_RENDERFULLCONTENT：webview 的内容走 DirectComposition 合成，
# 不带这个标志抓出来是黑底。Win10 1709+ 支持。
$ok = [WinShot]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc); $g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Host "ok=$ok pid=$($proc.Id) size=${w}x${ht} -> $Out"
