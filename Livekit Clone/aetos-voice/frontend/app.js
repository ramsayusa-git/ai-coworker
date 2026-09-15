/* Aetos Voice Console — front-end shell (mock data, wire to /api/* later) */
(() => {
'use strict';

/* ---------------- icons (inline, 24x24 stroke) ---------------- */
const P = {
  gauge:'M12 13l4-4M3.5 17a9 9 0 1117 0M12 17v.01',
  report:'M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h5',
  door:'M4 20h16M7 20V4h10v16M13 12v1',
  clock:'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  chat:'M4 5h16v11H9l-5 4z',
  rec:'M12 21a9 9 0 100-18 9 9 0 000 18zM12 15a3 3 0 100-6 3 3 0 000 6z',
  wrench:'M15 4a5 5 0 00-4.6 7L4 17.4 6.6 20l6.4-6.4A5 5 0 1015 4z',
  book:'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2zM19 17H6',
  robot:'M7 8h10a2 2 0 012 2v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7a2 2 0 012-2zM12 4v4M9 13v1M15 13v1',
  bubbles:'M3 6h12v8H8l-5 4zM17 9h4v8l-3-2h-5',
  phone:'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a15 15 0 01-15-15z',
  tree:'M12 3v5M6 21v-4M18 21v-4M6 17h12v-4H6zM10 8h4v5h-4z',
  hash:'M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16',
  mega:'M4 10v4h3l8 4V6l-8 4zM18 9a4 4 0 010 6',
  flask:'M10 3v6L5 19a2 2 0 002 2h10a2 2 0 002-2l-5-10V3M9 3h6M8 14h8',
  cpu:'M8 8h8v8H8zM5 10V6h4M19 10V6h-4M5 14v4h4M19 14v4h-4',
  search:'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  clip:'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4',
  gear:'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4',
  guide:'M12 21a9 9 0 100-18 9 9 0 000 18zM12 17v.01M10 9a2 2 0 114 .8c0 1.2-2 1.5-2 3.2',
  menu:'M4 7h16M4 12h16M4 17h16',
  sun:'M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  moon:'M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z',
  bell:'M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 004 0',
  plus:'M12 5v14M5 12h14',
  play:'M8 5l11 7-11 7z',
  bolt:'M13 3L5 14h6l-1 7 8-11h-6z',
  panel:'M4 5h16v14H4zM9 5v14',
};
const ico = (n, s = 18) =>
  `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]||P.gauge}"/></svg>`;

/* ---------------- navigation model ---------------- */
const NAV = [
  ['Operations', [
    ['overview','Analytics','gauge','Live health, cost and quality across every agent'],
    ['rooms','Rooms','door','Active LiveKit sessions and their participants','3'],
    ['calls','Call History','clock','Every completed voice call, transcript and cost'],
    ['chats','Chat History','chat','Widget and web-chat conversations'],
    ['egress','Recording / Egress','rec','Composite recordings and where they are stored'],
    ['reports','Reports','report','Scheduled rollups delivered to email or n8n'],
  ]],
  ['Build', [
    ['agents','Voice Agents','robot','Prompt, voice pipeline and tools per agent','2'],
    ['chatbots','Chatbot Agents','bubbles','Text and hybrid agents for the web widget','2'],
    ['tools','Tools','wrench','Built-in, webhook and MCP tools available to agents'],
    ['kb','Knowledge Base','book','Qdrant collections and per-agent memory'],
  ]],
  ['Telephony', [
    ['trunks','SIP Trunks','phone','Inbound and outbound carrier trunks'],
    ['rules','Dispatch Rules','tree','Which number reaches which agent'],
    ['numbers','Phone Numbers','hash','Purchased DIDs and their routing'],
    ['campaigns','Campaigns','mega','Outbound dialling lists and pacing'],
  ]],
  ['Testing', [
    ['tester','Agent Tester','play','Talk to an agent in the browser before you ship'],
    ['simulation','Simulation','cpu','Scripted personas run against an agent, scored'],
    ['autoresearch','AutoResearch','flask','DSPy prompt optimisation over past calls'],
    ['implab','Improvement Lab','clip','Scored transcripts and prompt revisions'],
  ]],
  ['Admin', [
    ['components','Components','cpu','Every service, provider and model — versions, health, upgrades','1'],
    ['settings','Settings','gear','Providers, storage, security, licensing'],
    ['guide','User Guide','guide','How every screen in the console works'],
  ]],
];
const ROUTES = {};
NAV.forEach(([grp, items]) => items.forEach(([id, label, icon, sub]) => ROUTES[id] = {id,label,icon,sub,grp}));

/* ---------------- mock data ---------------- */
const D = {
  calls24: [18,22,19,27,34,41,38,52,61,58,49,55,63,71,66,58,62,74,69,57,44,36,29,24],
  minutes24:[42,51,47,63,79,96,88,121,142,136,114,129,147,166,154,135,145,173,161,133,102,84,68,56],
  ttfb:    [720,690,742,705,668,712,760,731,698,684,717,745,703,689,676,721,744,712,690,701,733,708,681,695],
  asr:     [188,176,192,181,170,185,199,190,178,172,183,196,180,174,168,186,193,182,175,179,190,184,171,177],
  agents: [
    {n:'Aetos Receptionist',t:'voice',st:'online',llm:'GPT-4o mini',stt:'Deepgram Nova-3',tts:'Cartesia Sonic 3',calls:418,min:962,ttfb:684,succ:94},
    {n:'Sumeru Plant Ops',t:'voice',st:'online',llm:'Claude Haiku 4.5',stt:'Speechmatics',tts:'ElevenLabs Flash v2.5',calls:126,min:310,ttfb:731,succ:91},
    {n:'Aetos Support Chat',t:'chat',st:'online',llm:'Gemini 2.5 Flash',stt:'—',tts:'—',calls:874,min:0,ttfb:412,succ:88},
    {n:'After-Hours Triage',t:'voice',st:'paused',llm:'GPT-4o mini',stt:'Deepgram Nova-3',tts:'Cartesia Sonic 2',calls:0,min:0,ttfb:0,succ:0},
  ],
  calls: [
    ['+61 412 908 774','Aetos Receptionist','04:12','completed',0.31,712,'Booked a site survey for Thursday 10am'],
    ['+61 401 553 210','Aetos Receptionist','01:48','completed',0.14,688,'Asked about PLC monitoring pricing, sent brochure'],
    ['+91 98490 11223','Sumeru Plant Ops','07:33','completed',0.58,745,'Reported RO pump 2 tripping, logged ticket'],
    ['+61 3 9042 8811','Aetos Receptionist','00:22','no-answer',0.01,0,'Caller hung up during greeting'],
    ['+61 438 771 602','After-Hours Triage','03:05','transferred',0.24,703,'Escalated to on-call after two failed lookups'],
    ['+61 422 118 940','Aetos Receptionist','02:41','completed',0.19,676,'Rescheduled Friday install to next Tuesday'],
    ['+91 90000 41277','Sumeru Plant Ops','05:19','completed',0.44,758,'Wash cycle 3 aborted — asked for manual restart'],
    ['+61 455 230 118','Aetos Receptionist','01:12','failed',0.06,0,'TTS provider timeout at turn 2'],
  ],
  rooms: [
    ['call-_5xQ81','Aetos Receptionist','+61 412 908 774','02:14',2,'sip'],
    ['web-_a9Kd2','Aetos Support Chat','widget · chrome/mac','06:41',2,'web'],
    ['call-_7zMp0','Sumeru Plant Ops','+91 98490 11223','00:38',2,'sip'],
  ],
  services: [
    ['Dashboard','livekit-dashboard','ok',18,412],
    ['LiveKit Server','livekit.service','ok',24,689],
    ['Agent Worker','livekit-agent','ok',47,1284],
    ['SIP Bridge','livekit-sip','ok',9,206],
    ['Egress','livekit-egress','warn',71,1930],
    ['Redis','redis','ok',6,198],
    ['Qdrant','qdrant (docker)','ok',11,540],
  ],
  spend: [['LLM',38.42,'violet'],['TTS',26.18,'brand'],['STT',14.90,'warn'],['Telephony',9.64,'ink-3']],
  tools: [
    ['transfer_call','built-in','Warm or blind transfer to a human',4],
    ['send_sms','built-in','Twilio / Telnyx outbound SMS',3],
    ['book_appointment','webhook','POST to n8n booking workflow',2],
    ['lookup_order','webhook','Reads the Loqio order API',1],
    ['qdrant_search','mcp','Vector search over the KB collection',4],
    ['plant_status','mcp','Reads Sumeru tank + pump entities',1],
  ],
  kb: [
    ['aetos-products','Qdrant','1,284 chunks','text-embedding-3-small','2 agents'],
    ['sumeru-sop','Qdrant','406 chunks','text-embedding-3-small','1 agent'],
    ['pricing-2026','Qdrant','92 chunks','text-embedding-3-small','1 agent'],
  ],
  trunks:[['tw-inbound-au','Twilio','inbound','+61 3 9042 8811','registered'],
          ['tnx-outbound-in','Telnyx','outbound','+91 40 4854 2200','registered'],
          ['tw-outbound-au','Twilio','outbound','+61 3 9042 8812','degraded']],
  numbers:[['+61 3 9042 8811','Melbourne, AU','Aetos Receptionist','inbound'],
           ['+61 3 9042 8812','Melbourne, AU','Campaign: Spring survey','outbound'],
           ['+91 40 4854 2200','Hyderabad, IN','Sumeru Plant Ops','both']],
  rules:[['Business hours AU','+61 3 9042 8811','Aetos Receptionist','Mon–Fri 08:00–18:00 AEST'],
         ['After hours AU','+61 3 9042 8811','After-Hours Triage','all other times'],
         ['Plant line','+91 40 4854 2200','Sumeru Plant Ops','always']],
  campaigns:[['Spring site surveys','running',412,268,'65%','Aetos Receptionist'],
             ['Renewal reminders','paused',180,180,'100%','Aetos Receptionist'],
             ['Plant quarterly check','draft',64,0,'0%','Sumeru Plant Ops']],
  turns:[['caller','Hi, I had a call about the plant monitoring package last week.','00:04'],
         ['agent','Of course — I can pick that up. Was that for the Sumeru site or a new location?','00:07'],
         ['caller','Sumeru. We want the second RO line added.','00:13'],
         ['agent','Got it. Adding a second RO line means two more flow sensors and one pressure transmitter. I can book an engineer to scope it — Thursday 10am or Friday 2pm?','00:16'],
         ['caller','Thursday works.','00:27'],
         ['agent','Booked for Thursday 10am. I have sent the confirmation to the number you are calling from.','00:29']],
  sims:[['Angry caller — billing dispute','passed',4.6,'12 turns'],
        ['Accent stress — Indian English','passed',4.2,'9 turns'],
        ['Interruption / barge-in','failed',2.8,'7 turns'],
        ['Silent caller','passed',4.8,'4 turns'],
        ['Out-of-scope question','passed',4.1,'6 turns']],
  comps:[
    // name, kind, version, model, contract, health, gpu MB, rtt ms, update, drain
    ['aetos-core','core','2.1.0','—','core-api 1 · events 1','ok',0,null,null,'no'],
    ['aetos-agent','worker','1.8.0','vad silero 1.8 · turn v1-mini','provider-api 1 · events 1','ok',0,null,null,'no'],
    ['stt-parakeet','provider/stt','0.4.2','parakeet-tdt-0.6b-v2','provider-api 1','ok',2100,1,'0.4.3','no'],
    ['stt-deepgram','provider/stt','7.8.1','nova-3','provider-api 1','ok',0,168,null,'no'],
    ['tts-kokoro','provider/tts','0.9.4','kokoro-v1.0 · 4 voices','provider-api 1','ok',1050,1,null,'no'],
    ['tts-cartesia','provider/tts','4.2.0','sonic-3','provider-api 1','warn',0,182,'4.3.0','no'],
    ['llm-gateway','provider/llm','1.74','litellm · 3 routes','openai-compat','ok',0,2,null,'no'],
    ['vllm-qwen3-8b','provider/llm','0.11.2','Qwen3-8B FP8','openai-compat','ok',9800,1,null,'no'],
    ['livekit-server','platform','1.13.6','—','—','ok',0,null,'1.13.7','no'],
    ['livekit-sip','platform','1.3.2','—','—','ok',0,null,null,'no'],
    ['livekit-egress','platform','1.9.0','—','—','warn',0,null,null,'no'],
    ['redis','data','7.4','—','events 1','ok',0,null,null,'no'],
    ['qdrant','data','1.12','—','—','ok',0,null,null,'no'],
    ['tool-booking','tool','1.2.0','n8n webhook','mcp','ok',0,4,null,'no'],
  ],
  store:[
    ['stt-whisper-turbo','provider/stt','faster-whisper large-v3-turbo · 99 languages','2.1 GB VRAM','free'],
    ['stt-indic-conformer','provider/stt','AI4Bharat · 22 Indian languages','1.0 GB VRAM','free'],
    ['tts-orpheus','provider/tts','Expressive streaming TTS, LLM-based','6 GB VRAM','free'],
    ['tts-elevenlabs','provider/tts','Flash v2.5 · Turbo v2.5 · cloud','—','free'],
    ['tts-indic-parler','provider/tts','AI4Bharat Indic-Parler-TTS','3 GB VRAM','free'],
    ['channel-whatsapp','channel','WhatsApp Business API sessions','—','pro'],
    ['sink-bigquery','sink','Stream every session event to BigQuery','—','pro'],
    ['tool-crm-hubspot','tool','MCP · contact + deal lookup mid-call','—','free'],
  ],
  events:[['Egress memory above 70% for 6 min','warn','12 min ago'],
          ['Agent worker restarted after config save','info','41 min ago'],
          ['Telnyx outbound trunk re-registered','info','1 h ago'],
          ['TTS timeout on call-_3kP9 (ElevenLabs)','crit','2 h ago'],
          ['Nightly backup uploaded to S3 (412 MB)','info','7 h ago']],
};

/* ---------------- live API layer ---------------- */
const API = (() => {
  const base = (window.AETOS_API || '').replace(/\/$/, '');
  let live = null;                       // null=unknown, true/false after first probe
  const get = async (path) => {
    const r = await fetch(base + path, {headers:{accept:'application/json'}});
    if (!r.ok) throw new Error(r.status + ' ' + path);
    return r.json();
  };
  const post = async (path, body) => {
    const r = await fetch(base + path, {method:'POST', headers:{'content-type':'application/json'}, body: body?JSON.stringify(body):undefined});
    if (!r.ok) throw new Error(r.status + ' ' + path);
    return r.json();
  };
  const probe = async () => { try { await get('/healthz'); live = true; } catch { live = false; } return live; };
  return { get, post, probe, isLive: () => live };
})();
const LIVE = { overview:null, agents:null, sessions:null, components:null, store:null, trunks:null, numbers:null, rules:null, audit:null };
async function refreshLive() {
  if (!(await API.probe())) return false;
  const jobs = {
    overview: '/api/v1/analytics/overview', agents: '/api/v1/agents', sessions: '/api/v1/sessions?limit=60',
    components: '/api/v1/components', store: '/api/v1/components/store', trunks: '/api/v1/telephony/trunks',
    numbers: '/api/v1/telephony/numbers', rules: '/api/v1/telephony/rules', audit: '/api/v1/system/audit?n=20',
  };
  await Promise.all(Object.entries(jobs).map(async ([k, p]) => { try { LIVE[k] = await API.get(p); } catch { LIVE[k] = null; } }));
  return true;
}
const fmtDur = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m/60)} h ago` : `${Math.round(m/1440)} d ago`; };

/* ---------------- chart helpers (SVG, theme-token aware) ---------------- */
const nice = n => n >= 1000 ? (n/1000).toFixed(n%1000?1:0)+'k' : String(n);

function area(vals, {h=170, stroke='var(--brand)', fill='var(--brand)', labels=[], unit=''} = {}) {
  const w = 720, padL = 42, padB = 22, padT = 12;
  const max = Math.max(...vals) * 1.12, min = 0;
  const iw = w - padL - 10, ih = h - padB - padT;
  const x = i => padL + (i/(vals.length-1)) * iw;
  const y = v => padT + ih - ((v-min)/(max-min)) * ih;
  const pts = vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
  const id = 'g'+Math.random().toString(36).slice(2,7);
  const ticks = [0, max/2, max].map(v => `
    <line x1="${padL}" x2="${w-10}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"
      stroke="var(--line-soft)" stroke-width="1"/>
    <text x="${padL-8}" y="${(y(v)+4).toFixed(1)}" text-anchor="end" font-size="10"
      font-family="var(--f-mono)" fill="var(--ink-3)">${nice(Math.round(v))}</text>`).join('');
  const xl = labels.map((l,i) => l ? `<text x="${x(i*(vals.length-1)/(labels.length-1)).toFixed(1)}"
      y="${h-6}" text-anchor="middle" font-size="10" font-family="var(--f-mono)"
      fill="var(--ink-3)">${l}</text>` : '').join('');
  const last = vals.length-1;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="trend, peak ${nice(Math.max(...vals))}${unit}">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${fill}" stop-opacity=".30"/>
      <stop offset="1" stop-color="${fill}" stop-opacity="0"/></linearGradient></defs>
    ${ticks}
    <path d="M${x(0)},${y(vals[0])} L${pts} L${x(last)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#${id})"/>
    <path d="M${x(0)},${y(vals[0])} L${pts}" fill="none" stroke="${stroke}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(last).toFixed(1)}" cy="${y(vals[last]).toFixed(1)}" r="4" fill="${stroke}"/>
    <circle cx="${x(last).toFixed(1)}" cy="${y(vals[last]).toFixed(1)}" r="8" fill="${stroke}" opacity=".18"/>
    ${xl}</svg>`;
}

function spark(vals, color='var(--brand)') {
  const w=240,h=34,max=Math.max(...vals),min=Math.min(...vals),r=(max-min)||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1)*w).toFixed(1)},${(h-4-((v-min)/r)*(h-10)).toFixed(1)}`).join(' L');
  const id='s'+Math.random().toString(36).slice(2,7);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".22"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="M0,${h} L${pts} L${w},${h} Z" fill="url(#${id})"/>
    <path d="M${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function donut(segs) {
  const total = segs.reduce((a,s)=>a+s[1],0), R=54, C=2*Math.PI*R;
  let off = 0;
  const arcs = segs.map(([n,v,c]) => {
    const len = (v/total)*C, el = `<circle cx="70" cy="70" r="${R}" fill="none"
      stroke="var(--${c})" stroke-width="18" stroke-dasharray="${len.toFixed(1)} ${(C-len).toFixed(1)}"
      stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 70 70)"/>`;
    off += len; return el;
  }).join('');
  return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
    <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="spend split">
      ${arcs}
      <text x="70" y="66" text-anchor="middle" font-size="20" font-family="var(--f-display)"
        font-weight="600" fill="var(--ink)">$${total.toFixed(0)}</text>
      <text x="70" y="84" text-anchor="middle" font-size="10" font-family="var(--f-mono)"
        fill="var(--ink-3)">LAST 24 H</text></svg>
    <div style="flex:1;min-width:150px">${segs.map(([n,v,c])=>`
      <div class="mrow"><span class="nm"><i style="display:inline-block;width:9px;height:9px;border-radius:3px;
        background:var(--${c});margin-right:8px"></i>${n}</span>
        <span class="vl">$${v.toFixed(2)}</span>
        <div class="meter"><i style="width:${(v/total*100).toFixed(0)}%;background:var(--${c})"></i></div></div>`).join('')}
    </div></div>`;
}

function bars(vals, labels, color='var(--violet)') {
  const w=720,h=150,padL=34,padB=20,max=Math.max(...vals)*1.15;
  const bw = (w-padL-10)/vals.length;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="distribution">
    ${[0,max/2,max].map(v=>`<line x1="${padL}" x2="${w-10}" y1="${(h-padB-(v/max)*(h-padB-10)).toFixed(1)}"
      y2="${(h-padB-(v/max)*(h-padB-10)).toFixed(1)}" stroke="var(--line-soft)"/>
      <text x="${padL-6}" y="${(h-padB-(v/max)*(h-padB-10)+4).toFixed(1)}" text-anchor="end" font-size="10"
      font-family="var(--f-mono)" fill="var(--ink-3)">${nice(Math.round(v))}</text>`).join('')}
    ${vals.map((v,i)=>{const bh=(v/max)*(h-padB-10);
      return `<rect x="${(padL+i*bw+3).toFixed(1)}" y="${(h-padB-bh).toFixed(1)}" width="${(bw-6).toFixed(1)}"
        height="${bh.toFixed(1)}" rx="3" fill="${color}" opacity="${0.45+0.55*(v/Math.max(...vals))}"/>
        <text x="${(padL+i*bw+bw/2).toFixed(1)}" y="${h-5}" text-anchor="middle" font-size="9.5"
        font-family="var(--f-mono)" fill="var(--ink-3)">${labels[i]}</text>`}).join('')}
  </svg>`;
}

/* ---------------- small builders ---------------- */
const stat = (lbl,val,unit,trend,dir,foot,sp,accent) => `
  <div class="stat${accent?' accent':''}">
    <span class="lbl">${lbl}</span>
    <span class="val">${val}${unit?`<small>${unit}</small>`:''}</span>
    <span class="foot"><span class="trend ${dir}">${trend}</span>${foot}</span>
    ${sp||''}
  </div>`;
const head = (t,sub,right='') => `<div class="card-head"><h3>${t}</h3>
  ${sub?`<span class="sub">${sub}</span>`:''}<span class="spacer"></span>${right}</div>`;
const table = (cols, rows) => `<div class="tw"><table><thead><tr>${
  cols.map(c=>`<th${c[1]?' class="num"':''}>${c[0]}</th>`).join('')}</tr></thead><tbody>${
  rows.join('')}</tbody></table></div>`;
const money = n => '$'+n.toFixed(2);

/* ---------------- pages ---------------- */
const PAGES = {};

PAGES.overview = () => {
  const hrs = ['00','04','08','12','16','20','23'];
  const o = LIVE.overview, calls = o ? o.per_hour : D.calls24;
  const recent = LIVE.sessions ? LIVE.sessions.slice(0,6).map(x=>[x.caller,x.agent,fmtDur(x.duration_s),x.outcome,x.cost,x.ttfb_ms,x.summary]) : D.calls.slice(0,6);
  const evts = LIVE.audit ? LIVE.audit.slice(0,5).map(a=>[`${a.action} ${a.detail}`.trim(), a.action.includes('delete')?'warn':'info', ago(a.ts)]) : D.events;
  const svc = LIVE.components ? LIVE.components.filter(c=>c.kind!=='supervisor').map(c=>[c.name,c.kind,c.health.state==='ready'?'ok':'warn',c.health.rtt_ms?Math.min(99,Math.round(c.health.rtt_ms*4)):(c.pid?12:0),c.resources?.memory||'—']) : D.services;
  return `
  <div class="page-head">
    <div><h2>Analytics</h2><p>Every voice and chat session across the fleet, last 24 hours. Figures are sample data until the console is pointed at a live server.</p></div>
    <span class="spacer"></span>
    <div class="seg"><button class="on">24 h</button><button>7 d</button><button>30 d</button></div>
    <a class="btn ghost" href="#reports">${ico('report',16)} Export</a>
  </div>

  <div class="grid k4" style="margin-bottom:14px">
    ${stat('Calls handled',o?o.calls.toLocaleString():'1,142','',o?'live':'+12.4%',o?'flat':'up',o?`${o.by_outcome.completed||0} completed`:'vs. previous 24 h',spark(calls),true)}
    ${stat('Talk minutes',o?o.minutes.toLocaleString():'2,918','',o?'live':'+8.1%',o?'flat':'up',o&&o.calls?`avg ${fmtDur(Math.round(o.minutes*60/o.calls))} per call`:'avg 2 m 33 s per call',spark(D.minutes24,'var(--violet)'))}
    ${stat('Time to first byte',o?String(o.ttfb_ms):'704','ms',o?'live':'−3.2%',o?'flat':'up','p50 across all agents',spark(D.ttfb.map(v=>1500-v),'var(--brand)'))}
    ${stat('Spend',o?'$'+o.cost.toFixed(2):'$89.14','',o?'live':'+5.6%',o?'flat':'down','LLM + TTS + STT + carrier',spark(D.minutes24.map(v=>v*0.7),'var(--warn)'))}
  </div>

  <div class="split" style="margin-bottom:14px">
    <div class="card">
      ${head('Call volume','calls started per hour, Australia/Sydney',
        '<span class="pill ok">live</span>')}
      ${area(calls.length>1?calls:D.calls24,{labels:hrs, unit:' calls'})}
      <div class="legend"><span><i style="background:var(--brand)"></i>Calls started</span>
        <span><i style="background:var(--line)"></i>Peak ${Math.max(...calls)} calls</span></div>
    </div>
    <div class="card">
      ${head('Where the money goes','by provider')}
      ${donut(D.spend)}
    </div>
  </div>

  <div class="split" style="margin-bottom:14px">
    <div class="card">
      ${head('Response latency','median per hour — speech-to-text vs. first audio out')}
      ${area(D.ttfb,{labels:hrs, stroke:'var(--violet)', fill:'var(--violet)', h:160, unit:' ms'})}
      <div class="legend"><span><i style="background:var(--violet)"></i>TTFB (ms)</span>
        <span><i style="background:var(--brand)"></i>Target ≤ 800 ms — held all day</span></div>
    </div>
    <div class="card">
      ${head('Service health','systemd + docker','<a class="btn ghost" href="#settings">Open system</a>')}
      ${svc.map(([n,u,st,cpu,mem])=>`
        <div class="mrow">
          <span class="nm">${n} <span class="t-sub mono">${u}</span></span>
          <span class="vl">${cpu}% · ${mem}${typeof mem==='number'?' MB':''}</span>
          <div class="meter"><i class="${cpu>65?'warn':''}" style="width:${cpu}%"></i></div>
        </div>`).join('')}
    </div>
  </div>

  <div class="split">
    <div class="card">
      ${head('Recent calls','last 8 sessions','<a class="btn ghost" href="#calls">All calls</a>')}
      ${table([['From'],['Agent'],['Length',1],['Outcome'],['Cost',1]],
        recent.map(c=>`<tr>
          <td><span class="sev" style="background:var(--${c[3]==='completed'?'ok':c[3]==='failed'?'crit':'warn'})"></span>
            <span class="mono">${c[0]}</span></td>
          <td class="t-main">${c[1]}<div class="t-sub">${c[6]}</div></td>
          <td class="num">${c[2]}</td>
          <td><span class="pill ${c[3]==='completed'?'ok':c[3]==='failed'?'crit':'warn'}">${c[3]}</span></td>
          <td class="num">${money(c[4])}</td></tr>`))}
    </div>
    <div class="card">
      ${head('What changed','system events')}
      <div class="rows">${evts.map(([t,k,w])=>`
        <div class="row"><div class="ic ${k==='crit'?'w':k==='warn'?'w':'v'}">${ico(k==='info'?'bolt':'bell',15)}</div>
          <div class="bd"><b>${t}</b><span>${w}</span></div>
          <span class="pill ${k==='crit'?'crit':k==='warn'?'warn':'mute'} nodot">${k}</span></div>`).join('')}
      </div>
    </div>
  </div>`;
};

PAGES.rooms = () => `
  <div class="page-head"><div><h2>Rooms</h2><p>Sessions currently open on the LiveKit SFU. A room closes when the last participant leaves.</p></div>
    <span class="spacer"></span><span class="pill ok">3 active</span>
    <button class="btn ghost">${ico('rec',16)} Watch live</button></div>
  <div class="grid k3" style="margin-bottom:14px">
    ${stat('Active rooms','3','','+1','up','peak today 9')}
    ${stat('Participants','6','','flat','flat','2 per room — caller + agent')}
    ${stat('Egress bandwidth','4.2','Mbit/s','−0.4','up','composite recording on')}
  </div>
  ${table([['Room'],['Agent'],['Participant'],['Duration',1],['Source'],['']],
    D.rooms.map(r=>`<tr>
      <td class="mono t-main">${r[0]}</td><td>${r[1]}</td>
      <td class="mono">${r[2]}</td><td class="num">${r[3]}</td>
      <td><span class="pill ${r[5]==='sip'?'vio':'mute'} nodot">${r[5]}</span></td>
      <td style="text-align:right"><button class="btn ghost">Listen in</button></td></tr>`))}`;

PAGES.calls = () => `
  <div class="page-head"><div><h2>Call History</h2><p>Recent calls are served from Redis; anything older loads from the S3 archive.</p></div>
    <span class="spacer"></span>
    <div class="seg"><button class="on">All</button><button>Completed</button><button>Failed</button></div>
    <button class="btn ghost">${ico('report',16)} Export CSV</button></div>
  <div class="grid k4" style="margin-bottom:14px">
    ${stat('Calls today','1,142','','+12.4%','up','across 3 live agents')}
    ${stat('Answer rate','92.6','%','+1.1','up','no-answer counted as unanswered')}
    ${stat('Avg handle time','2:33','','−0:11','up','shorter is usually better here')}
    ${stat('Cost per call','$0.078','','+0.004','down','all providers combined')}
  </div>
  ${table([['From'],['Agent'],['Length',1],['TTFB',1],['Outcome'],['Cost',1],['Summary']],
    (LIVE.sessions ? LIVE.sessions.map(x=>[x.caller,x.agent,fmtDur(x.duration_s),x.outcome,x.cost,x.ttfb_ms,x.summary]) : D.calls).map(c=>`<tr>
      <td class="mono">${c[0]}</td><td class="t-main">${c[1]}</td>
      <td class="num">${c[2]}</td><td class="num">${c[5]?c[5]+' ms':'—'}</td>
      <td><span class="pill ${c[3]==='completed'?'ok':c[3]==='failed'?'crit':'warn'}">${c[3]}</span></td>
      <td class="num">${money(c[4])}</td>
      <td style="max-width:340px">${c[6]}</td></tr>`))}
  <div class="split" style="margin-top:14px">
    <div class="card">${head('Transcript','call-_5xQ81 · Aetos Receptionist · 04:12')}
      <div class="turns">${D.turns.map(([w,t,ts])=>`
        <div class="turn ${w==='agent'?'a':''}"><div class="who">${w}</div>
          <div class="bub">${t}</div><div class="t">${ts}</div></div>`).join('')}</div></div>
    <div class="card">${head('Turn latency','per turn, this call')}
      ${bars([712,688,734,701,690,676],['1','2','3','4','5','6'])}
      <div class="legend"><span><i style="background:var(--violet)"></i>Time to first audio (ms)</span></div>
      <div class="note info" style="margin-top:12px">${ico('bolt',16)}
        <span><b>Turn 3 ran 734 ms.</b> The knowledge-base lookup added 46 ms — still inside the 800 ms target.</span></div>
    </div></div>`;

PAGES.chats = () => `
  <div class="page-head"><div><h2>Chat History</h2><p>Web-widget and embedded chat conversations, stored in Redis with a configurable TTL.</p></div>
    <span class="spacer"></span><button class="btn ghost">Chat settings</button></div>
  <div class="grid k4" style="margin-bottom:14px">
    ${stat('Conversations','874','','+18.2%','up','last 24 h')}
    ${stat('Messages','6,114','','+21%','up','7.0 per conversation')}
    ${stat('Handoffs to human','38','','−6','up','4.3% of conversations')}
    ${stat('Median reply','412','ms','−22','up','text-only, no TTS')}
  </div>
  ${table([['Visitor'],['Agent'],['Messages',1],['Outcome'],['Started']],
    [['chrome / macOS · Melbourne','Aetos Support Chat',14,'resolved','12 min ago'],
     ['safari / iOS · Hyderabad','Aetos Support Chat',6,'resolved','38 min ago'],
     ['chrome / Windows · Sydney','Aetos Support Chat',22,'handed off','1 h ago'],
     ['firefox / Linux · Perth','Aetos Support Chat',3,'abandoned','2 h ago']]
    .map(r=>`<tr><td class="t-main">${r[0]}</td><td>${r[1]}</td><td class="num">${r[2]}</td>
      <td><span class="pill ${r[3]==='resolved'?'ok':r[3]==='handed off'?'warn':'mute'}">${r[3]}</span></td>
      <td class="t-sub">${r[4]}</td></tr>`))}`;

PAGES.egress = () => `
  <div class="page-head"><div><h2>Recording / Egress</h2><p>Composite recordings written by <span class="mono">livekit-egress</span>, then archived to your own bucket.</p></div>
    <span class="spacer"></span><span class="pill warn">egress at 71% memory</span></div>
  <div class="grid k3" style="margin-bottom:14px">
    ${stat('Recordings today','1,098','','+11%','up','96% of completed calls')}
    ${stat('Archive size','412','GB','+2.1 GB','down','local disk + S3')}
    ${stat('Oldest local file','7','days','flat','flat','older files live in S3 only')}
  </div>
  <div class="split">
    <div class="card">${head('Recent recordings')}
      ${table([['File'],['Room'],['Length',1],['Size',1],['Where']],
        [['call-_5xQ81.ogg','call-_5xQ81','04:12','3.8 MB','S3'],
         ['call-_7zMp0.ogg','call-_7zMp0','05:19','4.9 MB','local'],
         ['web-_a9Kd2.mp4','web-_a9Kd2','06:41','41 MB','S3']]
        .map(r=>`<tr><td class="mono t-main">${r[0]}</td><td class="mono">${r[1]}</td>
          <td class="num">${r[2]}</td><td class="num">${r[3]}</td>
          <td><span class="pill ${r[4]==='S3'?'vio':'mute'} nodot">${r[4]}</span></td></tr>`))}</div>
    <div class="card">${head('Storage')}
      <div class="mrow"><span class="nm">Local disk</span><span class="vl">148 GB / 400 GB</span>
        <div class="meter"><i style="width:37%"></i></div></div>
      <div class="mrow"><span class="nm">S3 — aetos-voice-archive</span><span class="vl">264 GB</span>
        <div class="meter"><i style="width:66%;background:var(--violet)"></i></div></div>
      <div class="mrow"><span class="nm">Redis (hot call data)</span><span class="vl">188 MB / 256 MB</span>
        <div class="meter"><i class="warn" style="width:73%"></i></div></div>
      <div class="note" style="margin-top:6px">${ico('bell',16)}
        <span><b>Redis is at 73% of its cap.</b> The oldest already-archived calls will be evicted from memory first — nothing is lost, they just load a little slower.</span></div>
    </div></div>`;

PAGES.reports = () => `
  <div class="page-head"><div><h2>Reports</h2><p>Scheduled rollups, delivered by email or pushed into an n8n workflow.</p></div>
    <span class="spacer"></span><button class="btn">${ico('plus',16)} New report</button></div>
  ${table([['Report'],['Schedule'],['Delivery'],['Last run'],['Status']],
    [['Daily call summary','08:00 AEST daily','ramsay@aetostechlabs.com','today 08:00','ok'],
     ['Weekly cost breakdown','Mon 09:00 AEST','n8n → Slack #ops','Mon 09:00','ok'],
     ['Failed-call digest','hourly','ramsay@aetostechlabs.com','42 min ago','ok'],
     ['Sumeru plant weekly','Sun 18:00 IST','plant@sumeru.example','Sun 18:00','warn']]
    .map(r=>`<tr><td class="t-main">${r[0]}</td><td>${r[1]}</td><td class="mono t-sub">${r[2]}</td>
      <td class="t-sub">${r[3]}</td><td><span class="pill ${r[4]}">${r[4]==='ok'?'delivered':'retrying'}</span></td></tr>`))}`;

PAGES.agents = () => `
  <div class="page-head"><div><h2>Voice Agents</h2><p>Each agent is a prompt plus a speech pipeline: speech-to-text, a language model, and a voice.</p></div>
    <span class="spacer"></span>
    <button class="btn" id="newAgentBtn">${ico('plus',16)} New agent</button></div>
  <div class="agents">${(LIVE.agents ? LIVE.agents.filter(a=>a.kind==='voice').map(a=>({n:a.name,t:'voice',st:a.status,llm:a.pipeline.llm,stt:a.pipeline.stt,tts:a.pipeline.tts,calls:a.stats24h.calls,min:a.stats24h.minutes,ttfb:a.stats24h.ttfb_ms,succ:a.stats24h.resolved_pct,id:a.id})) : D.agents.filter(a=>a.t==='voice')).map(a=>`
    <article class="agent">
      <div class="top"><div class="face">${ico('robot',20)}</div>
        <div style="flex:1;min-width:0"><h4>${a.n}</h4><div class="who">${a.st==='online'?'answering calls':'paused — no dispatch rule'}</div></div>
        <span class="pill ${a.st==='online'?'ok':'mute'}">${a.st}</span></div>
      <div class="stack"><span class="tag">${a.stt}</span><span class="tag">${a.llm}</span><span class="tag">${a.tts}</span></div>
      ${a.id?`<div class="stack" style="padding-top:0"><button class="btn ghost" style="padding:4px 10px" data-act="${a.st==='online'?'pause':'publish'}" data-id="${a.id}">${a.st==='online'?'Pause':'Publish'}</button></div>`:''}
      <div class="bar"><div><b>${a.calls}</b><span>calls 24 h</span></div>
        <div><b>${a.min}</b><span>minutes</span></div>
        <div><b>${a.ttfb||'—'}</b><span>ttfb ms</span></div>
        <div><b>${a.succ}%</b><span>resolved</span></div></div>
    </article>`).join('')}
  </div>
  <div class="card" style="margin-top:14px">
    ${head('Pipeline latency by agent','median of the last 200 calls')}
    ${bars([684,731,0],['Receptionist','Plant Ops','Triage'],'var(--brand)')}
    <div class="legend"><span><i style="background:var(--brand)"></i>Time to first audio (ms)</span>
      <span><i style="background:var(--line)"></i>After-Hours Triage has taken no calls since it was paused</span></div>
  </div>`;

PAGES.chatbots = () => `
  <div class="page-head"><div><h2>Chatbot Agents</h2><p>Text and hybrid agents for the embeddable web widget. Same prompt and tools, no voice pipeline.</p></div>
    <span class="spacer"></span><button class="btn">${ico('plus',16)} New chatbot</button></div>
  <div class="agents">${[['Aetos Support Chat','online','Gemini 2.5 Flash',874,'88%'],
      ['Loqio Sales Assistant','draft','GPT-4o mini',0,'—']].map(a=>`
    <article class="agent"><div class="top"><div class="face v">${ico('bubbles',20)}</div>
      <div style="flex:1"><h4>${a[0]}</h4><div class="who">${a[1]==='online'?'embedded on aetostechlabs.com':'not published yet'}</div></div>
      <span class="pill ${a[1]==='online'?'ok':'mute'}">${a[1]}</span></div>
      <div class="stack"><span class="tag">${a[2]}</span><span class="tag">text + voice handoff</span></div>
      <div class="bar"><div><b>${a[3]}</b><span>chats 24 h</span></div>
        <div><b>${a[4]}</b><span>resolved</span></div></div></article>`).join('')}
  </div>
  <div class="card" style="margin-top:14px">${head('Embed snippet','paste before &lt;/body&gt; on any page')}
    <pre class="mono" style="margin:0;background:var(--sunken);border:1px solid var(--line-soft);
      border-radius:var(--r-s);padding:13px;overflow-x:auto;font-size:12px">&lt;script src="https://vaai.aetosiot.com/widget.js"
  data-agent="aetos-support-chat" data-theme="auto" defer&gt;&lt;/script&gt;</pre></div>`;

PAGES.tools = () => `
  <div class="page-head"><div><h2>Tools</h2><p>What an agent can actually do mid-call: transfer, send an SMS, hit a webhook, or call an MCP server.</p></div>
    <span class="spacer"></span><button class="btn ghost">${ico('wrench',16)} Add webhook tool</button>
    <button class="btn">${ico('plus',16)} Connect MCP server</button></div>
  <div class="grid k3" style="margin-bottom:14px">
    ${stat('Tools available','12','','+2','up','6 built-in, 4 webhook, 2 MCP')}
    ${stat('Tool calls today','2,418','','+9%','up','2.1 per conversation')}
    ${stat('Tool failures','14','','−6','up','0.6% — all webhook timeouts')}
  </div>
  ${table([['Tool'],['Kind'],['What it does'],['Agents',1],['']],
    D.tools.map(t=>`<tr><td class="mono t-main">${t[0]}</td>
      <td><span class="pill ${t[1]==='mcp'?'vio':t[1]==='webhook'?'warn':'mute'} nodot">${t[1]}</span></td>
      <td>${t[2]}</td><td class="num">${t[3]}</td>
      <td style="text-align:right"><button class="btn ghost">Test</button></td></tr>`))}`;

PAGES.kb = () => `
  <div class="page-head"><div><h2>Knowledge Base</h2><p>Documents are chunked, embedded and stored in Qdrant. Agents search them mid-call; memory is per-caller.</p></div>
    <span class="spacer"></span><button class="btn ghost">Test search</button>
    <button class="btn">${ico('plus',16)} New collection</button></div>
  <div class="grid k4" style="margin-bottom:14px">
    ${stat('Collections','3','','+1','up','all on the local Qdrant')}
    ${stat('Chunks indexed','1,782','','+92','up','text-embedding-3-small')}
    ${stat('Searches today','1,904','','+14%','up','1.7 per call')}
    ${stat('Median search','46','ms','−4','up','inside the turn budget')}
  </div>
  <div class="split">
    <div class="card">${head('Collections')}
      ${table([['Collection'],['Store'],['Size'],['Embedding'],['Used by']],
        D.kb.map(k=>`<tr><td class="mono t-main">${k[0]}</td><td>${k[1]}</td>
          <td class="num">${k[2]}</td><td class="t-sub mono">${k[3]}</td><td>${k[4]}</td></tr>`))}</div>
    <div class="card">${head('Agent memory','mem0 — remembered across calls')}
      <div class="rows">
        <div class="row"><div class="ic b">${ico('book',15)}</div><div class="bd">
          <b>+61 412 908 774</b><span>Prefers Thursday appointments · site: Sumeru</span></div></div>
        <div class="row"><div class="ic b">${ico('book',15)}</div><div class="bd">
          <b>+91 98490 11223</b><span>Plant supervisor · escalate RO faults immediately</span></div></div>
        <div class="row"><div class="ic b">${ico('book',15)}</div><div class="bd">
          <b>+61 401 553 210</b><span>Asked about PLC pricing twice · no quote sent yet</span></div></div>
      </div>
      <div class="note info" style="margin-top:12px">${ico('bolt',16)}
        <span>Memory is written after a call ends, so it never adds latency to a live turn.</span></div>
    </div></div>`;

PAGES.trunks = () => `
  <div class="page-head"><div><h2>SIP Trunks</h2><p>Carrier connections handled by <span class="mono">livekit-sip</span>. A trunk must register before calls route.</p></div>
    <span class="spacer"></span><button class="btn">${ico('plus',16)} Add trunk</button></div>
  ${table([['Trunk'],['Carrier'],['Direction'],['Address'],['State']],
    (LIVE.trunks ? LIVE.trunks.map(t=>[t.name,t.carrier,t.direction,t.address,t.state]) : D.trunks).map(t=>`<tr><td class="mono t-main">${t[0]}</td><td>${t[1]}</td>
      <td><span class="pill mute nodot">${t[2]}</span></td><td class="mono">${t[3]}</td>
      <td><span class="pill ${t[4]==='registered'?'ok':'warn'}">${t[4]}</span></td></tr>`))}
  <div class="note" style="margin-top:14px">${ico('bell',16)}
    <span><b>tw-outbound-au is degraded.</b> Twilio returned 503 on the last two OPTIONS pings. Calls still connect, but expect retries — check the credential list in Settings → Integrations.</span></div>`;

PAGES.rules = () => `
  <div class="page-head"><div><h2>Dispatch Rules</h2><p>The first rule that matches an incoming number wins, so order matters.</p></div>
    <span class="spacer"></span><button class="btn">${ico('plus',16)} Add rule</button></div>
  ${table([['#',1],['Rule'],['Number'],['Sends to'],['When']],
    (LIVE.rules ? LIVE.rules.map(r=>[r.name,r.number,r.agent,r.schedule]) : D.rules).map((r,i)=>`<tr><td class="num">${i+1}</td><td class="t-main">${r[0]}</td>
      <td class="mono">${r[1]}</td><td>${r[2]}</td><td class="t-sub">${r[3]}</td></tr>`))}`;

PAGES.numbers = () => `
  <div class="page-head"><div><h2>Phone Numbers</h2><p>DIDs bought from your carrier and what each one currently reaches.</p></div>
    <span class="spacer"></span><button class="btn">${ico('plus',16)} Buy number</button></div>
  ${table([['Number'],['Region'],['Routes to'],['Direction']],
    (LIVE.numbers ? LIVE.numbers.map(n=>[n.e164,n.region,'—',n.direction]) : D.numbers).map(n=>`<tr><td class="mono t-main">${n[0]}</td><td>${n[1]}</td>
      <td>${n[2]}</td><td><span class="pill mute nodot">${n[3]}</span></td></tr>`))}`;

PAGES.campaigns = () => `
  <div class="page-head"><div><h2>Campaigns</h2><p>Outbound dialling lists. Pacing keeps concurrent calls under the trunk's channel limit.</p></div>
    <span class="spacer"></span><button class="btn">${ico('plus',16)} New campaign</button></div>
  <div class="grid k3" style="margin-bottom:14px">
    ${stat('Dialled today','268','','+41','up','across 1 running campaign')}
    ${stat('Connect rate','61','%','+3','up','answered within 30 s')}
    ${stat('Concurrency','8','/ 20','flat','flat','trunk channel limit')}
  </div>
  ${table([['Campaign'],['State'],['List',1],['Dialled',1],['Progress'],['Agent']],
    D.campaigns.map(c=>`<tr><td class="t-main">${c[0]}</td>
      <td><span class="pill ${c[1]==='running'?'ok':c[1]==='paused'?'warn':'mute'}">${c[1]}</span></td>
      <td class="num">${c[2]}</td><td class="num">${c[3]}</td>
      <td style="min-width:140px"><div class="meter"><i style="width:${c[4]}"></i></div>
        <span class="t-sub mono">${c[4]}</span></td>
      <td>${c[5]}</td></tr>`))}`;

PAGES.tester = () => `
  <div class="page-head"><div><h2>Agent Tester</h2><p>Join a room from this browser and talk to an agent before you point a phone number at it.</p></div>
    <span class="spacer"></span><button class="btn">${ico('play',16)} Start session</button></div>
  <div class="split">
    <div class="card lift">
      ${head('Live session','not connected','<span class="pill mute">idle</span>')}
      <div style="display:grid;place-items:center;gap:14px;padding:38px 16px;background:var(--sunken);
        border-radius:var(--r-m);border:1px dashed var(--line)">
        <div style="width:84px;height:84px;border-radius:50%;background:var(--brand-wash);color:var(--brand);
          display:grid;place-items:center">${ico('robot',36)}</div>
        <div style="text-align:center;max-width:42ch">
          <b style="font-family:var(--f-display);font-size:15px">Aetos Receptionist is ready</b>
          <div class="t-sub" style="margin-top:4px">Pick voice or text, then start. The browser joins the same LiveKit room a real caller would.</div>
        </div>
        <div class="seg"><button class="on">Voice</button><button>Text</button></div>
      </div>
      <div class="grid k3" style="margin-top:14px">
        ${stat('TTFB','—','ms','idle','flat','first audio out')}
        ${stat('ASR delay','—','ms','idle','flat','speech recognised')}
        ${stat('Turns','0','','idle','flat','this session')}
      </div>
    </div>
    <div class="card">${head('Session setup')}
      <div class="mrow"><span class="nm">Agent</span><span class="vl mono">aetos-receptionist</span></div>
      <div class="mrow"><span class="nm">Microphone</span><span class="vl mono">default</span></div>
      <div class="mrow"><span class="nm">Noise suppression</span><span class="vl mono">WebRTC APM</span></div>
      <div class="mrow"><span class="nm">Turn detection</span><span class="vl mono">local · audio v1-mini</span></div>
      <div class="note info" style="margin-top:6px">${ico('bolt',16)}
        <span>Tester sessions are free of carrier cost but still bill LLM, STT and TTS usage.</span></div>
    </div></div>`;

PAGES.simulation = () => `
  <div class="page-head"><div><h2>Simulation</h2><p>Scripted personas call the agent on a schedule and a judge model scores each run out of 5.</p></div>
    <span class="spacer"></span><button class="btn ghost">New suite</button>
    <button class="btn">${ico('play',16)} Run suite</button></div>
  <div class="grid k4" style="margin-bottom:14px">
    ${stat('Suite score','4.1','/ 5','+0.3','up','last run 2 h ago')}
    ${stat('Tests passing','4','/ 5','flat','flat','barge-in still failing')}
    ${stat('Median turns','7.6','','−0.8','up','shorter conversations')}
    ${stat('Run cost','$0.42','','+0.05','down','5 tests, 38 turns')}
  </div>
  <div class="split">
    <div class="card">${head('Latest run','Reception regression · 5 tests')}
      ${table([['Persona'],['Result'],['Score',1],['Length',1]],
        D.sims.map(s=>`<tr><td class="t-main">${s[0]}</td>
          <td><span class="pill ${s[1]==='passed'?'ok':'crit'}">${s[1]}</span></td>
          <td class="num">${s[2].toFixed(1)}</td><td class="num">${s[3]}</td></tr>`))}</div>
    <div class="card">${head('Score history','last 8 runs')}
      ${area([3.4,3.6,3.5,3.8,3.7,4.0,3.9,4.1],{h:150,labels:['8 runs ago','','now'],stroke:'var(--brand)'})}
      <div class="note" style="margin-top:12px">${ico('bell',16)}
        <span><b>Barge-in has failed three runs running.</b> The agent keeps speaking for ~600 ms after the caller starts. Try lowering the interruption threshold on the agent's Advanced tab.</span></div>
    </div></div>`;

PAGES.autoresearch = () => `
  <div class="page-head"><div><h2>AutoResearch</h2><p>DSPy reads your real transcripts, proposes prompt rewrites, and scores them against the same simulation suite.</p></div>
    <span class="spacer"></span><button class="btn">${ico('flask',16)} Start optimisation</button></div>
  <div class="grid k3" style="margin-bottom:14px">
    ${stat('Candidates tried','24','','+24','up','this optimisation run')}
    ${stat('Best score','4.4','/ 5','+0.3','up','vs. 4.1 for the live prompt')}
    ${stat('Tokens spent','1.28','M','+1.28M','down','≈ $2.10 on GPT-4o mini')}
  </div>
  <div class="card">${head('Candidate prompts','sorted by judge score')}
    ${table([['#',1],['Change'],['Score',1],['Δ',1],['']],
      [[1,'Adds an explicit "confirm the date back to the caller" step',4.4,'+0.3'],
       [2,'Shortens the greeting to one sentence',4.3,'+0.2'],
       [3,'Moves the pricing rules above the booking rules',4.2,'+0.1'],
       [4,'Adds three few-shot examples of transfers',4.0,'−0.1']]
      .map(r=>`<tr><td class="num">${r[0]}</td><td>${r[1]}</td><td class="num">${r[2].toFixed(1)}</td>
        <td class="num"><span class="trend ${r[3][0]==='+'?'up':'down'}">${r[3]}</span></td>
        <td style="text-align:right"><button class="btn ghost">Preview diff</button></td></tr>`))}</div>`;

PAGES.implab = () => `
  <div class="page-head"><div><h2>Improvement Lab</h2><p>Real calls, scored against your rubric, with the prompt revision that came out of each review.</p></div>
    <span class="spacer"></span><button class="btn ghost">Edit rubric</button></div>
  <div class="split">
    <div class="card">${head('Scored calls','last 24 h')}
      ${table([['Call'],['Agent'],['Score',1],['Weakest criterion']],
        [['call-_5xQ81','Aetos Receptionist',4.7,'—'],
         ['call-_3kP9','Aetos Receptionist',2.4,'Recovered poorly from a TTS failure'],
         ['call-_7zMp0','Sumeru Plant Ops',4.1,'Did not confirm the ticket number'],
         ['call-_2bR4','After-Hours Triage',3.2,'Transferred without explaining why']]
        .map(r=>`<tr><td class="mono t-main">${r[0]}</td><td>${r[1]}</td>
          <td class="num"><span class="pill ${r[2]>=4?'ok':r[2]>=3?'warn':'crit'} nodot">${r[2].toFixed(1)}</span></td>
          <td class="t-sub">${r[3]}</td></tr>`))}</div>
    <div class="card">${head('Rubric weights')}
      ${[['Resolved the caller\'s actual request',35],['Confirmed details back',20],
         ['Stayed inside scope',20],['Recovered from errors',15],['Tone and pacing',10]]
        .map(([n,v])=>`<div class="mrow"><span class="nm">${n}</span><span class="vl">${v}%</span>
          <div class="meter"><i style="width:${v*2.5}%"></i></div></div>`).join('')}
    </div></div>`;

PAGES.components = () => {
  const kindPill = k => (k||'').startsWith('provider')?'vio':k==='core'||k==='worker'?'ok':'mute';
  const comps = LIVE.components ? LIVE.components.map(c=>[c.name,c.kind,c.health.engine||c.version,
      [c.health.model||c.model,c.health.sdk].filter(Boolean).join(' · ')||'—', Object.entries(c.contracts||{}).map(([k,v])=>`${k} ${v.join('/')}`).join(' · ')||'—',
      c.health.state==='ready'?'ok':'warn', 0, c.health.rtt_ms??null, c.update_available, 'no', c.health.state, c.pid]) : D.comps;
  const store = LIVE.store ? LIVE.store.map(r=>[r.name,r.kind,r.desc,r.needs,r.installed?'installed':r.license]) : D.store;
  const gpuTotal = comps.reduce((a,c)=>a+c[6],0);
  const healthy = comps.filter(c=>c[5]==='ok').length, updates = comps.filter(c=>c[8]).length;
  return `
  <div class="page-head"><div><h2>Components</h2><p>Every container on this box — engines, models, platform services. Each one upgrades, rolls back and restarts on its own. Core is never touched by any other component's update.</p></div>
    <span class="spacer"></span>
    ${updates?`<span class="pill warn nodot">${updates} update${updates>1?'s':''} available</span>`:`<span class="pill ok nodot">all current</span>`}
    <button class="btn ghost">${ico('report',16)} Backup all</button>
    <button class="btn">${ico('bolt',16)} Update all safe</button></div>
  <div class="grid k4" style="margin-bottom:14px">
    ${stat('Components',String(comps.length),'',`${healthy} healthy`,healthy===comps.length?'up':'down',`${comps.length-healthy} not running`)}
    ${stat('GPU memory',gpuTotal?(gpuTotal/1024).toFixed(1):'0','GB',gpuTotal?'resident':'no GPU','flat',gpuTotal?'engines warm':'CPU engines only on this box')}
    ${stat('Provider RTT',(()=>{const r=comps.map(c=>c[7]).filter(v=>v!=null);return r.length?Math.max(...r).toFixed(0):'—'})(),'ms','worst','flat','unix socket round trip from supervisor')}
    ${stat('Core contract','v1','','N and N-1','flat','core-api 1 · provider-api 1 · events 1')}
  </div>
  <div class="tabs" id="setTabs"><button class="on">Installed</button><button>Store</button><button>Updates</button><button>Logs</button></div>
  ${table([['Component'],['Kind'],['Engine',1],['Model / config'],['Contract'],['GPU',1],['RTT',1],['Health'],['']],
    comps.map(c=>`<tr>
      <td class="mono t-main">${c[0]}</td>
      <td><span class="pill ${kindPill(c[1])} nodot">${c[1]}</span></td>
      <td class="num">${c[2]}${c[8]?` <span class="trend up" title="update available">→ ${c[8]}</span>`:''}</td>
      <td class="t-sub">${c[3]}</td>
      <td class="mono t-sub">${c[4]}</td>
      <td class="num">${c[6]?(c[6]/1024).toFixed(1)+' GB':'—'}</td>
      <td class="num">${c[7]==null?'—':`<span class="pill ${c[7]>120?'crit':c[7]>60?'warn':'ok'} nodot">${c[7]} ms</span>`}</td>
      <td><span class="pill ${c[5]}">${c[10]||(c[5]==='ok'?'healthy':'degraded')}</span></td>
      <td style="text-align:right;white-space:nowrap">
        ${c[8]?`<button class="btn" style="padding:5px 10px" data-comp="${c[0]}" data-act="upgrade">Update</button> `:''}
        ${c[10]==='down'&&LIVE.components?`<button class="btn ghost" style="padding:5px 10px" data-comp="${c[0]}" data-act="start">Start</button>`:
          c[1]==='supervisor'?'':`<button class="btn ghost" style="padding:5px 10px" data-comp="${c[0]}" data-act="${c[1]==='core'?'restart':'rollback'}">${c[1]==='core'?'Restart':'Rollback'}</button>`}</td></tr>`))}
  <div class="split" style="margin-top:14px">
    <div class="card">${head('Store','engines and add-ons you can install — filtered by licence and free GPU memory')}
      ${table([['Add-on'],['Kind'],['What it is'],['Needs'],['']],
        store.map(r=>`<tr><td class="mono t-main">${r[0]}</td>
          <td><span class="pill ${kindPill(r[1])} nodot">${r[1]}</span></td>
          <td>${r[2]}</td><td class="t-sub mono">${r[3]}</td>
          <td style="text-align:right"><button class="btn ghost" style="padding:5px 10px" ${r[4]==='installed'?'disabled':''}>${r[4]==='installed'?'Installed':r[4]==='pro'?'Pro licence':'Install'}</button></td></tr>`))}</div>
    <div class="card">${head('Upgrade tts-cartesia 4.2.0 → 4.3.0','what will happen')}
      <div class="rows">
        ${[['Pull image + verify signature','ok'],['Check contracts against core (provider-api 1) — compatible','ok'],
           ['Start 4.3.0 beside 4.2.0 on a temp socket','mute'],['Health: ready within 30 s, one warm synth','mute'],
           ['Repoint socket — new sessions use 4.3.0','mute'],['Drain 4.2.0 after last stream (max 10 min)','mute'],
           ['Keep 4.2.0 image for instant rollback','mute']].map(([t,k],i)=>`
          <div class="row"><div class="ic ${k==='ok'?'b':''}">${i+1}</div>
            <div class="bd"><b style="font-weight:500">${t}</b></div></div>`).join('')}
      </div>
      <div class="note info" style="margin-top:12px">${ico('bolt',16)}
        <span><b>Core is not restarted.</b> Live calls on 4.2.0 finish normally; the console stays up throughout.</span></div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn">${ico('play',16)} Run upgrade</button>
        <button class="btn ghost">Schedule for 02:00</button></div>
    </div></div>`;
};

PAGES.settings = () => {
  const tabs = ['General','Integrations','Dependencies','Storage','Security','System','Licensing'];
  return `
  <div class="page-head"><div><h2>Settings</h2><p>Everything the old console buried in one 1.6 MB page. Each tab loads on demand.</p></div>
    <span class="spacer"></span><span class="pill ok">v1.39.0 — up to date</span></div>
  <div class="tabs" id="setTabs">${tabs.map((t,i)=>`<button class="${i?'':'on'}">${t}</button>`).join('')}</div>
  <div class="split">
    <div class="card">${head('Providers','keys are stored in Redis, never in the page')}
      ${table([['Provider'],['Used for'],['Key'],['State']],
        [['OpenAI','LLM + Whisper STT','sk-…8f2a','ok'],
         ['Deepgram','STT — Nova-3','dg-…41c7','ok'],
         ['Cartesia','TTS — Sonic 3','ct-…9b03','ok'],
         ['ElevenLabs','TTS — Flash v2.5','el-…2d61','ok'],
         ['Anthropic','LLM — Claude Haiku 4.5','sk-ant-…77e1','ok'],
         ['Twilio','SIP + SMS','AC…4d9f','warn'],
         ['Telnyx','SIP + SMS','KEY…0a12','ok']]
        .map(r=>`<tr><td class="t-main">${r[0]}</td><td>${r[1]}</td><td class="mono t-sub">${r[2]}</td>
          <td><span class="pill ${r[3]}">${r[3]==='ok'?'verified':'check key'}</span></td></tr>`))}</div>
    <div class="card">${head('This server')}
      <div class="mrow"><span class="nm">Dashboard URL</span><span class="vl mono">vaai.aetosiot.com</span></div>
      <div class="mrow"><span class="nm">LiveKit / SIP</span><span class="vl mono">lk.aetosiot.com</span></div>
      <div class="mrow"><span class="nm">LiveKit server</span><span class="vl mono">1.13.6</span></div>
      <div class="mrow"><span class="nm">Agent runtime</span><span class="vl mono">livekit-agents 1.8.0</span></div>
      <div class="mrow"><span class="nm">Timezone</span><span class="vl mono">Australia/Sydney</span></div>
      <div class="mrow"><span class="nm">Core API</span><span class="vl mono">core-api v1 · events v1</span></div>
    </div></div>`;
};

PAGES.guide = () => `
  <div class="page-head"><div><h2>User Guide</h2><p>What each screen is for, in the order you would normally set the console up.</p></div></div>
  <div class="grid k2">
    ${[['Start here','Add your provider keys under Settings → Integrations, then build one voice agent. Nothing else works until an LLM, an STT and a TTS key are verified.','gear'],
       ['Give the agent a phone number','Buy a DID, point a SIP trunk at it, then write a dispatch rule. The first matching rule wins, so keep the after-hours rule below the business-hours one.','phone'],
       ['Teach it what it needs to know','Create a Qdrant collection, upload your documents, and assign the collection to the agent. Search runs mid-call, so keep chunks small.','book'],
       ['Test before you ship','Agent Tester for a quick conversation; Simulation for the same five personas every time; AutoResearch when you want the prompt rewritten for you.','play'],
       ['Watch it run','Analytics for the shape of the day, Call History for any individual call, Improvement Lab when a call went badly and you want to know why.','gauge'],
       ['Keep it alive','Settings → System shows every service and its memory cap. Storage controls how long calls stay in Redis before they move to S3.','cpu']]
      .map(([t,b,i])=>`<div class="card"><div class="row" style="border:0;padding:0">
        <div class="ic b">${ico(i,16)}</div><div class="bd"><b style="font-size:14px">${t}</b></div></div>
        <p style="margin:10px 0 0;color:var(--ink-2);font-size:13px;max-width:60ch">${b}</p></div>`).join('')}
  </div>`;

/* ---------------- shell render ---------------- */
const $ = s => document.querySelector(s);

function buildRail() {
  return NAV.map(([grp, items]) => `
    <div class="nav-group"><div class="nav-group-label">${grp}</div>
      ${items.map(([id,label,icon,,count]) => `
        <a href="#${id}" data-r="${id}" title="${label}">${ico(icon)}<span>${label}</span>
          ${count?`<span class="count">${count}</span>`:''}</a>`).join('')}
    </div>`).join('');
}

function paint() {
  const id = (location.hash.slice(1) || 'overview');
  const r = ROUTES[id] || ROUTES.overview;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r.id));
  $('#crumbTitle').textContent = r.grp;
  $('#crumbSub').textContent = r.sub;
  $('#view').innerHTML = (PAGES[r.id] || PAGES.overview)();
  document.title = r.label + ' — Aetos Voice Console';
  document.body.classList.remove('drawer');
  window.scrollTo({top:0});
  $('#view').onclick = async e => {
    const b = e.target.closest('button[data-act]'); if (!b || !API.isLive()) return;
    b.disabled = true; b.textContent = '…';
    try {
      if (b.dataset.comp) await API.post(`/api/v1/components/${b.dataset.comp}/${b.dataset.act}`);
      else if (b.dataset.id) await API.post(`/api/v1/agents/${b.dataset.id}/${b.dataset.act}`);
      await refreshLive(); paint();
    } catch (err) { b.textContent = 'failed'; console.warn(err); }
  };
  const tabs = $('#setTabs');
  if (tabs) tabs.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target));
  });
}

/* command palette */
function palette() {
  const scrim = $('#pal'), input = $('#palInput'), res = $('#palRes');
  const items = Object.values(ROUTES);
  const draw = q => {
    const list = items.filter(i => (i.label+' '+i.grp+' '+i.sub).toLowerCase().includes(q.toLowerCase()));
    res.innerHTML = list.length ? list.map((i,n) => `
      <a href="#${i.id}" class="${n?'':'cur'}">${ico(i.icon,16)}${i.label}<span class="grp">${i.grp}</span></a>`).join('')
      : `<div style="padding:18px;color:var(--ink-3);font-size:13px">Nothing matches “${q}”. Try an agent name, “trunk”, or “storage”.</div>`;
  };
  const open = () => { scrim.hidden = false; input.value=''; draw(''); input.focus(); };
  const close = () => { scrim.hidden = true; };
  $('#searchBtn').addEventListener('click', open);
  scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
  res.addEventListener('click', close);
  input.addEventListener('input', () => draw(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const a = res.querySelector('a'); if (a) { location.hash = a.getAttribute('href'); close(); } }
    if (e.key === 'Escape') close();
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); scrim.hidden ? open() : close(); }
    if (e.key === 'Escape') close();
  });
}

/* theme */
function theme() {
  let saved = null;
  try { saved = localStorage.getItem('aetos-theme'); } catch (_) {}
  if (saved) document.documentElement.dataset.theme = saved;
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('aetos-theme', next); } catch (_) {}
    paintThemeIcon();
  });
  paintThemeIcon();
}
function paintThemeIcon() {
  const dark = (document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  $('#themeBtn').innerHTML = ico(dark ? 'sun' : 'moon');
  $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

/* boot */
document.addEventListener('DOMContentLoaded', () => {
  $('#nav').innerHTML = buildRail();
  $('#menuBtn').innerHTML = ico('menu');
  $('#panelBtn').innerHTML = ico('panel');
  $('#bellBtn').innerHTML = ico('bell');
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('drawer'));
  $('#panelBtn').addEventListener('click', () => document.body.classList.toggle('rail-min'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('drawer'));
  theme(); palette();
  addEventListener('hashchange', paint);
  paint();
  refreshLive().then(ok => {
    const pill = document.querySelector('.live span:last-child');
    if (pill) pill.textContent = ok ? 'live · core-api v1' : 'sample data';
    if (!ok) document.querySelector('.live').style.background = 'var(--warn-wash)';
    if (ok) { paint(); setInterval(async () => { await refreshLive(); if (!document.querySelector('#palInput:focus')) paint(); }, 15000); }
  });
});
})();
