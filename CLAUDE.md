# CLAUDE.md

## Tech Stack
- Plain HTML, CSS and JavaScript only.
- No frameworks or libraries (no React, Vue, Tailwind, jQuery, etc.).
- No build step: files are opened or served exactly as written.

## Project Structure
- `index.html`: the portal homepage (tool cards)
- `tools/`: one page per tool (`tool-1.html` is a placeholder for now)
- `css/style.css`: shared styles, including the light/dark colour tokens
- `js/theme.js`: the light/dark theme toggle, shared by every page
- `CLAUDE.md`: this file

Update this section as files are added.

## Key Requirements
1. Every page must be responsive and work on desktop, tablet and phone.
2. Users can toggle between a light and a dark theme. The default is the light theme.
3. Text must stay easy to read, with good contrast, in both the light and the dark theme.

## Feature Plan
A web portal where students try small Engineering Design tools.

### Portal structure
- **Homepage (`index.html`):** portal name, theme toggle, a short intro, and a grid of tool cards (one per tool).
- **Opening a tool:** clicking a card opens that tool's own page in `tools/` (e.g. `tools/design-ideas.html`).
- **Getting back:** every tool page has the same header as the homepage, with an "← All tools" link and the portal name linking home.
- **Adding a tool later:** create a new page in `tools/` (plus its script in `js/`), then add one card for it on the homepage.

### Phases
1. **Portal + first tool (Design Idea Generator).** Homepage, shared header, light/dark theme. The tool: a student enters a problem statement (and optional constraints), and AI returns 3–6 design ideas, each with how it works, strengths, weaknesses and a question to explore next. Includes Copy and Download. A small Node.js server (built-in features only, no packages) keeps the AI key secret and limits usage.
   - [x] Portal: homepage, shared header, theme toggle, and a placeholder "Tool 1 — coming soon" card that opens `tools/tool-1.html` and returns via "← All tools". Styling is neutral for now.
   - [ ] Design Idea Generator tool and its server.
2. **Go online.** Choose a host, deploy, and test on real phones and tablets.
3. **More tools.** Add Engineering Design tools one at a time (ideas: decision matrix, factor of safety, tolerance stack-up).

## Rules for Claude
- Explain technical terms in plain language.
- Ask before making big changes.
- When something is unclear, ask rather than guess.
