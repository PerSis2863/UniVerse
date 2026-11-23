# Running Ghidra's exam on your own computer

This asks Ghidra all of its test questions (about 2,500) the same way the website does, and prints a score for each
skill. It also does the three things the owner console's button can't: bill pictures, voice recordings and Hyperion's
code. It uses your own Gemini key; Google's free amount is usually enough for `--per 10` (about 430 questions) in a day.

## Once

1. Set up the project as in `AGENTS.md` §5 (Node.js 22, Git, `pnpm install`; on Windows use WSL).
2. For the bill pictures: `npm install -g playwright` and `npx playwright install chromium`.
3. For the voice questions: install **ffmpeg** (Mac: `brew install ffmpeg`; Ubuntu / WSL: `sudo apt install ffmpeg`).
   Without it those questions are listed as "not asked" and everything else still runs.
4. A Gemini API key: Google AI Studio (aistudio.google.com) → Get API key. Keep it to yourself.

## Each time

From the `apps/web` folder:

```
node scripts/ai/ghidra-exam.mjs --ask-key --per 10
```

Paste the key when it asks. Nothing shows while you paste, and it isn't saved anywhere. A quick look takes about 15
minutes; leave out `--per 10` for the whole exam (a few hours, may need two days of Google's free amount).

At the end it prints the score card and where it saved it (`exam-runs/<date>/card.txt`). Send Claude that file (not
the key) and ask it to read the results.

Useful extras: `--skills support,tutor` asks only those skills; `--rescore exam-runs/<date>` marks saved answers again
after Claude fixes a rule (no AI asked, no cost).
