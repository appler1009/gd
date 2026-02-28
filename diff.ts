#!/usr/bin/env bun

import { spawnSync, execSync } from "node:child_process"
import fs from "node:fs"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  enterAltBuffer: "\x1b[?1049h",
  exitAltBuffer: "\x1b[?1049l",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  enableMouse: "\x1b[?1000h\x1b[?1006h",
  disableMouse: "\x1b[?1006l\x1b[?1000l",
  clear: "\x1b[2J\x1b[H"
}

function extractFileName(line: string): string {
  const match = line.match(/^diff --git [ab]\/(.*?) [ab]\/(.*)$/)
  return match ? match[2] : line
}

function cleanHunkHeader(line: string): string {
  return line.replace(/^@@\s-\d+(?:,\d+)?\s\+\d+(?:,\d+)?\s@@\s?/, "").trim()
}

function formatInline(diffText: string, width: number): string[] {
  const divider = "—".repeat(width)
  return diffText.split("\n").filter(l => !/^(---|\+\+\+|index)/.test(l)).flatMap((line) => {
    if (line.startsWith("diff --git")) {
      return ["", ANSI.cyan + divider + ANSI.reset, ANSI.cyan + extractFileName(line) + ANSI.reset]
    } else if (line.startsWith("@@")) {
      const cleaned = cleanHunkHeader(line)
      return cleaned ? [ANSI.cyan + cleaned + ANSI.reset] : []
    } else if (line.startsWith("-")) {
      return [ANSI.red + line + ANSI.reset]
    } else if (line.startsWith("+")) {
      return [ANSI.green + line + ANSI.reset]
    }
    return [line]
  }).filter(l => l !== "")
}

function formatSideBySide(diffText: string, terminalWidth: number): string[] {
  const lines = diffText.split("\n")
  const outputLines: string[] = []
  const divider = "—".repeat(terminalWidth)
  let i = 0

  let maxOldLine = 0, maxNewLine = 0
  for (const line of lines) {
    const hh = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (hh) {
      maxOldLine = Math.max(maxOldLine, parseInt(hh[1]) + (hh[2] ? parseInt(hh[2]) : 1))
      maxNewLine = Math.max(maxNewLine, parseInt(hh[3]) + (hh[4] ? parseInt(hh[4]) : 1))
    }
  }
  
  const digitsOld = ("" + (maxOldLine || 1)).length
  const digitsNew = ("" + (maxNewLine || 1)).length
  const numColWidth = digitsOld + digitsNew + 4
  const contentW = terminalWidth - numColWidth - 3
  const leftW = Math.floor(contentW / 2)
  const rightW = contentW - leftW

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith("diff --git")) {
      outputLines.push("", ANSI.cyan + divider + ANSI.reset, ANSI.cyan + extractFileName(line) + ANSI.reset)
      i++
      continue
    }
    if (/^(index|---|\+\+\+)/.test(line)) { i++ ; continue }
    if (line.startsWith("@@")) {
      const cleaned = cleanHunkHeader(line)
      if (cleaned) outputLines.push(ANSI.cyan + cleaned + ANSI.reset)
      const hunkHeader = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      let currOld = hunkHeader ? parseInt(hunkHeader[1]) : 1
      let currNew = hunkHeader ? parseInt(hunkHeader[3]) : 1
      i++
      while (i < lines.length && !/^(diff --git|@@)/.test(lines[i])) {
        const curr = lines[i]
        if (curr.startsWith(" ")) {
          const content = curr.slice(1)
          outputLines.push(`${("" + currOld++).padStart(digitsOld)} ${content.slice(0, leftW).padEnd(leftW)} | ${("" + currNew++).padStart(digitsNew)} ${content.slice(0, rightW).padEnd(rightW)}`)
          i++
        } else if (curr.startsWith("-") || curr.startsWith("+")) {
          let d: string[] = [], a: string[] = []
          while (i < lines.length && lines[i].startsWith("-")) d.push(lines[i++].slice(1))
          while (i < lines.length && lines[i].startsWith("+")) a.push(lines[i++].slice(1))
          for (let j = 0; j < Math.max(d.length, a.length); j++) {
            const dl = d[j] ?? "", ar = a[j] ?? ""
            const lNum = d[j] !== undefined ? ("" + currOld++).padStart(digitsOld) : " ".repeat(digitsOld)
            const rNum = a[j] !== undefined ? ("" + currNew++).padStart(digitsNew) : " ".repeat(digitsNew)
            outputLines.push(`${lNum} ${dl ? ANSI.red : ""}${dl.slice(0, leftW).padEnd(leftW)}${ANSI.reset} | ${rNum} ${ar ? ANSI.green : ""}${ar.slice(0, rightW).padEnd(rightW)}${ANSI.reset}`)
          }
        } else { i++ }
      }
    } else { i++ }
  }
  return outputLines
}

async function main() {
  const args = process.argv.slice(2)
  const watchMode = args.includes("--watch") || args.includes("-w")
  const gitArgs = args.filter(a => a !== "--watch" && a !== "-w")
  const stagedMode = gitArgs.includes("--staged")
  const diffRes = spawnSync("git", ["diff", "--color=never", ...gitArgs], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 })
  let currentDiff = diffRes.stdout.trim() || "no changes"
  if (currentDiff === "no changes" && !watchMode) { console.log(currentDiff); return }

  let unstagedChanges = false
  if (stagedMode) {
    const r = spawnSync("git", ["diff", "--color=never"], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 })
    unstagedChanges = r.stdout.trim().length > 0
  }

  let sideBySide = false, scrollOffset = 0, maxScroll = 0, mouseEnabled = true, wantCommit = false, fileTreeVisible = true, notification = ""
  const stdin = process.stdin
  stdin.setRawMode(true)
  stdin.resume()

  const extractFiles = () =>
    currentDiff.split("\n")
      .filter(l => l.startsWith("diff --git"))
      .map(l => extractFileName(l))

  const renderFileTree = (files: string[]): string[] => {
    const tree: { [key: string]: any } = {}
    for (const file of files) {
      const parts = file.split("/")
      let node = tree
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (i === parts.length - 1) {
          node[part] = null // leaf (file)
        } else {
          if (!node[part]) node[part] = {}
          node = node[part]
        }
      }
    }

    const lines: string[] = []
    const renderNode = (node: any, prefix = "") => {
      const keys = Object.keys(node).sort()
      keys.forEach((key, idx) => {
        const isLastKey = idx === keys.length - 1
        const connector = isLastKey ? "└── " : "├── "
        lines.push(prefix + connector + key)
        if (node[key] !== null) {
          const nextPrefix = prefix + (isLastKey ? "    " : "│   ")
          renderNode(node[key], nextPrefix)
        }
      })
    }
    renderNode(tree)
    return lines
  }

  const render = () => {
    process.stdout.write(ANSI.clear)
    const w = process.stdout.columns || 130, h = process.stdout.rows || 24

    // Display file tree if visible
    let fileTreeHeight = 0
    if (fileTreeVisible) {
      const files = extractFiles()
      if (files.length > 0) {
        const treeLines = renderFileTree(files).slice(0, Math.max(1, h - 5))
        process.stdout.write(`${ANSI.cyan}Files:${ANSI.reset}\n`)
        process.stdout.write(treeLines.map(line => ANSI.cyan + line + ANSI.reset).join("\n") + "\n")
        fileTreeHeight = treeLines.length + 1
      }
    }

    // Display diff content
    const allLines = sideBySide ? formatSideBySide(currentDiff, w) : formatInline(currentDiff, w)
    const availableHeight = h - 2 - fileTreeHeight
    maxScroll = Math.max(0, allLines.length - availableHeight)
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxScroll))
    process.stdout.write(allLines.slice(scrollOffset, scrollOffset + availableHeight).join("\n") + "\n")

    // Display status bar
    const mouseStatus = mouseEnabled ? "ON" : "OFF"
    const watchIndicator = watchMode ? ` [watching]` : ""
    const treeIndicator = fileTreeVisible ? " [t]" : ""
    let statusBar = `\r${ANSI.cyan}[s] side [i] inline [m] mouse: ${mouseStatus}${watchIndicator}${treeIndicator} [c] generate message [q] quit${ANSI.reset}`
    if (notification) {
      statusBar += `\n${ANSI.yellow}${notification}${ANSI.reset}`
      notification = ""
    }
    if (stagedMode && unstagedChanges) {
      statusBar += `\n${ANSI.yellow}unstaged changes exist • [a] stage all${ANSI.reset}`
    }
    process.stdout.write(statusBar)
  }

  const parseKey = (data: Buffer): { name: string, ctrl?: boolean } | null => {
    const s = data.toString()
    if (s === "\x03") return { name: "c", ctrl: true }
    if (s === "\x02") return { name: "b", ctrl: true }
    if (s === "\x06") return { name: "f", ctrl: true }
    if (s === "\x1b[A") return { name: "up" }
    if (s === "\x1b[B") return { name: "down" }
    if (s === "\x1b[5~") return { name: "pageup" }
    if (s === "\x1b[6~") return { name: "pagedown" }
    if (s.length === 1 && s >= " ") return { name: s }
    return null
  }

  process.stdout.write(ANSI.enterAltBuffer + ANSI.hideCursor + ANSI.enableMouse)

  const refreshDiff = () => {
    const res = spawnSync("git", ["diff", "--color=never", ...gitArgs], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 })
    currentDiff = res.stdout.trim() || "no changes"
    if (stagedMode) {
      const r = spawnSync("git", ["diff", "--color=never"], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 })
      unstagedChanges = r.stdout.trim().length > 0
    }
  }

  let watcher: fs.FSWatcher | undefined
  if (watchMode) {
    const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim()
    let debounce: ReturnType<typeof setTimeout> | null = null
    watcher = fs.watch(gitRoot, { recursive: true }, (_event, filename) => {
      if (!filename) return
      if (filename.startsWith(".git/") && filename !== ".git/index" && filename !== ".git/HEAD") return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        const prev = currentDiff
        refreshDiff()
        if (currentDiff !== prev) {
          scrollOffset = 0
          render()
        }
      }, 150)
    })
  }

  render()
  process.stdout.on("resize", render)


  let shouldExit = false
  while (!shouldExit) {
    wantCommit = false

    await new Promise<void>((resolve) => {
      let escBuf = ""
      const handleData = (data: Buffer) => {
        const s = escBuf + data.toString()
        escBuf = ""
        // Buffer incomplete escape sequences and wait for next chunk
        if (/^\x1b$|^\x1b\[$|^\x1b\[<[\d;]*$/.test(s)) { escBuf = s; return }
        // Consume all mouse SGR events silently
        if (/\x1b\[</.test(s)) {
          if (mouseEnabled) {
            const match = s.match(/\x1b\[<(\d+);\d+;\d+M/)
            if (match) {
              const btn = parseInt(match[1])
              if (btn === 64) { const p = scrollOffset; scrollOffset = Math.max(0, scrollOffset - 3); if (scrollOffset !== p) render() }
              else if (btn === 65) { const p = scrollOffset; scrollOffset = Math.min(maxScroll, scrollOffset + 3); if (scrollOffset !== p) render() }
            }
          }
          return
        }
        const key = parseKey(Buffer.from(s))
        if (!key) return
        if (key.name === "q" || (key.ctrl && key.name === "c")) {
          shouldExit = true
          stdin.removeListener("data", handleData)
          resolve()
        }
        else if (key.name === "c") {
          wantCommit = true
          stdin.removeListener("data", handleData)
          resolve()
        }
        else if (key.name === "s") { sideBySide = true; render() }
        else if (key.name === "i") { sideBySide = false; render() }
        else if (key.name === "m") {
          mouseEnabled = !mouseEnabled
          process.stdout.write(mouseEnabled ? ANSI.enableMouse : ANSI.disableMouse)
          render()
        }
        else if (key.name === "a" && stagedMode) {
          execSync("git add .")
          refreshDiff()
          render()
        }
        else if (key.name === "t") {
          fileTreeVisible = !fileTreeVisible
          scrollOffset = 0
          render()
        }
        else if (key.name === "up" || key.name === "k") { const p = scrollOffset; scrollOffset = Math.max(0, scrollOffset - 1); if (scrollOffset !== p) render() }
        else if (key.name === "down" || key.name === "j") { const p = scrollOffset; scrollOffset = Math.min(maxScroll, scrollOffset + 1); if (scrollOffset !== p) render() }
        else if (key.name === "pageup" || (key.ctrl && key.name === "b") || key.name === "b") { const p = scrollOffset; scrollOffset = Math.max(0, scrollOffset - ((process.stdout.rows || 24) - 2)); if (scrollOffset !== p) render() }
        else if (key.name === "pagedown" || (key.ctrl && key.name === "f") || key.name === "f") { const p = scrollOffset; scrollOffset = Math.min(maxScroll, scrollOffset + ((process.stdout.rows || 24) - 2)); if (scrollOffset !== p) render() }
      }
      stdin.on("data", handleData)
    })

    if (!wantCommit) break

    const apiKey = process.env.XAI_API_KEY
    if (!apiKey) {
      if (watchMode) {
        notification = "Error: XAI_API_KEY is not set."
        render()
        continue
      }
      process.stdout.write(ANSI.disableMouse + ANSI.exitAltBuffer + ANSI.showCursor)
      console.error("Error: XAI_API_KEY is not set.")
      process.exit(1)
    }

    process.stdout.write(ANSI.disableMouse)
    const rl = readline.createInterface({ input, output })

    console.log("\nGenerating conventional commit message...")
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-4-1-fast-reasoning",
          messages: [
            { role: "system", content: "You are a helpful assistant that generates git commit messages in the Conventional Commits format (type(scope): description). Use feat, fix, docs, style, refactor, test, or chore. Keep it concise." },
            { role: "user", content: `Generate a conventional commit for this diff:\n${currentDiff.slice(0, 15000)}` }
          ],
        }),
      })

      const data = await res.json()
      if (data.error) {
        console.error(`\nAPI Error: ${data.error.message || JSON.stringify(data.error)}`)
        rl.close()
        shouldExit = true
        continue
      }

      let msg = data.choices?.[0]?.message?.content?.trim() || ""
      if (!msg) {
        console.error("\nCould not generate a message. Check your API usage/quota.")
        rl.close()
        shouldExit = true
        continue
      }

      console.log(`\nSuggested message:\n${msg}`)
      const action = await rl.question("\ncommit? (y/n/edit): ")
      if (action === "edit") msg = await rl.question("New message: ")
      rl.close()

      if (action === "n" || !msg) {
        if (watchMode) {
          stdin.setRawMode(true)
          process.stdout.write(ANSI.enableMouse)
          refreshDiff()
          scrollOffset = 0
          render()
          continue
        } else {
          shouldExit = true
          continue
        }
      }

      const path = `/tmp/msg-${Date.now()}.txt`
      fs.writeFileSync(path, msg)
      try { execSync(`git commit -F ${path}`, { stdio: "inherit" }) } finally { fs.unlinkSync(path) }

      if (watchMode) {
        stdin.setRawMode(true)
        process.stdout.write(ANSI.enableMouse)
        refreshDiff()
        scrollOffset = 0
        render()
      } else {
        shouldExit = true
      }
    } catch (err) {
      console.error(`\nFailed to reach xAI: ${err.message}`)
      rl.close()
      shouldExit = true
    }
  }

  watcher?.close()
  process.stdout.removeAllListeners("resize")
  stdin.removeAllListeners("data")
  process.stdout.write(ANSI.disableMouse + ANSI.exitAltBuffer + ANSI.showCursor)
  stdin.setRawMode(false)
  stdin.pause()
  process.exit(0)
}

main().catch(console.error)
