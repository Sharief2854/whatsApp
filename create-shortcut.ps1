$WshShell = New-Object -comObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)

if (-not (Test-Path $DesktopPath)) {
  $DesktopPath = "$env:USERPROFILE\Desktop"
}

$ShortcutPath = Join-Path $DesktopPath "WhatsApp Automation Hub.lnk"
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "D:\sharief\whatsApp\node_modules\electron\dist\electron.exe"
$Shortcut.Arguments = "D:\sharief\whatsApp"
$Shortcut.WorkingDirectory = "D:\sharief\whatsApp"
$Shortcut.Description = "WhatsApp Automation Hub - Developed by Sharief"
$Shortcut.Save()

Write-Output "Updated shortcut at $ShortcutPath to launch Electron directly with no CMD prompt!"
