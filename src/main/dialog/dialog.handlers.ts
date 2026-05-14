// Native folder-picker bridge. The Bun process runs on the user's machine, so
// we can invoke the OS file dialog directly and hand the chosen path back to
// the webview. Returns { path: null } on cancel.

import { register } from "../rpc/handlers";

function pickerCmd(): string[] {
  if (process.platform === "win32") {
    // STA is required by FolderBrowserDialog; -NoProfile keeps startup fast.
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms | Out-Null;",
      "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog;",
      "$dlg.Description = 'Select a git repository';",
      "$dlg.ShowNewFolderButton = $false;",
      "if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }",
    ].join(" ");
    return [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-Command",
      script,
    ];
  }
  if (process.platform === "darwin") {
    return [
      "osascript",
      "-e",
      'POSIX path of (choose folder with prompt "Select a git repository")',
    ];
  }
  return [
    "zenity",
    "--file-selection",
    "--directory",
    "--title=Select a git repository",
  ];
}

register("pickDirectory", async () => {
  const cmd = pickerCmd();
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const [stdout, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    // Non-zero typically means the user cancelled (e.g. osascript returns 1 on
    // "User canceled"). Treat any empty/failed result as cancel rather than an
    // error so the UI can stay silent.
    if (code !== 0) return { path: null };
    const path = stdout.trim().replace(/[\r\n]+$/, "");
    return { path: path || null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`could not open folder picker: ${msg}`);
  }
});
