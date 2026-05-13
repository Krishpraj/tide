// Detect user-installed editors on PATH. Returned ids are stable so settings
// can store a preferred editor as a short string.

export interface Editor {
  id: string;
  label: string;
  command: string; // resolved absolute path or bare name
}

const CANDIDATES: { id: string; label: string; cmds: string[] }[] = [
  { id: "vscode", label: "VS Code", cmds: ["code"] },
  { id: "cursor", label: "Cursor", cmds: ["cursor"] },
  { id: "windsurf", label: "Windsurf", cmds: ["windsurf"] },
  { id: "idea", label: "IntelliJ IDEA", cmds: ["idea"] },
  { id: "webstorm", label: "WebStorm", cmds: ["webstorm"] },
  { id: "goland", label: "GoLand", cmds: ["goland"] },
  { id: "pycharm", label: "PyCharm", cmds: ["pycharm"] },
  { id: "rubymine", label: "RubyMine", cmds: ["rubymine"] },
  { id: "phpstorm", label: "PhpStorm", cmds: ["phpstorm"] },
  { id: "clion", label: "CLion", cmds: ["clion"] },
  { id: "sublime", label: "Sublime Text", cmds: ["subl"] },
  { id: "neovim", label: "Neovim", cmds: ["nvim"] },
  { id: "vim", label: "Vim", cmds: ["vim"] },
];

export function detectEditors(): Editor[] {
  const found: Editor[] = [];
  for (const c of CANDIDATES) {
    for (const cmd of c.cmds) {
      // Bun.which returns the absolute path or null. On Windows, .cmd/.bat
      // shims are resolved.
      const path = Bun.which(cmd);
      if (path) {
        found.push({ id: c.id, label: c.label, command: path });
        break;
      }
    }
  }
  return found;
}
