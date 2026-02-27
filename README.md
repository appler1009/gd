# Interactive Git Diff & AI Commit Tool

A high-performance terminal UI for reviewing git changes with a built-in AI assistant to generate **Conventional Commit** messages using xAI's Grok.

## Features

* **Dual View Modes**: Toggle between side-by-side and inline diffs.
* **Clean UI**: Strips noisy git metadata (hashes, index, range headers) for a source-code-first look.
* **Visual Dividers**: Clear horizontal dividers between different files in the diff.
* **Mouse Support**: Scroll through large diffs with your mouse wheel or trackpad.
* **Line Numbers**: Accurate line numbering preserved in both view modes.
* **AI Commit**: Press `c` to generate a `type(scope): message` using the `grok-4-1-fast-reasoning` model.

## Prerequisites

* [Bun](https://bun.sh) runtime installed.
* An xAI API Key.

## Setup

1. **Set your API Key**:
   Add this to your `.zshrc` or `.bashrc`:
   `export XAI_API_KEY="your-xai-api-key-here"`

2. **Alias for convenience (Optional)**:
   `alias gd='bun /path/to/your/diff.ts'`

## Usage

Run the script from the root of any git repository:

```
bun diff.ts
```

### Keybindings

| Key | Action |
| :--- | :--- |
| `s` | Switch to **Side-by-Side** view |
| `i` | Switch to **Inline** view |
| `m` | Toggle **Mouse** scrolling (ON/OFF) |
| `c` | Exit viewer and **Generate AI Commit** |
| `q` | **Quit** |
| `↑/↓` | Scroll line by line |
| `PgUp/PgDn` | Scroll 20 lines |

## Workflow

1. **Review**: Scroll through your staged/unstaged changes.
2. **Generate**: Hit `c` to trigger the AI reasoning model.
3. **Refine**: Accept the suggested Conventional Commit message, edit it, or cancel.

## License

This project is licensed under the **MIT License**.
