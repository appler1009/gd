# Interactive Git Diff & Commit Message Generation Tool

A terminal UI for reviewing git changes with the ability to generate **Conventional Commit** messages using xAI's Grok.

## Features

* **Dual View Modes**: Toggle between side-by-side and inline diffs.
* **Clean UI**: Strips noisy git metadata (hashes, index, range headers) for a source-code-first look.
* **Visual Dividers**: Clear horizontal dividers between different files in the diff.
* **File Tree**: Display changed files as a directory tree at the top; toggle visibility with `t`.
* **Mouse Support**: Scroll 3 lines at a time with your mouse wheel or trackpad.
* **Line Numbers**: Accurate line numbering preserved in both view modes.
* **Watch Mode**: Auto-refreshes the diff whenever files change, using native OS file-system events (zero CPU when idle).
* **Commit Message Generation**: Press `c` to generate a `type(scope): message` using the `grok-4-1-fast-reasoning` model.

## Prerequisites

* [Bun](https://bun.sh) runtime installed.
* **An xAI API Key**: This is **only required** if you intend to use the commit message generation feature (`c` key). The viewer itself works entirely offline.

## Setup (macOS)

1. **Clone or download the repository** to a directory (e.g., `~/tools/diff`).

2. **Set your API Key**:
   Add this to your `~/.zshrc` (default shell for macOS):
   ```bash
   export XAI_API_KEY="your-xai-api-key-here"
   ```

3. **Create an alias**:
   Add this to your `~/.zshrc`:
   ```bash
   alias gd='bun ~/path/to/diff/diff.ts'
   ```
   Replace `~/path/to/diff` with the actual path to your cloned repository.

4. **Reload your shell**:
   ```bash
   source ~/.zshrc
   ```

### Alternative: Compile to Standalone Binary

For faster startup (optional), you can compile the script into a standalone binary:

1. **Build the binary**:
   ```bash
   bun build ./diff.ts --compile --outfile gd
   ```

2. **Install to system path**:
   ```bash
   chmod +x gd && sudo mv gd /usr/local/bin/
   ```

Now you can run `gd` directly from anywhere without the `bun` prefix.

## Usage

Run the tool from the root of any git repository:

```gd```

You can also pass standard git diff arguments:
```gd --staged``` or ```gd src/main.ts```

To enable watch mode (auto-refresh on file changes):
```gd --watch``` or ```gd -w```

Watch mode and git diff arguments can be combined:
```gd --watch --staged```

### Staged Mode Hint
When viewing staged changes (`--staged`), if there are unstaged changes available, a message appears at the bottom showing `[a] stage all` to quickly stage remaining changes with `git add .`

### Keybindings

| Key | Action |
| :--- | :--- |
| `s` | Switch to **Side-by-Side** view |
| `i` | Switch to **Inline** view |
| `m` | Toggle **Mouse** scrolling (ON/OFF) |
| `t` | Toggle **File Tree** visibility |
| `a` | **Stage all** unstaged changes (only in `--staged` mode) |
| `c` | **Generate Commit Message** (exits in normal mode; loops back in watch mode) |
| `q` | **Quit** |
| `↑ / k` | Scroll line up |
| `↓ / j` | Scroll line down |
| `PgUp / b / Ctrl+b` | Scroll page up |
| `PgDn / f / Ctrl+f` | Scroll page down |
| Mouse wheel | Scroll 3 lines up/down |

## Workflow

### Normal Mode
1. **Review**: Scroll through your staged/unstaged changes.
2. **Generate**: Hit `c` to trigger the reasoning model for a commit message.
3. **Refine**: Accept the suggested Conventional Commit message, edit it, or cancel.

### Watch Mode
1. **Start watching**: Run with `--watch` or `-w`
2. **Review**: Changes auto-refresh as you edit files
3. **Commit anytime**: Press `c` to generate and commit
4. **Keep watching**: After committing, the viewer refreshes the diff and continues watching for the next changes

## License

This project is licensed under the **MIT License**.
