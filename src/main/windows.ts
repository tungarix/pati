// Where the other windows are, for the pet to stand on. A small PowerShell helper
// asks user32 a few times a second and prints one JSON line of rectangles, front-most
// first; no native module to build or ship.
import { spawn, type ChildProcess } from 'node:child_process'

import { BrowserWindow } from 'electron'

import { ENEMY_SIZE } from './enemies.ts'

// Physical pixels (DPI aware), visible frame without the invisible resize border,
// skipping minimised, cloaked (other virtual desktop), tool and untitled windows,
// the desktop itself and Pati's own windows.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class PatiWindows {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  public struct RECT { public int L, T, R, B; }
  public static string List(uint skip) {
    var sb = new StringBuilder("[");
    var cls = new StringBuilder(64);
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == skip || (GetWindowLong(h, -20) & 0x80) != 0) return true;
      cls.Clear(); GetClassName(h, cls, 64);
      var c = cls.ToString(); if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) return true;
      if (r.R - r.L < 120 || r.B - r.T < 60) return true;
      if (sb.Length > 1) sb.Append(',');
      sb.Append('[').Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R).Append(',').Append(r.B).Append(']');
      return true;
    }, IntPtr.Zero);
    return sb.Append(']').ToString();
  }
}
'@
[PatiWindows]::SetProcessDPIAware() | Out-Null
$parent = [uint32]$args[0]
$n = 0
while ($true) {
  [Console]::Out.WriteLine([PatiWindows]::List($parent))
  [Console]::Out.Flush()
  # Do not outlive Pati if it is killed without a goodbye.
  if ((++$n % 20) -eq 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
  Start-Sleep -Milliseconds 200
}
`

export type PhysicalRect = [left: number, top: number, right: number, bottom: number]

/** Starts the helper; `onRects` gets every new list. Returns a stop function. */
export function watchWindows(onRects: (rects: PhysicalRect[]) => void): () => void {
  let child: ChildProcess | null = null
  let stopped = false
  const start = () => {
    // The script as a block taking the pid, run with -EncodedCommand to avoid all quoting.
    const command = `& { ${SCRIPT} } ${process.pid}`
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buffer = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      const last = lines.at(-1)?.trim()
      if (!last) return
      try {
        onRects(JSON.parse(last) as PhysicalRect[])
      } catch {
        // a torn line; the next one comes in 200 ms
      }
    })
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString().trim()
      if (!text.startsWith('#< CLIXML')) console.error('window watcher:', text) // PowerShell's progress noise
    })
    // Restart after a crash, but not in a tight loop.
    child.on('exit', () => !stopped && setTimeout(start, 5000))
  }
  start()
  return () => {
    stopped = true
    child?.kill()
  }
}

/** The enemy's own window: fixed size, clicks fall through except over the creature, never takes focus. Moved with setBounds, like the pet. */
export function createEnemyWindow(preload: string, page: string): BrowserWindow {
  const win = new BrowserWindow({
    width: ENEMY_SIZE,
    height: ENEMY_SIZE,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload },
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setIgnoreMouseEvents(true, { forward: true }) // mousemove still arrives; the renderer turns clicks on over the creature
  void win.loadFile(page)
  win.once('ready-to-show', () => win.showInactive())
  return win
}
