#!/usr/bin/env bun

import { spawnSync, execSync } from "node:child_process"
import fs from "node:fs"
import * as readline from "node:readline/promises"
import { emitKeypressEvents } from "node:readline"
import { stdin as input, stdout as output } from "node:process"

const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
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
  return diffText.split("\n").filter(l => !/^(---|\+\+\+|index)/.test(l)).map((line) => {
    if (line.startsWith("diff --git")) {
      return "\n" + ANSI.cyan + divider + "\n" + extractFileName(line) + ANSI.reset
    } else if (line.startsWith("@@")) {
      const cleaned = cleanHunkHeader(line)
      return cleaned ? ANSI.cyan + cleaned + ANSI.reset : ""
    } else if (line.startsWith("-")) {
      return ANSI.red + line + ANSI.reset
    } else if (line.startsWith("+")) {
      return ANSI.green + line + ANSI.reset
    }
    return line
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
  const diffRes = spawnSync("git", ["diff", "--color=never", ...gitArgs], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 })
  let currentDiff = diffRes.stdout.trim() || "no changes"
  if (currentDiff === "no changes" && !watchMode) { console.log(currentDiff); return }

  let sideBySide = false, scrollOffset = 0, mouseEnabled = true, wantCommit = false
  const stdin = process.stdin
  emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.resume()

  process.stdout.write(ANSI.enterAltBuffer + ANSI.hideCursor + ANSI.enableMouse)

  const render = () => {
    process.stdout.write(ANSI.clear)
    const w = process.stdout.columns || 130, h = process.stdout.rows || 24
    const allLines = sideBySide ? formatSideBySide(currentDiff, w) : formatInline(currentDiff, w)
    scrollOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, allLines.length - (h - 2))))
    process.stdout.write(allLines.slice(scrollOffset, scrollOffset + (h - 2)).join("\n") + "\n")
    const mouseStatus = mouseEnabled ? "ON" : "OFF"
    const watchIndicator = watchMode ? ` [watching]` : ""
    process.stdout.write(`\r${ANSI.cyan}[s] side [i] inline [m] mouse: ${mouseStatus}${watchIndicator} [c] generate message [q] quit${ANSI.reset}`)
  }

  const refreshDiff = () => {
    const res = spawnSync("git", ["diff", "--color=never", ...gitArgs], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 })
    currentDiff = res.stdout.trim() || "no changes"
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
        refreshDiff()
        scrollOffset = 0
        render()
      }, 150)
    })
  }

  render()
  process.stdout.on("resize", render)

  const mouseHandler = (data: Buffer) => {
    if (!mouseEnabled) return
    const str = data.toString()
    const match = str.match(/\x1b\[<(\d+);/)
    if (match) {
      if (match[1] === "64") { scrollOffset -= 3; render() }
      else if (match[1] === "65") { scrollOffset += 3; render() }
    }
  }
  stdin.on("data", mouseHandler)

  await new Promise<void>((resolve) => {
    stdin.on("keypress", (_, key) => {
      if (!key) return
      if (key.name === "q" || (key.ctrl && key.name === "c")) resolve()
      else if (key.name === "c") { wantCommit = true; resolve() }
      else if (key.name === "s") { sideBySide = true; render() }
      else if (key.name === "i") { sideBySide = false; render() }
      else if (key.name === "m") { 
        mouseEnabled = !mouseEnabled
        process.stdout.write(mouseEnabled ? ANSI.enableMouse : ANSI.disableMouse)
        render()
      }
      else if (key.name === "up" || key.name === "k") { scrollOffset--; render() }
      else if (key.name === "down" || key.name === "j") { scrollOffset++; render() }
      else if (key.name === "pageup" || (key.ctrl && key.name === "b")) { scrollOffset -= 20; render() }
      else if (key.name === "pagedown" || (key.ctrl && key.name === "f")) { scrollOffset += 20; render() }
    })
  })

  watcher?.close()
  process.stdout.write(ANSI.disableMouse + ANSI.exitAltBuffer + ANSI.showCursor)
  stdin.setRawMode(false)

  if (!wantCommit) process.exit(0)

  const rl = readline.createInterface({ input, output })
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) { console.error("\nError: XAI_API_KEY is not set."); rl.close(); process.exit(1) }

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
      process.exit(1)
    }

    let msg = data.choices?.[0]?.message?.content?.trim() || ""
    if (!msg) {
      console.error("\nCould not generate a message. Check your API usage/quota.")
      rl.close()
      process.exit(1)
    }

    console.log(`\nSuggested message:\n${msg}`)
    const action = await rl.question("\ncommit? (y/n/edit): ")
    if (action === "edit") msg = await rl.question("New message: ")
    rl.close()

    if (action === "n" || !msg) process.exit(0)
    const path = `/tmp/msg-${Date.now()}.txt`
    fs.writeFileSync(path, msg)
    try { execSync(`git commit -F ${path}`, { stdio: "inherit" }) } finally { fs.unlinkSync(path) }
  } catch (err) {
    console.error(`\nFailed to reach xAI: ${err.message}`)
    rl.close()
  }
}

main().catch(console.error)
