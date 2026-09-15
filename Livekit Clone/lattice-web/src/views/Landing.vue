<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Waves, Zap, Server, Boxes, ShieldCheck, GitBranch, Plug, Gauge,
  ArrowRight, Check, Menu, X, Github, Terminal, Cpu, Radio, Lock
} from '@lucide/vue'

const scrolled = ref(false)
const menuOpen = ref(false)

const onScroll = () => { scrolled.value = window.scrollY > 12 }

// Animated waveform bars
const bars = ref<number[]>(Array.from({ length: 44 }, () => 0.2))
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
const stats = ref([
  { label: 'Turn latency', target: 450, suffix: 'ms', value: 0 },
  { label: 'Concurrent sessions', target: 12, suffix: 'k', value: 0 },
  { label: 'Provider plugins', target: 28, suffix: '', value: 0 },
  { label: 'Uptime', target: 99.98, suffix: '%', value: 0, decimals: 2 }
])

let io: IntersectionObserver | null = null

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  raf = requestAnimationFrame(animate)

  io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return
      e.target.classList.add('is-visible')
      if (e.target.classList.contains('stats')) runCounters()
      io?.unobserve(e.target)
    })
  }, { threshold: 0.18, rootMargin: '0px 0px -60px 0px' })

  document.querySelectorAll('.reveal, .stats').forEach((el) => io?.observe(el))
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  cancelAnimationFrame(raf)
  io?.disconnect()
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
  { icon: Waves, label: 'TTS out', detail: 'First byte 180ms' }
]

const plans = [
  {
    name: 'Core', price: 'Free', note: 'Self-hosted, Apache 2.0',
    features: ['Unlimited agents', 'Full modular API', 'All provider plugins', 'Community support'],
    cta: 'Start building', featured: false
  },
  {
    name: 'Cloud', price: '$0.008', unit: '/min', note: 'Managed, we run it',
    features: ['Everything in Core', 'Autoscaling workers', 'Managed upgrades', '99.98% SLA', 'Priority support'],
    cta: 'Start free trial', featured: true
  },
  {
    name: 'Enterprise', price: 'Custom', note: 'Air-gapped or dedicated',
    features: ['Everything in Cloud', 'Air-gapped install', 'Custom providers', 'Dedicated engineer', 'Compliance review'],
    cta: 'Talk to us', featured: false
  }
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
        <router-link to="/" class="brand">
          <span class="brand-mark"><Waves :size="18" :stroke-width="2.4" /></span>
          <span class="brand-text">Lattice<span>Net</span></span>
        </router-link>

        <nav class="nav-links" :class="{ open: menuOpen }">
          <a href="#features" @click="menuOpen = false">Features</a>
          <a href="#pipeline" @click="menuOpen = false">Pipeline</a>
          <a href="#pricing" @click="menuOpen = false">Pricing</a>
          <a href="#docs" @click="menuOpen = false">Docs</a>
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
            Lattice Net is a modular, self-hosted voice AI stack. Swap any provider,
            run it on your own hardware, and keep every millisecond and every recording
            inside your perimeter.
          </p>
          <div class="hero-cta">
            <router-link to="/signup" class="btn primary">Start free <ArrowRight :size="17" :stroke-width="2.5" /></router-link>
            <a href="#pipeline" class="btn ghost-btn"><Gauge :size="17" :stroke-width="2.2" /> See the pipeline</a>
          </div>
          <div class="trust">
            <span><ShieldCheck :size="15" /> SOC 2 ready</span>
            <span><Github :size="15" /> Apache 2.0</span>
            <span><Server :size="15" /> Air-gap capable</span>
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

    <section id="pricing" class="section">
      <div class="wrap">
        <div class="head reveal">
          <span class="eyebrow">Pricing</span>
          <h2>Predictable, or free forever</h2>
          <p>Self-host at no cost. Let us run it when you would rather not carry the pager.</p>
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
          <h2>Ship a voice agent this afternoon</h2>
          <p>Clone the repo, point it at your providers, and take your first call in about fifteen minutes.</p>
        </div>
        <div class="cta-actions">
          <router-link to="/signup" class="btn primary">Get started <ArrowRight :size="17" :stroke-width="2.5" /></router-link>
          <a href="#" class="btn outline"><Github :size="17" /> View on GitHub</a>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div class="wrap foot-inner">
        <div class="foot-brand">
          <span class="brand"><span class="brand-mark"><Waves :size="18" :stroke-width="2.4" /></span>
          <span class="brand-text">Lattice<span>Net</span></span></span>
          <p>Modular voice infrastructure for teams who want to own their stack.</p>
        </div>
        <div class="foot-col"><h4>Product</h4><a href="#features">Features</a><a href="#pipeline">Pipeline</a><a href="#pricing">Pricing</a></div>
        <div class="foot-col"><h4>Developers</h4><a href="#docs">Documentation</a><a href="#docs">API reference</a><a href="#docs">Plugin guide</a></div>
        <div class="foot-col"><h4>Company</h4><a href="#">About</a><a href="#">Security</a><a href="#">Contact</a></div>
      </div>
      <div class="wrap foot-bottom"><span>© 2026 Lattice Net — Aetos Tech Labs</span><span>Apache 2.0</span></div>
    </footer>
  </div>
</template>
