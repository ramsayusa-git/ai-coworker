# Aetos Voice Console — front end

Rebuilt UI shell for the LiveKit voice-AI dashboard. Zero dependencies, zero build step.

    index.html   shell (rail, top bar, command palette)
    styles.css   design tokens + components (light/dark)
    app.js       router, mock data, inline-SVG charts

## Run the dev server

    cd "<this folder>"
    python3 -m http.server 5173
    # → http://localhost:5173

Any static server works (`npx serve`, `caddy file-server`, nginx root).

## What's here

19 screens under a hash router: Analytics, Rooms, Call History, Chat History,
Recording/Egress, Reports, Voice Agents, Chatbot Agents, Tools, Knowledge Base,
SIP Trunks, Dispatch Rules, Phone Numbers, Campaigns, Agent Tester, Simulation,
AutoResearch, Improvement Lab, Settings, User Guide.

- Collapsible rail (⌘/Ctrl+K palette, off-canvas drawer under 860px)
- Light + dark + system, remembered in localStorage
- Charts drawn as inline SVG against theme tokens — no Chart.js, no CDN
- All figures are sample data in `D` at the top of `app.js`

## Wiring it to the real backend

Every page is a pure function returning HTML. Replace the `D` object with
`fetch('/api/...')` results and re-render:

    const D = await (await fetch('/api/server-stats')).json();

Endpoint map for the existing FastAPI backend is in `../vaai-tech-stack-analysis.md`.
