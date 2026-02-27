# Interactive Git Diff & Commit Message Generation Tool

A terminal UI for reviewing git changes with the ability to generate **Conventional Commit** messages using xAI's Grok.

## Features

* **Dual View Modes**: Toggle between side-by-side and inline diffs.
* **Clean UI**: Strips noisy git metadata (hashes, index, range headers) for a source-code-first look.
* **Visual Dividers**: Clear horizontal dividers between different files in the diff.
* **Mouse Support**: Scroll through large diffs with your mouse wheel or trackpad.
* **Line Numbers**: Accurate line numbering preserved in both view modes.
* **Watch Mode**: Auto-refreshes the diff whenever files change, using native OS file-system events (zero CPU when idle).
* **Commit Message Generation**: Press `c` to generate a `type(scope): message` using the `grok-4-1-fast-reasoning` model.

## Prerequisites

* [Bun](https://bun.sh) runtime installed.
* **An xAI API Key**: This is **only required** if you intend to use the commit message generation feature (`c` key). The viewer itself works entirely offline.

## Setup (macOS)

1. **Set your API Key**:
   Add this to your `~/.zshrc` (default shell for macOS):
   ```echo 'export XAI_API_KEY="your-xai-api-key-here"' >> ~/.zshrc && source ~/.zshrc```

2. **Bundle as a Standalone Binary**:
   Compile the script into a single executable for faster performance:
   ```bun build ./diff.ts --compile --outfile gd```

3. **Install to System Path**:
   Move the binary to a directory in your `$PATH` so you can run it from anywhere:
   ```chmod +x gd && sudo mv gd /usr/local/bin/```

## Usage

Run the tool from the root of any git repository:

```gd```

You can also pass standard git diff arguments:
```gd --staged``` or ```gd src/main.ts```

To enable watch mode (auto-refresh on file changes):
```gd --watch``` or ```gd -w```

Watch mode and git diff arguments can be combined:
```gd --watch --staged```

### Keybindings

| Key | Action |
| :--- | :--- |
| `s` | Switch to **Side-by-Side** view |
| `i` | Switch to **Inline** view |
| `m` | Toggle **Mouse** scrolling (ON/OFF) |
| `c` | Exit viewer and **Generate Commit Message** |
| `q` | **Quit** |
| `↑ / k` | Scroll line up |
| `↓ / j` | Scroll line down |
| `PgUp / Ctrl+b` | Scroll page up |
| `PgDn / Ctrl+f` | Scroll page down |

## Workflow

1. **Review**: Scroll through your staged/unstaged changes.
2. **Generate**: Hit `c` to trigger the reasoning model for a commit message.
3. **Refine**: Accept the suggested Conventional Commit message, edit it, or cancel.

## License

This project is licensed under the **MIT License**.
