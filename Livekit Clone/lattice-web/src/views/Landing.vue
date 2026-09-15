<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  AudioWaveform, Zap, Server, Boxes, GitBranch, Plug,
  ArrowRight, Check, Menu, X, Terminal, Cpu, Radio, Lock,
  Palette, Globe, KeyRound, Container, HardDrive, Network, FileBadge, Mail,
  Layers, BuildingComplex, EyeOff, Wrench,
  Cloud, Tag, UserPlus, Receipt, Headset, Building, Mic
} from '@lucide/vue'

const scrolled = ref(false)
const menuOpen = ref(false)

const onScroll = () => { scrolled.value = window.scrollY > 12 }

// Animated waveform bars
const bars = ref<number[]>(Array.from({ length: 44 }, (_, i) =>
  Math.max(0.12, Math.abs(Math.sin(i * 0.38) * 0.55 + Math.sin(-i * 0.17) * 0.45) * Math.sin((i / 44) * Math.PI))
))
let raf = 0
let t = 0
const animate = () => {
  t += 0.045
  bars.value = bars.value.map((_, i) => {
    const a = Math.sin(t * 1.7 + i * 0.38)
    const b = Math.sin(t * 0.9 - i * 0.17)
    const env = Math.sin((i / bars.value.length) * Math.PI)
    return Math.max(0.08, Math.abs(a * 0.55 + b * 0.45) * env)
  })
  raf = requestAnimationFrame(animate)
}

// Count-up stats
// Seeded at their final values so the numbers are correct even if the count-up
// never runs (frozen rAF in a background tab); runCounters replays them from 0.
const stats = ref([
  { label: 'Turn latency', target: 450, suffix: 'ms', value: 450 },
  { label: 'Concurrent sessions', target: 12, suffix: 'k', value: 12 },
  { label: 'Provider plugins', target: 28, suffix: '', value: 28 },
  { label: 'Uptime', target: 99.98, suffix: '%', value: 99.98, decimals: 2 }
])

let cleanup: (() => void) | null = null
let revealCleanup: (() => void) | null = null

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  raf = requestAnimationFrame(animate)

  // Scroll reveal, opt-in only. Content renders visible by default; we add the
  // hidden start state solely when the page is actually being painted and the
  // user has not asked for reduced motion. Every element is released again by a
  // setTimeout (which still fires when throttled), so nothing can stay hidden.
  const motionOk = !document.hidden &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (motionOk) {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    targets.forEach((el) => el.classList.add('pre'))

    // Dropping .pre entirely is what makes an element visible. .in only adds
    // the transition on the way there — so if the transition never runs (the
    // tab is backgrounded mid-flight, and Chrome freezes it), the element still
    // ends up visible instead of stuck at opacity 0.
    const settle = (el: Element) => el.classList.remove('pre')
    const release = (el: Element) => {
      if (el.classList.contains('in')) return
      el.classList.add('in')
      setTimeout(() => settle(el), 900)   // after the transition would finish
    }
    const inView = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.top < window.innerHeight * 0.9 && r.bottom > 0
    }

    requestAnimationFrame(() => targets.forEach((el) => { if (inView(el)) release(el) }))

    const sweep = () => targets.forEach((el) => { if (inView(el)) release(el) })
    window.addEventListener('scroll', sweep, { passive: true })

    // If the page is hidden, animations are frozen — strip the hidden start
    // state immediately rather than leaving a half-finished transition.
    const onHide = () => { if (document.hidden) targets.forEach(settle) }
    document.addEventListener('visibilitychange', onHide)

    revealCleanup = () => {
      window.removeEventListener('scroll', sweep)
      document.removeEventListener('visibilitychange', onHide)
    }

    // Backstop: nothing stays hidden past 3s under any circumstance.
    setTimeout(() => targets.forEach(settle), 3000)
  }

  let counted = false
  const maybeCount = () => {
    if (counted) return
    const el = document.querySelector('.stats')
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight && r.bottom > 0) {
      counted = true
      runCounters()
      window.removeEventListener('scroll', maybeCount)
    }
  }
  window.addEventListener('scroll', maybeCount, { passive: true })
  cleanup = () => window.removeEventListener('scroll', maybeCount)
  maybeCount()
  setTimeout(() => { if (!counted) { counted = true; runCounters() } }, 2500)
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  cancelAnimationFrame(raf)
  cleanup?.()
  revealCleanup?.()
})

const runCounters = () => {
  const start = performance.now()
  const dur = 1400
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    stats.value = stats.value.map((s) => ({ ...s, value: s.target * eased }))
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const fmt = (s: any) => s.decimals ? s.value.toFixed(s.decimals) : Math.round(s.value).toString()

const features = [
  { icon: Boxes, title: 'Modular by design', body: 'STT, TTS and LLM are independent, versioned services. Swap any one without touching the rest of the stack.', tag: 'Architecture' },
  { icon: Zap, title: 'Sub-500ms turns', body: 'Streaming end to end. Partial transcripts feed the model before the caller finishes speaking.', tag: 'Latency' },
  { icon: Server, title: 'Runs on your metal', body: 'Kubernetes, Compose or a single box. No egress to a vendor, no per-minute meter running.', tag: 'Deployment' },
  { icon: GitBranch, title: 'N and N-1 support', body: 'Never a forced upgrade. Current and previous majors run side by side during migration.', tag: 'Stability' },
  { icon: Plug, title: 'Plugin contracts', body: 'Typed interfaces for custom providers and agent logic. Ship your own without forking core.', tag: 'Extensibility' },
  { icon: Lock, title: 'Private by default', body: 'Audio and transcripts stay inside your perimeter. HIPAA and GDPR deployments supported.', tag: 'Security' }
]

const pipeline = [
  { icon: Radio, label: 'Carrier / SIP', detail: 'Inbound audio' },
  { icon: Terminal, label: 'STT stream', detail: 'Partial tokens' },
  { icon: Cpu, label: 'Agent + LLM', detail: 'Tools & memory' },
  { icon: AudioWaveform, label: 'TTS out', detail: 'First byte 180ms' }
]

interface Plan {
  name: string
  price: string
  unit?: string
  note: string
  features: string[]
  cta: string
  featured: boolean
}

const plans: Plan[] = [
  {
    name: 'Cloud', price: 'Hosted', note: 'We run it, you use it',
    features: [
      'Managed and monitored by us',
      'Autoscaling workers',
      'Upgrades applied for you',
      'Regional data residency',
      '99.9% SLA'
    ],
    cta: 'Start a trial', featured: false
  },
  {
    name: 'Self-Hosted', price: 'Licensed', note: 'Annual, per deployment',
    features: [
      'Runs entirely on your hardware',
      'Unlimited agents and providers',
      'Offline licence verification',
      'Signed release channel',
      'Business-hours support'
    ],
    cta: 'Request a quote', featured: false
  },
  {
    name: 'White-Label', price: 'Reseller', note: 'Sell it as your own product',
    features: [
      'Cloud or self-hosted, your choice',
      'Full brand replacement',
      'Your domain and mail templates',
      'Per-customer tenant provisioning',
      'Wholesale pricing and margin',
      'Named solutions engineer'
    ],
    cta: 'Become a partner', featured: true
  },
  {
    name: 'Enterprise', price: 'Custom', note: 'Air-gapped or regulated',
    features: [
      'Everything in White-Label',
      'Air-gapped installation',
      'Source escrow available',
      'Custom provider development',
      'Security and compliance review',
      'Contracted SLA'
    ],
    cta: 'Contact us', featured: false
  }
]

const hosting = [
  {
    icon: Cloud, name: 'Lattice Net Cloud', tag: 'Fastest to launch',
    body: 'We operate the whole stack in our regions. You get the console, the APIs and the numbers on day one — no servers, no upgrade windows, no pager.',
    points: ['Provisioned in minutes', 'Managed upgrades and backups',
             'Regional data residency', 'Usage billed monthly']
  },
  {
    icon: Network, name: 'Private cloud', tag: 'Your account',
    body: 'The same artefacts deployed into your own AWS, Azure or GCP account. You hold the keys and the bill; we can operate it for you or hand over the runbook.',
    points: ['Your cloud account and VPC', 'Your KMS keys and buckets',
             'Terraform and Helm supplied', 'Managed or self-operated']
  },
  {
    icon: Building, name: 'On-premises', tag: 'Nothing leaves site',
    body: 'Installed in your own data centre or on a single box on the factory floor. Runs with no internet at all — licence checks, models and telephony stay local.',
    points: ['Your hardware, your racks', 'Fully air-gapped installs',
             'Local GPU inference supported', 'Offline licence verification']
  }
]

const models = [
  {
    kind: 'Speech to text', icon: Mic,
    self: ['faster-whisper (large-v3, distil)', 'NVIDIA Parakeet', 'Vosk for tiny footprints'],
    cloud: ['Deepgram', 'AssemblyAI', 'Azure Speech'],
  },
  {
    kind: 'Language model', icon: Cpu,
    self: ['vLLM — Qwen, Llama, Mistral', 'Ollama for small boxes', 'Any OpenAI-compatible server'],
    cloud: ['OpenAI', 'Anthropic', 'Google', 'Groq — via one gateway'],
  },
  {
    kind: 'Text to speech', icon: AudioWaveform,
    self: ['Piper — CPU, very fast', 'Kokoro', 'XTTS for voice cloning'],
    cloud: ['ElevenLabs', 'Cartesia', 'Azure Neural'],
  },
]

const reseller = [
  { icon: Tag, title: 'Wholesale pricing', body: 'Partner rates with margin built in. You set your own retail price and keep the difference — we never contact your customers.' },
  { icon: UserPlus, title: 'Provision in a click', body: 'Create a tenant per customer from your partner console, each with its own brand profile, subdomain, users and limits.' },
  { icon: Receipt, title: 'One bill to you', body: 'We invoice you for aggregate usage across every tenant. Your customers are billed by you, in your name, on your terms.' },
  { icon: Headset, title: 'You own the relationship', body: 'You run tier 1 support under your brand. We back you on tier 2 and 3, privately, and never appear in front of your customer.' }
]

const deploy = [
  { icon: Container, title: 'Any target', body: 'Docker Compose on one box, Kubernetes with Helm, or bare metal under systemd. Same artefacts, same versions.' },
  { icon: HardDrive, title: 'Your storage', body: 'Recordings, transcripts and vectors land in your own S3, Postgres and Qdrant. Nothing is mirrored to us.' },
  { icon: Network, title: 'Egress optional', body: 'Point at cloud providers or run STT, TTS and LLM on your GPUs. Fully air-gapped installs are supported.' },
  { icon: KeyRound, title: 'Offline licensing', body: 'A signed licence file verifies locally with a grace period. No phone-home, no kill switch, no metering callback.' },
  { icon: GitBranch, title: 'You choose upgrades', body: 'Pinned, signed releases from a private registry. Core supports N and N-1 so nothing upgrades behind your back.' },
  { icon: Wrench, title: 'Operable by your team', body: 'Prometheus metrics, OpenTelemetry traces, structured logs and a documented runbook for every service.' }
]

const whitelabel = [
  { icon: Palette, title: 'Brand tokens', body: 'Logo, wordmark, favicon, colour ramps, radii and typography are theme variables — not a fork. Your look survives every upgrade.' },
  { icon: Globe, title: 'Your domain', body: 'Console, API and docs all served from your hostnames with your TLS. No Lattice Net domain appears anywhere in the product.' },
  { icon: EyeOff, title: 'No trace of us', body: 'Product name, marks, footer credits, page titles and error pages are all yours. We do not require attribution.' },
  { icon: Mail, title: 'Mail and notifications', body: 'Transactional email, invite flows and alert templates carry your sender identity and copy.' },
  { icon: Layers, title: 'Per-tenant themes', body: 'Ship one install and give each of your customers their own brand profile, subdomain and login screen.' },
  { icon: FileBadge, title: 'Docs and SDKs', body: 'Generated API reference, CLI name and client SDK package names are renamed to match your product.' }
]
</script>

<template>
  <div class="landing">
    <div class="aurora" aria-hidden="true">
      <span class="blob b1"></span>
      <span class="blob b2"></span>
      <span class="blob b3"></span>
      <span class="grid-overlay"></span>
    </div>

    <header class="nav" :class="{ solid: scrolled }">
      <div class="wrap nav-inner">
        <router-link to="/" class="brand" aria-label="Lattice Net home">
          <img src="/logo-mark.svg" alt="" class="brand-mark" width="32" height="32" />
          <span class="brand-text">Lattice<span>Net</span></span>
        </router-link>

        <nav class="nav-links" :class="{ open: menuOpen }">
          <a href="#features" @click="menuOpen = false">Features</a>
          <a href="#hosting" @click="menuOpen = false">Deploy</a>
          <a href="#models" @click="menuOpen = false">Models</a>
          <a href="#reseller" @click="menuOpen = false">Partners</a>
          <a href="#whitelabel" @click="menuOpen = false">White-label</a>
          <a href="#pricing" @click="menuOpen = false">Pricing</a>
          <router-link to="/login" class="ghost">Sign in</router-link>
          <router-link to="/signup" class="cta">Get started <ArrowRight :size="15" :stroke-width="2.5" /></router-link>
        </nav>

        <button class="burger" @click="menuOpen = !menuOpen" aria-label="Menu">
          <component :is="menuOpen ? X : Menu" :size="20" />
        </button>
      </div>
    </header>

    <section class="hero">
      <div class="wrap hero-inner">
        <div class="hero-copy">
          <span class="pill"><span class="dot"></span> v2.4 — streaming agent runtime</span>
          <h1>Voice infrastructure<br /><em>you actually own.</em></h1>
          <p class="lede">
            A modular voice AI stack you run in our cloud or on your own hardware —
            and rebrand as your own product. Swap any provider, keep every millisecond
            and every recording where you want it.
          </p>
          <div class="hero-cta">
            <router-link to="/signup" class="btn primary">Book a demo <ArrowRight :size="17" :stroke-width="2.5" /></router-link>
            <a href="#whitelabel" class="btn ghost-btn"><Palette :size="17" :stroke-width="2.2" /> White-label it</a>
          </div>
          <div class="trust">
            <span><Cloud :size="15" /> Cloud or self-hosted</span>
            <span><Tag :size="15" /> Reseller programme</span>
            <span><KeyRound :size="15" /> Commercial licence</span>
          </div>
        </div>

        <div class="hero-visual">
          <div class="console">
            <div class="console-bar">
              <i></i><i></i><i></i>
              <span class="console-title">live-session · agt_36d20</span>
              <span class="badge-live"><span class="dot"></span> live</span>
            </div>
            <div class="wave">
              <span v-for="(b, i) in bars" :key="i" class="bar" :style="{ height: (b * 100) + '%' }"></span>
            </div>
            <div class="console-rows">
              <div class="row"><span class="k">stt.partial</span><span class="v">"book a site survey for…"</span></div>
              <div class="row"><span class="k">agent.tool</span><span class="v">calendar.find_slot()</span></div>
              <div class="row"><span class="k">tts.first_byte</span><span class="v ok">180 ms</span></div>
            </div>
          </div>
          <div class="float-card fc1"><Zap :size="15" /> 450ms turn</div>
          <div class="float-card fc2"><Boxes :size="15" /> 28 plugins</div>
        </div>
      </div>
    </section>

    <section class="stats">
      <div class="wrap stat-grid">
        <div v-for="s in stats" :key="s.label" class="stat">
          <div class="stat-num">{{ fmt(s) }}<span>{{ s.suffix }}</span></div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <section id="features" class="section">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">Why Lattice Net</span>
          <h2>Infrastructure-first, not another API key</h2>
          <p>Every layer is a service you can inspect, replace or pin. No black box between your caller and your model.</p>
        </div>
        <div class="feat-grid">
          <article v-for="(f, i) in features" :key="f.title" class="feat reveal" :style="{ '--d': i * 70 + 'ms' }">
            <span class="feat-icon"><component :is="f.icon" :size="20" :stroke-width="2.1" /></span>
            <span class="feat-tag">{{ f.tag }}</span>
            <h3>{{ f.title }}</h3>
            <p>{{ f.body }}</p>
          </article>
        </div>
      </div>
    </section>

    <section id="pipeline" class="section alt">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">The path of a turn</span>
          <h2>Four hops, under half a second</h2>
          <p>Audio streams through independently scalable stages. Each one is swappable and separately observable.</p>
        </div>
        <div class="pipe reveal">
          <div v-for="(p, i) in pipeline" :key="p.label" class="pipe-node" :style="{ '--d': i * 110 + 'ms' }">
            <span class="pipe-icon"><component :is="p.icon" :size="19" :stroke-width="2.1" /></span>
            <strong>{{ p.label }}</strong>
            <small>{{ p.detail }}</small>
            <span v-if="i < pipeline.length - 1" class="pipe-link" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    </section>

    <section id="hosting" class="section">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">Deployment</span>
          <h2>Cloud, private cloud, or on-premises</h2>
          <p>
            The same product in all three — same console, same APIs, same agents.
            Start hosted and move on-premises later, or the reverse. The licence follows you,
            and there is no re-implementation either way.
          </p>
        </div>
        <div class="host-grid">
          <article v-for="(h, i) in hosting" :key="h.name" class="host reveal"
                   :style="{ '--d': i * 90 + 'ms' }">
            <div class="host-top">
              <span class="host-icon"><component :is="h.icon" :size="22" :stroke-width="2.1" /></span>
              <span class="host-tag">{{ h.tag }}</span>
            </div>
            <h3>{{ h.name }}</h3>
            <p>{{ h.body }}</p>
            <ul>
              <li v-for="p in h.points" :key="p"><Check :size="15" :stroke-width="3" /> {{ p }}</li>
            </ul>
          </article>
        </div>
      </div>
    </section>

    <section id="models" class="section alt">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">Bring your own models</span>
          <h2>Run your own STT, LLM and TTS</h2>
          <p>
            Every model is a swappable sidecar behind one contract. Run them on your own
            GPUs for zero egress and flat cost, call a cloud provider, or mix the two —
            local by default with a cloud fallback when the GPU is saturated.
          </p>
        </div>

        <div class="model-grid">
          <article v-for="(m, i) in models" :key="m.kind" class="model reveal"
                   :style="{ '--d': i * 80 + 'ms' }">
            <header>
              <span class="model-icon"><component :is="m.icon" :size="20" :stroke-width="2.1" /></span>
              <h3>{{ m.kind }}</h3>
            </header>
            <div class="model-col">
              <span class="model-label self"><Cpu :size="13" /> Self-hosted</span>
              <ul><li v-for="x in m.self" :key="x">{{ x }}</li></ul>
            </div>
            <div class="model-col">
              <span class="model-label cloud"><Cloud :size="13" /> Or cloud</span>
              <ul><li v-for="x in m.cloud" :key="x">{{ x }}</li></ul>
            </div>
          </article>
        </div>

        <div class="spec reveal">
          <div class="spec-col">
            <h4><Cpu :size="16" /> What a GPU box gives you</h4>
            <dl>
              <div><dt>One RTX 4090</dt><dd>Roughly 6–10 concurrent fully-local sessions</dd></div>
              <div><dt>Typical stack</dt><dd>Parakeet or faster-whisper, Qwen on vLLM, Piper or Kokoro</dd></div>
              <div><dt>Cost shape</dt><dd>Fixed hardware cost instead of per-minute metering</dd></div>
              <div><dt>Egress</dt><dd>None — audio and transcripts never leave the machine</dd></div>
            </dl>
          </div>
          <div class="spec-col">
            <h4><Plug :size="16" /> How swapping works</h4>
            <dl>
              <div><dt>Contract</dt><dd>Providers speak provider-api v1 over a local socket</dd></div>
              <div><dt>Independence</dt><dd>Upgrade one model without touching Core or the others</dd></div>
              <div><dt>Per agent</dt><dd>Each agent picks its own STT, LLM and TTS</dd></div>
              <div><dt>Fallback</dt><dd>Route to cloud automatically when local capacity runs out</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section id="reseller" class="section">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">Partner programme</span>
          <h2>Resell it under your own brand</h2>
          <p>
            Put your name on it and sell it to your own customers, hosted by us or by you.
            We stay invisible — no co-branding, no attribution, no contact with your accounts.
          </p>
        </div>
        <div class="feat-grid">
          <article v-for="(r, i) in reseller" :key="r.title" class="feat reveal"
                   :style="{ '--d': i * 70 + 'ms' }">
            <span class="feat-icon alt-icon"><component :is="r.icon" :size="20" :stroke-width="2.1" /></span>
            <h3>{{ r.title }}</h3>
            <p>{{ r.body }}</p>
          </article>
        </div>
        <div class="spec reveal">
          <div class="spec-col">
            <h4><UserPlus :size="16" /> How a partner runs it</h4>
            <dl>
              <div><dt>Sign up</dt><dd>Partner agreement, wholesale rate card, brand assets supplied</dd></div>
              <div><dt>Brand it</dt><dd>Your product name, logo, palette and domain across every surface</dd></div>
              <div><dt>Onboard</dt><dd>One tenant per customer, provisioned from your partner console</dd></div>
              <div><dt>Bill</dt><dd>You invoice your customers; we invoice you once, monthly</dd></div>
            </dl>
          </div>
          <div class="spec-col">
            <h4><Headset :size="16" /> What we guarantee</h4>
            <dl>
              <div><dt>Invisibility</dt><dd>Our name appears nowhere your customers can see</dd></div>
              <div><dt>No poaching</dt><dd>We will not solicit or sell directly to your accounts</dd></div>
              <div><dt>Escalation</dt><dd>Named engineer for tier 2 and 3, under your brand</dd></div>
              <div><dt>Portability</dt><dd>Move tenants between our cloud and yours without re-licensing</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section id="selfhosted" class="section">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">On-premises &amp; self-hosted</span>
          <h2>It runs on your infrastructure, under your licence</h2>
          <p>
            Lattice Net is delivered as signed artefacts you install and operate yourself.
            There is no hosted control plane in the call path, no usage meter phoning home,
            and no dependency on us to keep your calls connected.
          </p>
        </div>
        <div class="feat-grid">
          <article v-for="(d, i) in deploy" :key="d.title" class="feat reveal" :style="{ '--d': i * 70 + 'ms' }">
            <span class="feat-icon"><component :is="d.icon" :size="20" :stroke-width="2.1" /></span>
            <h3>{{ d.title }}</h3>
            <p>{{ d.body }}</p>
          </article>
        </div>

        <div class="spec reveal">
          <div class="spec-col">
            <h4><Server :size="16" /> Reference footprint</h4>
            <dl>
              <div><dt>Single node</dt><dd>8 vCPU / 16 GB — up to ~40 concurrent sessions</dd></div>
              <div><dt>With local GPU</dt><dd>1× RTX 4090 — ~6–10 concurrent fully-local sessions</dd></div>
              <div><dt>Datastores</dt><dd>Postgres, Redis, Qdrant, S3-compatible object storage</dd></div>
              <div><dt>Ingress</dt><dd>SIP trunk or WebRTC; Caddy or nginx terminating TLS</dd></div>
            </dl>
          </div>
          <div class="spec-col">
            <h4><FileBadge :size="16" /> What licensing covers</h4>
            <dl>
              <div><dt>Model</dt><dd>Commercial subscription licence, per deployment</dd></div>
              <div><dt>Source</dt><dd>Source-available under NDA; escrow on Enterprise</dd></div>
              <div><dt>Verification</dt><dd>Signed licence file, checked offline, with grace period</dd></div>
              <div><dt>Not included</dt><dd>No Apache, MIT or other open-source grant applies</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section id="whitelabel" class="section alt">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">White-label</span>
          <h2>Ship it as your own product</h2>
          <p>
            Branding is configuration, not a fork. Replace every visible mark, point it at your
            domains, and keep taking upgrades without re-applying a single patch.
          </p>
        </div>
        <div class="feat-grid">
          <article v-for="(w, i) in whitelabel" :key="w.title" class="feat reveal" :style="{ '--d': i * 70 + 'ms' }">
            <span class="feat-icon alt-icon"><component :is="w.icon" :size="20" :stroke-width="2.1" /></span>
            <h3>{{ w.title }}</h3>
            <p>{{ w.body }}</p>
          </article>
        </div>

        <div class="spec reveal">
          <div class="spec-col">
            <h4><Palette :size="16" /> What you control</h4>
            <dl>
              <div><dt>Identity</dt><dd>Product name, logo, wordmark, favicon, login art</dd></div>
              <div><dt>Theme</dt><dd>Colour ramps, typography, radii, density, light and dark</dd></div>
              <div><dt>Surfaces</dt><dd>Console, docs, emails, error pages, CLI and SDK names</dd></div>
              <div><dt>Tenancy</dt><dd>A distinct brand profile per customer on one install</dd></div>
            </dl>
          </div>
          <div class="spec-col">
            <h4><BuildingComplex :size="16" /> Commercial terms</h4>
            <dl>
              <div><dt>Rights</dt><dd>Resell and sublicence to your end customers</dd></div>
              <div><dt>Attribution</dt><dd>None required — our marks are removed entirely</dd></div>
              <div><dt>Support</dt><dd>You own tier 1; we back you on tier 2 and 3</dd></div>
              <div><dt>Roadmap</dt><dd>Private builds and custom providers on request</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section id="pricing" class="section">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">Licensing</span>
          <h2>Priced per deployment, not per minute</h2>
          <p>Commercial licences only. Pricing scales with concurrency and rights, and is quoted per deployment.</p>
        </div>
        <div class="price-grid">
          <article v-for="(p, i) in plans" :key="p.name" class="plan reveal" :class="{ featured: p.featured }" :style="{ '--d': i * 90 + 'ms' }">
            <span v-if="p.featured" class="plan-badge">Most popular</span>
            <h3>{{ p.name }}</h3>
            <div class="plan-price">{{ p.price }}<span v-if="p.unit">{{ p.unit }}</span></div>
            <p class="plan-note">{{ p.note }}</p>
            <ul>
              <li v-for="f in p.features" :key="f"><Check :size="15" :stroke-width="3" /> {{ f }}</li>
            </ul>
            <router-link to="/signup" class="btn" :class="p.featured ? 'primary' : 'outline'">{{ p.cta }}</router-link>
          </article>
        </div>
      </div>
    </section>

    <section id="docs" class="section alt">
      <div class="wrap cta-band reveal">
        <div>
          <h2>See it running on your own stack</h2>
          <p>We will walk through a deployment on your infrastructure, under your brand, and scope the licence to your concurrency.</p>
        </div>
        <div class="cta-actions">
          <router-link to="/signup" class="btn primary">Book a demo <ArrowRight :size="17" :stroke-width="2.5" /></router-link>
          <a href="#selfhosted" class="btn outline"><FileBadge :size="17" /> Licensing details</a>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div class="wrap foot-inner">
        <div class="foot-brand">
          <span class="brand">
            <img src="/logo-mark.svg" alt="" class="brand-mark" width="32" height="32" />
            <span class="brand-text">Lattice<span>Net</span></span>
          </span>
          <p>Modular voice infrastructure for teams who want to own their stack.</p>
        </div>
        <div class="foot-col"><h4>Product</h4><a href="#features">Features</a><a href="#pipeline">Pipeline</a><a href="#hosting">Cloud</a><a href="#selfhosted">On-premises</a></div>
        <div class="foot-col"><h4>Commercial</h4><a href="#reseller">Partner programme</a><a href="#whitelabel">White-label</a><a href="#pricing">Pricing</a><a href="#docs">Book a demo</a></div>
        <div class="foot-col"><h4>Company</h4><a href="#">About</a><a href="#">Security</a><a href="#">Contact</a></div>
      </div>
      <div class="wrap foot-bottom"><span>© 2026 Lattice Net — Aetos Tech Labs</span><span>Commercial licence — all rights reserved</span></div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  --bg: #07080d;
  --panel: rgba(255, 255, 255, 0.035);
  --line: rgba(255, 255, 255, 0.09);
  --line-2: rgba(255, 255, 255, 0.16);
  --txt: #f2f4f8;
  --mut: #9aa2b4;
  --acc: #6d5efc;
  --acc-2: #22d3ee;
  --acc-3: #f472b6;
  position: relative;
  min-height: 100vh;
  background: var(--bg);
  color: var(--txt);
  overflow-x: hidden;
  font-feature-settings: 'cv02', 'cv03', 'ss01';
}

.wrap { width: min(1180px, 100% - 3rem); margin-inline: auto; }

/* ---------- aurora background ---------- */
.aurora { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.42; }
.b1 { width: 620px; height: 620px; top: -220px; left: -120px; background: radial-gradient(circle, #6d5efc, transparent 70%); animation: drift1 22s ease-in-out infinite; }
.b2 { width: 540px; height: 540px; top: 4%; right: -160px; background: radial-gradient(circle, #22d3ee, transparent 70%); animation: drift2 26s ease-in-out infinite; }
.b3 { width: 520px; height: 520px; top: 52%; left: 32%; background: radial-gradient(circle, #f472b6, transparent 70%); opacity: 0.22; animation: drift3 30s ease-in-out infinite; }
.grid-overlay {
  position: absolute; inset: 0;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 62px 62px;
  mask-image: radial-gradient(ellipse 85% 55% at 50% 0%, #000 35%, transparent 78%);
  opacity: 0.5;
}
@keyframes drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(90px,70px) scale(1.14); } }
@keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-80px,60px) scale(1.1); } }
@keyframes drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px,-70px) scale(1.18); } }

/* ---------- nav ---------- */
.nav { position: sticky; top: 0; z-index: 50; transition: background .35s, border-color .35s, backdrop-filter .35s; border-bottom: 1px solid transparent; }
.nav.solid { background: rgba(7,8,13,.76); backdrop-filter: blur(16px) saturate(160%); border-bottom-color: var(--line); }
.nav-inner { display: flex; align-items: center; justify-content: space-between; height: 68px; }

.brand { display: inline-flex; align-items: center; gap: .6rem; text-decoration: none; color: var(--txt); }
.brand-mark {
  width: 32px; height: 32px; border-radius: 9px; display: block; flex-shrink: 0;
  box-shadow: 0 6px 20px rgba(109,94,252,.45);
}
.brand-text { font-weight: 700; font-size: 1.06rem; letter-spacing: -.02em; }
.brand-text span { background: linear-gradient(90deg, var(--acc-2), var(--acc-3)); -webkit-background-clip: text; background-clip: text; color: transparent; }

.nav-links { display: flex; align-items: center; gap: 1.9rem; }
.nav-links a { color: var(--mut); text-decoration: none; font-size: .9rem; font-weight: 500; transition: color .2s; }
.nav-links a:hover { color: var(--txt); }
.nav-links .ghost { color: var(--txt); }
.nav-links .cta {
  display: inline-flex; align-items: center; gap: .4rem; padding: .55rem 1rem; border-radius: 9px;
  background: linear-gradient(135deg, var(--acc), #8b7cff); color: #fff; font-weight: 600;
  box-shadow: 0 6px 20px rgba(109,94,252,.4); transition: transform .2s, box-shadow .2s;
}
.nav-links .cta:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(109,94,252,.55); color: #fff; }
.burger { display: none; background: none; border: 0; color: var(--txt); }

/* ---------- hero ---------- */
.hero { position: relative; z-index: 1; padding: 5.5rem 0 4rem; }
.hero-inner { display: grid; grid-template-columns: 1.05fr .95fr; gap: 3.5rem; align-items: center; }

.pill {
  display: inline-flex; align-items: center; gap: .5rem; padding: .35rem .8rem; border-radius: 999px;
  border: 1px solid var(--line-2); background: var(--panel); color: var(--mut);
  font-size: .78rem; font-weight: 500; margin-bottom: 1.4rem;
}
.pill .dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,.18); animation: pulse 2s infinite; }
@keyframes pulse { 50% { opacity: .45; } }

.hero h1 { font-size: clamp(2.6rem, 5.4vw, 4rem); line-height: 1.04; letter-spacing: -.035em; font-weight: 800; margin-bottom: 1.15rem; }
.hero h1 em {
  font-style: normal;
  background: linear-gradient(100deg, var(--acc-2) 0%, var(--acc) 48%, var(--acc-3) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.lede { color: var(--mut); font-size: 1.07rem; line-height: 1.65; max-width: 34rem; margin-bottom: 2rem; }

.hero-cta { display: flex; gap: .8rem; flex-wrap: wrap; margin-bottom: 2.1rem; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
  padding: .78rem 1.35rem; border-radius: 11px; font-weight: 600; font-size: .94rem;
  text-decoration: none; border: 1px solid transparent; cursor: pointer;
  transition: transform .2s, box-shadow .2s, background .2s, border-color .2s;
}
.btn.primary { background: linear-gradient(135deg, var(--acc), #8b7cff); color: #fff; box-shadow: 0 8px 26px rgba(109,94,252,.42); }
.btn.primary:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(109,94,252,.58); }
.btn.ghost-btn, .btn.outline { background: var(--panel); border-color: var(--line-2); color: var(--txt); }
.btn.ghost-btn:hover, .btn.outline:hover { background: rgba(255,255,255,.08); transform: translateY(-2px); }

.trust { display: flex; gap: 1.5rem; flex-wrap: wrap; color: var(--mut); font-size: .84rem; }
.trust span { display: inline-flex; align-items: center; gap: .4rem; }
</style>

<style scoped>
/* ---------- hero console ---------- */
.hero-visual { position: relative; }
.console {
  position: relative; border-radius: 18px; overflow: hidden;
  border: 1px solid var(--line-2);
  background: linear-gradient(160deg, rgba(23,26,38,.92), rgba(12,14,22,.92));
  box-shadow: 0 30px 70px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.07);
  backdrop-filter: blur(8px);
  animation: floaty 7s ease-in-out infinite;
}
@keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-11px); } }

.console-bar { display: flex; align-items: center; gap: .45rem; padding: .8rem 1rem; border-bottom: 1px solid var(--line); }
.console-bar i { width: 10px; height: 10px; border-radius: 50%; background: #3a4052; }
.console-bar i:first-child { background: #ff5f57; }
.console-bar i:nth-child(2) { background: #febc2e; }
.console-bar i:nth-child(3) { background: #28c840; }
.console-title { margin-left: .6rem; font-size: .76rem; color: var(--mut); font-family: 'JetBrains Mono', ui-monospace, monospace; }
.badge-live { margin-left: auto; display: inline-flex; align-items: center; gap: .35rem; font-size: .7rem; color: #34d399; padding: .2rem .5rem; border-radius: 999px; background: rgba(52,211,153,.12); }
.badge-live .dot { width: 5px; height: 5px; border-radius: 50%; background: #34d399; animation: pulse 1.6s infinite; }

.wave { display: flex; align-items: flex-end; gap: 3px; height: 132px; padding: 1.3rem 1rem; }
.bar { flex: 1; border-radius: 3px; background: linear-gradient(180deg, var(--acc-2), var(--acc)); min-height: 4px; transition: height .08s linear; opacity: .92; }

.console-rows { border-top: 1px solid var(--line); padding: .4rem 0; }
.row { display: flex; gap: .8rem; padding: .5rem 1rem; font-size: .79rem; font-family: 'JetBrains Mono', ui-monospace, monospace; }
.row .k { color: var(--acc-2); min-width: 8.6rem; }
.row .v { color: var(--mut); }
.row .v.ok { color: #34d399; }

.float-card {
  position: absolute; display: inline-flex; align-items: center; gap: .4rem;
  padding: .5rem .8rem; border-radius: 10px; font-size: .8rem; font-weight: 600;
  background: rgba(20,22,32,.9); border: 1px solid var(--line-2); backdrop-filter: blur(10px);
  box-shadow: 0 12px 30px rgba(0,0,0,.45);
}
.fc1 { top: 8%; left: -34px; color: #fbbf24; animation: floaty 6s ease-in-out infinite .6s; }
.fc2 { bottom: 12%; right: -28px; color: var(--acc-2); animation: floaty 6.5s ease-in-out infinite 1.2s; }

/* ---------- stats ---------- */
.stats { position: relative; z-index: 1; padding: 2.5rem 0; }
.stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: var(--line); border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
}
.stat { background: rgba(12,14,22,.72); padding: 1.6rem 1.4rem; backdrop-filter: blur(6px); }
.stat-num { font-size: 2rem; font-weight: 800; letter-spacing: -.03em; font-family: 'JetBrains Mono', ui-monospace, monospace;
  background: linear-gradient(120deg, #fff, var(--acc-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stat-num span { font-size: 1.1rem; }
.stat-label { color: var(--mut); font-size: .84rem; margin-top: .3rem; }

/* ---------- sections ---------- */
.section { position: relative; z-index: 1; padding: 5.5rem 0; }
.section.alt { background: linear-gradient(180deg, transparent, rgba(255,255,255,.022), transparent); }
.head { max-width: 40rem; margin-bottom: 3rem; }
.eyebrow { display: inline-block; color: var(--acc-2); font-size: .8rem; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; margin-bottom: .8rem; }
.head h2 { font-size: clamp(1.9rem, 3.4vw, 2.6rem); letter-spacing: -.03em; font-weight: 800; margin-bottom: .85rem; line-height: 1.12; }
.head p { color: var(--mut); font-size: 1.02rem; line-height: 1.65; }

/* Progressive enhancement: .reveal is fully visible by default. JS only adds
   .pre (the hidden start state) when the page is actually being rendered, so a
   frozen animation engine — background tab, reduced motion, no JS — can never
   leave content stuck at opacity 0. */
.reveal.pre { opacity: 0; transform: translateY(26px); }
.reveal.pre.in {
  opacity: 1; transform: none;
  transition: opacity .6s cubic-bezier(.2,.7,.3,1) var(--d, 0ms),
              transform .6s cubic-bezier(.2,.7,.3,1) var(--d, 0ms);
}

/* ---------- features ---------- */
.feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.1rem; }
.feat {
  position: relative; padding: 1.7rem; border-radius: 16px;
  border: 1px solid var(--line); background: var(--panel); backdrop-filter: blur(6px);
  transition: transform .3s, border-color .3s, background .3s, box-shadow .3s;
  overflow: hidden;
}
.feat::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(420px circle at 50% -20%, rgba(109,94,252,.22), transparent 62%);
  opacity: 0; transition: opacity .35s;
}
.feat:hover { transform: translateY(-5px); border-color: var(--line-2); background: rgba(255,255,255,.058); box-shadow: 0 20px 44px rgba(0,0,0,.42); }
.feat:hover::before { opacity: 1; }
.feat > * { position: relative; }
.feat-icon {
  display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; margin-bottom: 1.1rem;
  background: linear-gradient(135deg, rgba(109,94,252,.28), rgba(34,211,238,.18));
  border: 1px solid var(--line-2); color: var(--acc-2);
}
.feat-tag { display: inline-block; font-size: .68rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--acc); margin-bottom: .5rem; }
.feat h3 { font-size: 1.07rem; font-weight: 700; margin-bottom: .55rem; letter-spacing: -.01em; }
.feat p { color: var(--mut); font-size: .91rem; line-height: 1.6; }
</style>

<style scoped>
/* ---------- pipeline ---------- */
.pipe { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.2rem; }
.pipe-node {
  position: relative; text-align: center; padding: 1.6rem 1rem; border-radius: 16px;
  border: 1px solid var(--line); background: var(--panel); backdrop-filter: blur(6px);
  transition: transform .3s, border-color .3s;
}
.pipe-node:hover { transform: translateY(-4px); border-color: var(--line-2); }
.pipe-icon {
  display: grid; place-items: center; width: 46px; height: 46px; margin: 0 auto .9rem; border-radius: 50%;
  background: linear-gradient(135deg, rgba(109,94,252,.3), rgba(34,211,238,.2));
  border: 1px solid var(--line-2); color: #fff;
  box-shadow: 0 0 0 6px rgba(109,94,252,.07);
}
.pipe-node strong { display: block; font-size: .97rem; margin-bottom: .25rem; }
.pipe-node small { color: var(--mut); font-size: .82rem; }
.pipe-link {
  position: absolute; top: 46px; right: -2.2rem; width: 2.2rem; height: 2px;
  background: linear-gradient(90deg, var(--acc), var(--acc-2)); opacity: .5; overflow: hidden;
}
.pipe-link::after {
  content: ''; position: absolute; top: -2px; left: -30%; width: 30%; height: 6px; border-radius: 3px;
  background: var(--acc-2); box-shadow: 0 0 12px var(--acc-2);
  animation: flow 2.1s linear infinite;
}
@keyframes flow { to { left: 110%; } }

/* ---------- pricing ---------- */
.price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.3rem; align-items: start; }
.plan {
  position: relative; padding: 2rem 1.7rem; border-radius: 18px;
  border: 1px solid var(--line); background: var(--panel); backdrop-filter: blur(6px);
  transition: transform .3s, border-color .3s, box-shadow .3s;
}
.plan:hover { transform: translateY(-5px); border-color: var(--line-2); }
.plan.featured {
  border-color: rgba(109,94,252,.6);
  background: linear-gradient(170deg, rgba(109,94,252,.14), rgba(255,255,255,.03));
  box-shadow: 0 22px 60px rgba(109,94,252,.22);
}
.plan-badge {
  position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
  padding: .25rem .75rem; border-radius: 999px; font-size: .7rem; font-weight: 700; white-space: nowrap;
  background: linear-gradient(135deg, var(--acc), var(--acc-2)); color: #fff;
}
.plan h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: .55rem; }
.plan-price { font-size: 2.3rem; font-weight: 800; letter-spacing: -.035em; }
.plan-price span { font-size: .95rem; font-weight: 500; color: var(--mut); }
.plan-note { color: var(--mut); font-size: .85rem; margin-bottom: 1.4rem; }
.plan ul { list-style: none; padding: 0; margin: 0 0 1.6rem; display: grid; gap: .6rem; }
.plan li { display: flex; align-items: flex-start; gap: .55rem; font-size: .9rem; color: var(--mut); }
.plan li svg { color: #34d399; flex-shrink: 0; margin-top: 2px; }
.plan .btn { width: 100%; }

/* ---------- cta band ---------- */
.cta-band {
  display: flex; align-items: center; justify-content: space-between; gap: 2rem; flex-wrap: wrap;
  padding: 2.8rem; border-radius: 20px; border: 1px solid var(--line-2);
  background: linear-gradient(120deg, rgba(109,94,252,.2), rgba(34,211,238,.1));
  backdrop-filter: blur(8px);
}
.cta-band h2 { font-size: clamp(1.6rem, 3vw, 2.1rem); letter-spacing: -.03em; margin-bottom: .55rem; }
.cta-band p { color: var(--mut); max-width: 30rem; }
.cta-actions { display: flex; gap: .7rem; flex-wrap: wrap; }

/* ---------- footer ---------- */
.footer { position: relative; z-index: 1; border-top: 1px solid var(--line); padding: 3.5rem 0 1.5rem; background: rgba(5,6,10,.6); }
.foot-inner { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem; }
.foot-brand p { color: var(--mut); font-size: .88rem; margin-top: .8rem; line-height: 1.6; max-width: 20rem; }
.foot-col h4 { font-size: .82rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--txt); margin-bottom: .9rem; }
.foot-col a { display: block; color: var(--mut); text-decoration: none; font-size: .88rem; margin-bottom: .5rem; transition: color .2s; }
.foot-col a:hover { color: var(--acc-2); }
.foot-bottom { display: flex; justify-content: space-between; padding-top: 1.4rem; border-top: 1px solid var(--line); color: var(--mut); font-size: .82rem; flex-wrap: wrap; gap: .5rem; }

/* ---------- responsive ---------- */
@media (max-width: 960px) {
  .hero-inner { grid-template-columns: 1fr; }
  .hero-visual { order: -1; }
  .feat-grid, .price-grid, .pipe { grid-template-columns: 1fr 1fr; }
  .stat-grid { grid-template-columns: 1fr 1fr; }
  .foot-inner { grid-template-columns: 1fr 1fr; }
  .pipe-link { display: none; }
}
@media (max-width: 680px) {
  .wrap { width: min(1180px, 100% - 2rem); }
  .burger { display: inline-flex; }
  .nav-links {
    position: absolute; top: 68px; left: 0; right: 0; flex-direction: column; align-items: stretch; gap: .35rem;
    padding: 1rem; background: rgba(9,10,16,.97); border-bottom: 1px solid var(--line);
    backdrop-filter: blur(16px); display: none;
  }
  .nav-links.open { display: flex; }
  .nav-links .cta { justify-content: center; }
  .feat-grid, .price-grid, .pipe, .stat-grid, .foot-inner { grid-template-columns: 1fr; }
  .float-card { display: none; }
  .cta-band { padding: 1.8rem; }
}
@media (prefers-reduced-motion: reduce) {
  .blob, .console, .float-card, .pipe-link::after, .pill .dot { animation: none !important; }
  .reveal, .stats { animation: none !important; opacity: 1 !important; transform: none !important; }
}
</style>

<style scoped>
/* ---------- spec panels (self-hosted / white-label) ---------- */
.spec {
  display: grid; grid-template-columns: 1fr 1fr; gap: 1.1rem; margin-top: 1.1rem;
}
.spec-col {
  padding: 1.6rem 1.7rem; border-radius: 16px;
  border: 1px solid var(--line); background: rgba(255,255,255,.028);
  backdrop-filter: blur(6px);
}
.spec-col h4 {
  display: flex; align-items: center; gap: .5rem;
  font-size: .8rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--acc-2); margin-bottom: 1.1rem;
}
.spec-col dl { display: grid; gap: .1rem; }
.spec-col dl > div {
  display: grid; grid-template-columns: 11rem 1fr; gap: 1rem;
  padding: .72rem 0; border-top: 1px solid var(--line);
}
.spec-col dl > div:first-child { border-top: 0; padding-top: 0; }
.spec-col dt { font-size: .88rem; font-weight: 600; color: var(--txt); }
.spec-col dd { font-size: .88rem; color: var(--mut); line-height: 1.55; }

.feat-icon.alt-icon {
  background: linear-gradient(135deg, rgba(244,114,182,.26), rgba(109,94,252,.2));
  color: var(--acc-3);
}

@media (max-width: 960px) {
  .spec { grid-template-columns: 1fr; }
}
@media (max-width: 680px) {
  .spec-col { padding: 1.3rem; }
  .spec-col dl > div { grid-template-columns: 1fr; gap: .25rem; }
}
</style>

<style scoped>
/* ---------- hosting choice (cloud vs self-hosted) ---------- */
.host-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.2rem; }
.host {
  padding: 1.9rem; border-radius: 18px;
  border: 1px solid var(--line); background: var(--panel);
  backdrop-filter: blur(6px);
  transition: transform .3s, border-color .3s, box-shadow .3s;
}
.host:hover { transform: translateY(-4px); border-color: var(--line-2); box-shadow: 0 20px 44px rgba(0,0,0,.4); }
.host-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.1rem; }
.host-icon {
  display: grid; place-items: center; width: 46px; height: 46px; border-radius: 13px;
  background: linear-gradient(135deg, rgba(109,94,252,.3), rgba(34,211,238,.2));
  border: 1px solid var(--line-2); color: var(--acc-2);
}
.host-tag {
  font-size: .7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: var(--acc-3); padding: .28rem .65rem; border-radius: 999px;
  background: rgba(244,114,182,.12); border: 1px solid rgba(244,114,182,.3);
}
.host h3 { font-size: 1.22rem; font-weight: 700; letter-spacing: -.02em; margin-bottom: .6rem; }
.host > p { color: var(--mut); font-size: .93rem; line-height: 1.62; margin-bottom: 1.3rem; }
.host ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .55rem; }
.host li { display: flex; align-items: flex-start; gap: .55rem; font-size: .89rem; color: var(--mut); }
.host li svg { color: #34d399; flex-shrink: 0; margin-top: 2px; }

/* Four pricing tiers now, so the grid needs to breathe differently. */
.price-grid { grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.plan { padding: 1.8rem 1.4rem; }
.plan-price { font-size: 1.95rem; }

@media (max-width: 1100px) {
  .price-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 960px) {
  .host-grid { grid-template-columns: 1fr; }
}
@media (max-width: 680px) {
  .price-grid { grid-template-columns: 1fr; }
  .host { padding: 1.4rem; }
}
</style>

<style scoped>
/* ---------- bring-your-own-models ---------- */
.model-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.2rem; margin-bottom: 1.1rem; }
.model {
  padding: 1.7rem; border-radius: 18px;
  border: 1px solid var(--line); background: var(--panel);
  backdrop-filter: blur(6px);
  transition: transform .3s, border-color .3s;
}
.model:hover { transform: translateY(-4px); border-color: var(--line-2); }
.model header { display: flex; align-items: center; gap: .7rem; margin-bottom: 1.3rem; }
.model-icon {
  display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px;
  background: linear-gradient(135deg, rgba(109,94,252,.28), rgba(34,211,238,.18));
  border: 1px solid var(--line-2); color: var(--acc-2);
}
.model h3 { font-size: 1.02rem; font-weight: 700; letter-spacing: -.01em; }

.model-col { margin-bottom: 1.1rem; }
.model-col:last-child { margin-bottom: 0; }
.model-label {
  display: inline-flex; align-items: center; gap: .35rem;
  font-size: .7rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  margin-bottom: .55rem;
}
.model-label.self { color: var(--acc-2); }
.model-label.cloud { color: var(--mut); }
.model-col ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .38rem; }
.model-col li {
  font-size: .86rem; color: var(--mut); padding-left: .85rem; position: relative;
  line-height: 1.45;
}
.model-col li::before {
  content: ''; position: absolute; left: 0; top: .55em;
  width: 4px; height: 4px; border-radius: 50%; background: var(--line-2);
}
.model-col:first-of-type li::before { background: var(--acc-2); }

@media (max-width: 960px) { .model-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 680px) { .model-grid { grid-template-columns: 1fr; } .model { padding: 1.4rem; } }
</style>
