---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the guidelines in `guidelines.md` next to this file
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules are in `guidelines.md` beside this file (a copy of Vercel's `command.md`; see SOURCE.md).
Read it before each review; nothing is fetched from the internet.

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md`
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
