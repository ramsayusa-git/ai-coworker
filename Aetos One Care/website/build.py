#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Static site builder for the Aetos One Care marketing site."""
import io, os

OUT = os.path.dirname(os.path.abspath(__file__))

LOGO = (u'<svg class="logo-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">'
        u'<rect x="1.5" y="1.5" width="37" height="37" rx="11" stroke="url(#lg)" stroke-width="2"/>'
        u'<path d="M7 21h5l2.5-7 4 13 3.5-9 2.5 3H33" stroke="#00e0b8" stroke-width="2.4" '
        u'stroke-linecap="round" stroke-linejoin="round"/>'
        u'<defs><linearGradient id="lg" x1="0" y1="0" x2="40" y2="40">'
        u'<stop stop-color="#2f6bff"/><stop offset="1" stop-color="#00e0b8"/></linearGradient></defs></svg>')

ARROW = (u'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         u'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
         u'<path d="M5 12h14M13 6l6 6-6 6"/></svg>')

NAV_ITEMS = [
    ("index.html", "Home"),
    ("platform.html", "Platform"),
    ("care.html", "For Patients"),
    ("doctor.html", "For Doctors"),
    ("admin.html", "For Hospitals"),
    ("devices.html", "Devices"),
    ("compare.html", "Compare"),
    ("pricing.html", "Pricing"),
]

def nav():
    links = u"".join(
        u'<a href="%s">%s</a>' % (h, t) for h, t in NAV_ITEMS
    )
    return (u'<header class="nav"><div class="nav-in">'
            u'<a class="logo" href="index.html">' + LOGO +
            u'<span>Aetos One <span class="grad">Care</span></span></a>'
            u'<nav class="nav-links">' + links + u'</nav>'
            u'<div class="nav-cta">'
            u'<button class="icon-btn" onclick="toggleTheme()" aria-label="Toggle theme" title="Toggle light / dark">'
            u'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
            u'<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg></button>'
            u'<a class="btn btn-primary" href="contact.html">Book a demo</a>'
            u'<button class="icon-btn burger" aria-label="Menu">'
            u'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
            u'<path d="M3 6h18M3 12h18M3 18h18"/></svg></button>'
            u'</div></div></header>')

FOOT_COLS = [
    ("Platform", [("platform.html", "Live consult loop"), ("devices.html", "Device layer"),
                  ("platform.html#ai", "AI agents"), ("platform.html#architecture", "Architecture")]),
    ("Products", [("care.html", "Patient web"), ("mobile.html", "Patient app"),
                  ("doctor.html", "Doctor console"), ("admin.html", "Admin console")]),
    ("Trust", [("compliance.html", "ABDM &amp; DPDPA"), ("compliance.html#cdsco", "CDSCO pathway"),
               ("compliance.html#security", "Security"), ("compare.html", "Compare vendors")]),
    ("Company", [("pricing.html", "Pricing"), ("contact.html", "Contact"),
                 ("contact.html#partners", "Partners"), ("index.html#faq", "FAQ")]),
]

def footer():
    cols = u""
    for title, items in FOOT_COLS:
        li = u"".join(u'<li><a href="%s">%s</a></li>' % (h, t) for h, t in items)
        cols += u'<div><h5>%s</h5><ul>%s</ul></div>' % (title, li)
    return (u'<footer><div class="wrap"><div class="foot-grid">'
            u'<div><a class="logo" href="index.html">' + LOGO +
            u'<span>Aetos One <span class="grad">Care</span></span></a>'
            u'<p class="muted" style="margin-top:16px;max-width:320px;font-size:.93rem">'
            u'The care platform where the readings come from the devices in the room. '
            u'Built in India for Indian clinics, hospitals and homes.</p>'
            u'<div class="badges">'
            u'<span class="badge">ABDM HIP/HIU</span><span class="badge">DPDPA 2023</span>'
            u'<span class="badge">FHIR R4</span><span class="badge">ISO 27001</span>'
            u'<span class="badge">AES-256-GCM</span></div></div>'
            + cols +
            u'</div><div class="foot-bottom">'
            u'<span>&copy; 2026 Aetos Tech Labs LLP. All rights reserved.</span>'
            u'<span>Aetos One Care is a care-delivery platform, not a diagnostic device. '
            u'AI outputs are decision support for registered practitioners.</span>'
            u'</div></div></footer>')

HEAD = (u'<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
        u'<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        u'<title>__TITLE__</title>\n<meta name="description" content="__DESC__">\n'
        u'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        u'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        u'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        u'family=Sora:wght@400;600;700;800&family=Inter:wght@300;400;500;600&'
        u'family=JetBrains+Mono:wght@400;500&display=swap">\n'
        u'<link rel="stylesheet" href="assets/css/site.css">\n'
        u'<link rel="icon" href="data:image/svg+xml,'
        u'%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E'
        u'%3Crect width=%2740%27 height=%2740%27 rx=%2711%27 fill=%27%23050a16%27/%3E'
        u'%3Cpath d=%27M7 21h5l2.5-7 4 13 3.5-9 2.5 3H33%27 stroke=%27%2300e0b8%27 '
        u'stroke-width=%273%27 fill=%27none%27 stroke-linecap=%27round%27/%3E%3C/svg%3E">\n'
        u'<script>document.documentElement.classList.add("js")</script>\n</head>\n<body>\n'
        u'<div class="mesh"><span></span><span></span><span></span></div>\n'
        u'<div class="grid-overlay"></div>\n')

def page(filename, title, desc, body):
    html = (HEAD.replace(u"__TITLE__", title).replace(u"__DESC__", desc)
            + nav() + u"\n<main>\n" + body + u"\n</main>\n" + footer()
            + u'\n<script src="assets/js/site.js"></script>\n</body>\n</html>\n')
    with io.open(os.path.join(OUT, filename), "w", encoding="utf-8") as f:
        f.write(html)
    return len(html)

# ---------------------------------------------------------------- components
def cta(title, sub, primary=("contact.html", "Book a 30-minute demo"),
        secondary=("platform.html", "See how the loop works")):
    return (u'<section><div class="wrap"><div class="callout reveal" '
            u'style="text-align:center;padding:60px 34px">'
            u'<h2>%s</h2><p class="lede" style="max-width:640px;margin:14px auto 0">%s</p>'
            u'<div class="btn-row" style="justify-content:center">'
            u'<a class="btn btn-primary btn-lg" href="%s">%s</a>'
            u'<a class="btn btn-ghost btn-lg" href="%s">%s</a>'
            u'</div></div></div></section>'
            % (title, sub, primary[0], primary[1], secondary[0], secondary[1]))

def page_hero(eyebrow, h1, lede, chips=None, actions=True):
    c = u""
    if chips:
        c = u'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:28px">' + \
            u"".join(u'<span class="chip">%s</span>' % x for x in chips) + u'</div>'
    a = u""
    if actions:
        a = (u'<div class="btn-row"><a class="btn btn-primary" href="contact.html">Book a demo</a>'
             u'<a class="btn btn-ghost" href="compare.html">Compare with your current vendor</a></div>')
    return (u'<section class="hero"><div class="wrap" style="max-width:920px">'
            u'<span class="eyebrow">%s</span><h1>%s</h1>'
            u'<p class="lede" style="margin-top:22px">%s</p>%s%s'
            u'</div></section>' % (eyebrow, h1, lede, c, a))

def cards(items, cls="g3"):
    out = u'<div class="grid %s">' % cls
    for ico, h, p in items:
        out += (u'<article class="card reveal"><div class="ico">%s</div>'
                u'<h3>%s</h3><p>%s</p></article>' % (ico, h, p))
    return out + u'</div>'

def feature_rows(rows):
    out = u''
    for i, (kicker, h, p, bullets) in enumerate(rows):
        li = u"".join(u'<li>%s</li>' % b for b in bullets)
        out += (u'<div class="grid g2 reveal" style="align-items:center;gap:52px;margin-bottom:64px">'
                u'<div><span class="eyebrow">%s</span><h3 style="font-size:clamp(1.5rem,2.6vw,2rem)">%s</h3>'
                u'<p class="lede" style="font-size:1.02rem;margin-top:14px">%s</p></div>'
                u'<div class="card"><ul style="list-style:none;display:grid;gap:13px">%s</ul></div></div>'
                % (kicker, h, p, li))
    return out.replace(u'<li>', u'<li style="display:flex;gap:11px;color:var(--ink-2);font-size:.95rem">'
                                u'<span style="color:var(--signal)">&#9679;</span><span>').replace(u'</li>', u'</span></li>')

# ================================================================= HOME
ECG = (u'<div class="ecg-strip"><svg viewBox="0 0 700 96" preserveAspectRatio="none" aria-label="Live ECG trace">'
       u'<path class="ecg-ghost" d="M0 62 H52 l7-3 6 8 7-40 8 62 7-27 8 2 H165 l7-3 6 8 7-40 8 62 7-27 8 2 H330 l7-3 6 8 7-40 8 62 7-27 8 2 H495 l7-3 6 8 7-40 8 62 7-27 8 2 H700"/>'
       u'<path class="ecg-path" d="M0 62 H52 l7-3 6 8 7-40 8 62 7-27 8 2 H165 l7-3 6 8 7-40 8 62 7-27 8 2 '
       u'H330 l7-3 6 8 7-40 8 62 7-27 8 2 H495 l7-3 6 8 7-40 8 62 7-27 8 2 H700"/></svg></div>')

CONSULT_MOCK = (
    u'<div class="consult reveal">'
    u'<div class="consult-bar">'
    u'<span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span>'
    u'<span class="dot" style="background:#28c840"></span>'
    u'<span class="t">consult / ROOM-4417 / Dr. A. Rao &middot; Cardiology</span>'
    u'<span class="live">LIVE</span></div>'
    u'<div class="consult-body">'
    u'<div class="consult-video">'
    u'<div class="avatar-row"><div class="avatar">K</div>'
    u'<div><div style="font-weight:600">Krishna &middot; 58M</div>'
    u'<div class="mono" style="font-size:.74rem;color:var(--ink-3)">ABHA linked &middot; consent active &middot; 12:41</div></div></div>'
    u'<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:22px">'
    u'<span class="tag live">ECG2 connected</span><span class="tag live">BP cuff</span>'
    u'<span class="tag dev">Glucometer pairing</span></div>'
    u'<div class="mono" style="margin-top:20px;font-size:.76rem;color:var(--ink-3);line-height:1.9">'
    u'&gt; scribe: drafting SOAP note&hellip;<br>'
    u'&gt; cds: no interaction with metformin 500<br>'
    u'&gt; abdm: care-context linked to ABHA</div></div>'
    u'<div class="vitals">'
    u'<div class="vital"><span class="k">Heart rate</span>'
    u'<span class="v" id="v-hr">74 <small>bpm</small></span></div>'
    u'<div class="vital"><span class="k">SpO&#8322;</span>'
    u'<span class="v" id="v-spo2">98 <small>%</small></span></div>'
    u'<div class="vital"><span class="k">BP</span><span class="v">128/82 <small>mmHg</small></span></div>'
    u'<div class="vital"><span class="k">Lead II</span>'
    u'<span class="v" style="color:var(--signal);font-size:1rem">streaming</span></div>'
    u'</div></div>' + ECG + u'</div>')

TRUST = [u'<b>ABDM</b> HIP / HIU', u'<b>FHIR R4</b> + HL7 v2.5', u'<b>DPDPA 2023</b> consent ledger',
         u'<b>ICD-10</b> / SNOMED CT / LOINC', u'<b>WhatsApp</b> Rx delivery', u'<b>UPI</b> &amp; Razorpay',
         u'<b>BLE</b> ECG &middot; BP &middot; SpO&#8322; &middot; glucose', u'<b>ISO 27001</b> controls',
         u'<b>NHCX</b> claims ready', u'<b>ABHA</b> creation &amp; linking']

def home():
    b = u''
    # hero
    b += (u'<section class="hero"><div class="wrap"><div class="hero-grid">'
          u'<div><span class="eyebrow">Live device data &times; live consult</span>'
          u'<h1>The readings come from <span class="grad">the devices in the room.</span></h1>'
          u'<p class="lede">Every platform in India digitised the conversation. None of them digitised '
          u'the patient. Aetos One Care streams ECG, blood pressure, SpO&#8322; and glucose straight into '
          u'the consult your doctor is already in &mdash; and into a record that follows the patient home.</p>'
          u'<div class="btn-row"><a class="btn btn-primary btn-lg" href="contact.html">Book a 30-minute demo</a>'
          u'<a class="btn btn-ghost btn-lg" href="platform.html">See the loop ' + ARROW + u'</a></div>'
          u'<div class="hero-stats">'
          u'<div><div class="n"><span data-count="4">0</span></div><div class="l">device classes streaming live</div></div>'
          u'<div><div class="n"><span data-count="6">0</span></div><div class="l">export formats incl. FHIR R4</div></div>'
          u'<div><div class="n">&lt;<span data-count="800">0</span>ms</div><div class="l">device&nbsp;&rarr;&nbsp;doctor latency</div></div>'
          u'</div></div><div>' + CONSULT_MOCK + u'</div></div></div></section>')
    # trust marquee
    chips = u"".join(u'<span class="chip">%s</span>' % c for c in TRUST)
    b += (u'<section style="padding:0 0 90px"><div class="wrap"><div class="marquee">'
          u'<div class="marquee-track">' + chips + chips + u'</div></div></div></section>')
    # the gap
    b += (u'<section id="gap"><div class="wrap"><div class="section-head center reveal">'
          u'<span class="eyebrow">The gap we build into</span>'
          u'<h2>Three industries. One missing wire.</h2>'
          u'<p class="lede" style="margin-top:16px">We surveyed thirty-two providers across Indian '
          u'teleconsult, clinic SaaS and connected devices. Almost nobody spans all three &mdash; and '
          u'nobody at all ships the one thing that matters at the bedside.</p></div>'
          + cards([
              (u'&#128241;', u'Teleconsult platforms',
               u'Practo, Apollo 24|7, 1mg, MediBuddy. Excellent at discovery, delivery and fulfilment. '
               u'No device layer, and records that stop at the PDF.'),
              (u'&#129513;', u'Clinic &amp; hospital SaaS',
               u'Eka Care, HealthPlix, KareXpert, MocDoc. Mature EMR, scribes and ABDM milestones. '
               u'Device integration is a single logo on a partner page.'),
              (u'&#128225;', u'Connected devices',
               u'Dozee, Tricog. Real clearances and real signal quality &mdash; shipped as closed silos '
               u'with no ABDM integration and no public API.'),
          ])
          + u'<div class="callout reveal" style="margin-top:34px">'
          u'<h3>Live device readings inside a live consult is not a product anyone in this market ships.</h3>'
          u'<p>That is the whole wedge. Everything else on this site exists to make that one loop clinical, '
          u'compliant and boring to operate.</p></div>'
          u'</div></section>')
    # loop
    b += (u'<section id="loop" style="background:var(--surface);border-block:1px solid var(--stroke)">'
          u'<div class="wrap"><div class="section-head reveal">'
          u'<span class="eyebrow">How it works</span><h2>Four steps, one continuous record.</h2>'
          u'<p class="lede" style="margin-top:14px">No file exports, no re-typing vitals, no "please send '
          u'me your last report".</p></div>'
          u'<div class="loop">'
          u'<div class="step reveal"><h4>Capture</h4><p>The patient app pairs over BLE with the ECG2 chest '
          u'sensor, BP cuff, pulse oximeter or glucometer. Readings are signed on-device and timestamped.</p></div>'
          u'<div class="step reveal"><h4>Stream</h4><p>Waveforms and vitals ride a WebRTC data channel into '
          u'the same room as the video. Sub-second, with local buffering when the line drops.</p></div>'
          u'<div class="step reveal"><h4>Decide</h4><p>The doctor console renders Lead II beside the patient '
          u'history. The scribe drafts the note; CDS flags interactions. The doctor signs.</p></div>'
          u'<div class="step reveal"><h4>Persist</h4><p>Consult, waveform and prescription land in one FHIR '
          u'R4 record, linked to ABHA under a consent artefact the patient can revoke.</p></div>'
          u'</div></div></section>')
    # products bento
    prod = [
        (u'care.html', u'Patient web', u'live', u'&#127760;', u'Aetos One Care',
         u'Book, consult, read results and share records. Family accounts with parental controls, '
         u'six-format export, delivery tracking and refill automation.', u'wide'),
        (u'doctor.html', u'Doctor console', u'dev', u'&#129658;', u'Aetos One Clinic',
         u'Live vitals beside the chart, ambient scribe, e-prescription with interaction checks, '
         u'and queue triage by clinical urgency.', u'wide'),
        (u'mobile.html', u'Patient app', u'dev', u'&#128241;', u'Aetos One Mobile',
         u'Android-native BLE capture for ECG, BP and glucose. Offline record access and '
         u'consultation reminders.', u''),
        (u'admin.html', u'Admin console', u'dev', u'&#9881;&#65039;', u'Aetos One Admin',
         u'Multi-branch org management, credentialing, RBAC, consent ledger and access audit with '
         u'reason codes.', u''),
        (u'devices.html', u'Device layer', u'live', u'&#128267;', u'Aetos One Signal',
         u'The BLE and gateway layer: device registry, calibration state, signal-quality scoring '
         u'and replay.', u''),
    ]
    b += (u'<section id="products"><div class="wrap"><div class="section-head reveal">'
          u'<span class="eyebrow">The product line</span><h2>Five surfaces. One clinical spine.</h2></div>'
          u'<div class="bento">')
    for href, kind, state, ico, name, copy, span in prod:
        b += (u'<article class="card reveal %s"><div class="ico">%s</div>'
              u'<span class="tag %s">%s</span>'
              u'<h3 style="margin-top:14px">%s</h3><p>%s</p>'
              u'<a class="card-link" href="%s">%s %s</a></article>'
              % (span, ico, state, u'Shipping' if state == u'live' else u'In build',
                 name, copy, href, kind, ARROW))
    b += u'</div></div></section>'
    # stats
    b += (u'<section style="padding-top:0"><div class="wrap"><div class="stats reveal">'
          u'<div class="stat"><div class="n"><span data-count="32">0</span></div>'
          u'<div class="l">competitor products benchmarked</div></div>'
          u'<div class="stat"><div class="n"><span data-count="6">0</span></div>'
          u'<div class="l">interop formats out of the box</div></div>'
          u'<div class="stat"><div class="n"><span data-count="3">0</span></div>'
          u'<div class="l">ABDM milestones on the roadmap</div></div>'
          u'<div class="stat"><div class="n"><span data-count="12">0</span></div>'
          u'<div class="l">months of audit retention, partitioned</div></div>'
          u'</div></div></section>')
    # compare strip
    b += (u'<section id="compare" style="background:var(--surface);border-block:1px solid var(--stroke)">'
          u'<div class="wrap"><div class="section-head reveal"><span class="eyebrow">Honest comparison</span>'
          u'<h2>Where we win, and where we do not.</h2>'
          u'<p class="lede" style="margin-top:14px">We are not the biggest network, the fastest delivery or '
          u'the cheapest scribe. We are the only one wiring the device to the consult to the record.</p></div>'
          u'<div class="table-wrap reveal"><table><thead><tr>'
          u'<th>Capability</th><th>Aetos One Care</th><th>Eka Care</th><th>Apollo 24|7</th>'
          u'<th>Practo</th><th>Dozee / Tricog</th></tr></thead><tbody>'
          u'<tr class="us"><td><strong>Live device vitals inside the consult</strong></td>'
          u'<td class="yes">Core</td><td class="no">&mdash;</td><td class="no">&mdash;</td>'
          u'<td class="no">&mdash;</td><td class="part">Device only</td></tr>'
          u'<tr><td>Ambient clinical scribe</td><td class="part">In build</td><td class="yes">EkaScribe, 1M+ sessions</td>'
          u'<td class="part">CIE decision support</td><td class="no">&mdash;</td><td class="no">&mdash;</td></tr>'
          u'<tr><td>FHIR R4 + HL7 v2.5 export</td><td class="yes">6 formats</td><td class="yes">FHIR</td>'
          u'<td class="part">Partial</td><td class="part">Partial</td><td class="no">Not verified</td></tr>'
          u'<tr><td>ABDM milestones</td><td class="part">M1&ndash;M3 roadmap</td><td class="yes">NHA approved</td>'
          u'<td class="no">No claim found</td><td class="part">Provider side only</td><td class="no">Not verified</td></tr>'
          u'<tr><td>Medicine delivery &amp; lab network</td><td class="part">Partner model</td><td class="part">e-lab partners</td>'
          u'<td class="yes">19-min, 2,000+ centres</td><td class="part">Marketplace</td><td class="no">&mdash;</td></tr>'
          u'<tr><td>Device regulatory clearance</td><td class="part">CDSCO pathway</td><td class="no">&mdash;</td>'
          u'<td class="no">&mdash;</td><td class="no">&mdash;</td><td class="yes">FDA / CE / CDSCO</td></tr>'
          u'</tbody></table></div>'
          u'<p class="muted" style="margin-top:16px;font-size:.86rem">Verified against live vendor sites, '
          u'September 2026. <a href="compare.html" style="color:var(--signal)">Full 32-product comparison ' + ARROW + u'</a></p>'
          u'</div></section>')
    # compliance
    b += (u'<section id="trust"><div class="wrap"><div class="grid g2" style="gap:52px;align-items:center">'
          u'<div class="reveal"><span class="eyebrow">Built for the 2026 rulebook</span>'
          u'<h2>Compliance designed in, not retrofitted.</h2>'
          u'<p class="lede" style="margin-top:16px">CDSCO issued final Medical Device Software guidance in '
          u'July 2026 and it classifies by function, not by disclaimer. DPDPA obligations phase in on a '
          u'fixed calendar. We designed the consent ledger, the audit trail and the AI change-control plan '
          u'before the first clinical feature shipped.</p>'
          u'<div class="btn-row"><a class="btn btn-ghost" href="compliance.html">Read the compliance posture ' + ARROW + u'</a></div></div>'
          + cards([
              (u'&#128737;&#65039;', u'Consent as an object',
               u'Every access is bound to a purpose, an expiry and a revocable artefact &mdash; not a checkbox.'),
              (u'&#128269;', u'Audit with reasons',
               u'Access logs carry a reason code. ~180M rows/year, compressed at 7 days, partitioned monthly.'),
              (u'&#129302;', u'AI under change control',
               u'A predetermined change control plan for every model, with screening-scope labels enforced in product.'),
              (u'&#128272;', u'Encryption &amp; residency',
               u'AES-256-GCM at rest, TLS 1.3 in transit, Indian data residency by default.'),
          ], u'g2') + u'</div></div></section>')
    # FAQ
    faqs = [
        (u'Do you replace our existing EMR?',
         u'Not necessarily. The device and consult layer can run alongside an incumbent EMR over FHIR R4 '
         u'and HL7 v2.5. Hospitals running Bahmni or a KareXpert-class HIMS usually keep it and add the signal layer.'),
        (u'Which devices are supported?',
         u'The ikinloop ECG2 chest sensor, standard BLE blood-pressure cuffs, pulse oximeters and glucometers, '
         u'with a device registry that carries calibration state and signal-quality scoring per reading.'),
        (u'Is the AI making diagnoses?',
         u'No. Scribe and decision support are assistive, scoped to screening, and every output is attributed '
         u'to and signed by a registered practitioner. Rhythm classification stays behind a feature flag pending clearance.'),
        (u'Can patients take their records elsewhere?',
         u'Yes &mdash; that is the point of ABHA linking and six-format export. A record you cannot leave with '
         u'is a record you do not own.'),
        (u'What does it cost?',
         u'Published, per-clinic, on the pricing page. Almost nobody in this market publishes pricing; '
         u'we think that vacuum is a trust problem, not a strategy.'),
    ]
    b += (u'<section id="faq" style="background:var(--surface);border-block:1px solid var(--stroke)">'
          u'<div class="wrap" style="max-width:860px"><div class="section-head center reveal">'
          u'<span class="eyebrow">Questions</span><h2>The things buyers actually ask.</h2></div>')
    for q, a in faqs:
        b += u'<details class="faq reveal"><summary>%s</summary><p>%s</p></details>' % (q, a)
    b += u'</div></section>'
    b += cta(u'See a live ECG land in a consult window.',
             u'Thirty minutes, your clinical workflow, our device kit. We will show the loop end to end and '
             u'tell you plainly where a competitor would serve you better.')
    return b

# ================================================================= PLATFORM
ARCH_SVG = u'''<svg viewBox="0 0 900 470" role="img" aria-label="Aetos One Care architecture"
  style="width:100%;height:auto">
  <defs>
    <linearGradient id="gA" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f6bff" stop-opacity=".22"/>
      <stop offset="1" stop-color="#00e0b8" stop-opacity=".12"/>
    </linearGradient>
    <marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
      <path d="M0 0 L9 4.5 L0 9 z" fill="#00e0b8"/>
    </marker>
  </defs>
  <g font-family="Inter,sans-serif" font-size="13">
    <!-- lane labels -->
    <text x="18" y="52" fill="#6b7d9d" font-size="11" letter-spacing="2">EDGE</text>
    <text x="18" y="172" fill="#6b7d9d" font-size="11" letter-spacing="2">REALTIME</text>
    <text x="18" y="292" fill="#6b7d9d" font-size="11" letter-spacing="2">SERVICES</text>
    <text x="18" y="412" fill="#6b7d9d" font-size="11" letter-spacing="2">RECORD</text>

    <!-- edge -->
    <rect x="110" y="20" width="180" height="56" rx="12" fill="url(#gA)" stroke="#00e0b8" stroke-opacity=".5"/>
    <text x="200" y="45" text-anchor="middle" fill="#eaf0fa" font-weight="600">ECG2 / BP / SpO&#8322;</text>
    <text x="200" y="63" text-anchor="middle" fill="#a9b8d2" font-size="11">BLE, signed on-device</text>

    <rect x="320" y="20" width="170" height="56" rx="12" fill="url(#gA)" stroke="#2f6bff" stroke-opacity=".5"/>
    <text x="405" y="45" text-anchor="middle" fill="#eaf0fa" font-weight="600">Patient app</text>
    <text x="405" y="63" text-anchor="middle" fill="#a9b8d2" font-size="11">Android, offline buffer</text>

    <rect x="520" y="20" width="170" height="56" rx="12" fill="url(#gA)" stroke="#2f6bff" stroke-opacity=".5"/>
    <text x="605" y="45" text-anchor="middle" fill="#eaf0fa" font-weight="600">Clinic gateway</text>
    <text x="605" y="63" text-anchor="middle" fill="#a9b8d2" font-size="11">shared device kiosk</text>

    <rect x="720" y="20" width="160" height="56" rx="12" fill="url(#gA)" stroke="#8b6cff" stroke-opacity=".5"/>
    <text x="800" y="45" text-anchor="middle" fill="#eaf0fa" font-weight="600">Doctor console</text>
    <text x="800" y="63" text-anchor="middle" fill="#a9b8d2" font-size="11">browser, WebRTC</text>

    <!-- realtime -->
    <rect x="110" y="140" width="770" height="58" rx="12" fill="url(#gA)" stroke="#00e0b8" stroke-opacity=".45"/>
    <text x="495" y="165" text-anchor="middle" fill="#eaf0fa" font-weight="600">Signal bus &mdash; WebRTC media + data channel, SFU, per-room auth</text>
    <text x="495" y="184" text-anchor="middle" fill="#a9b8d2" font-size="11">waveform frames &middot; vitals events &middot; presence &middot; replay buffer</text>

    <!-- services -->
    <rect x="110" y="258" width="176" height="58" rx="12" fill="url(#gA)" stroke="#2f6bff" stroke-opacity=".45"/>
    <text x="198" y="284" text-anchor="middle" fill="#eaf0fa" font-weight="600">Consult service</text>
    <text x="198" y="302" text-anchor="middle" fill="#a9b8d2" font-size="11">scheduling, rooms, notes</text>

    <rect x="300" y="258" width="176" height="58" rx="12" fill="url(#gA)" stroke="#2f6bff" stroke-opacity=".45"/>
    <text x="388" y="284" text-anchor="middle" fill="#eaf0fa" font-weight="600">AI agent layer</text>
    <text x="388" y="302" text-anchor="middle" fill="#a9b8d2" font-size="11">scribe, CDS, triage</text>

    <rect x="490" y="258" width="176" height="58" rx="12" fill="url(#gA)" stroke="#2f6bff" stroke-opacity=".45"/>
    <text x="578" y="284" text-anchor="middle" fill="#eaf0fa" font-weight="600">Rx &amp; orders</text>
    <text x="578" y="302" text-anchor="middle" fill="#a9b8d2" font-size="11">e-Rx, labs, pharmacy</text>

    <rect x="680" y="258" width="200" height="58" rx="12" fill="url(#gA)" stroke="#ffb020" stroke-opacity=".45"/>
    <text x="780" y="284" text-anchor="middle" fill="#eaf0fa" font-weight="600">Consent &amp; audit</text>
    <text x="780" y="302" text-anchor="middle" fill="#a9b8d2" font-size="11">DPDPA ledger, reason codes</text>

    <!-- record -->
    <rect x="110" y="376" width="360" height="58" rx="12" fill="url(#gA)" stroke="#00e0b8" stroke-opacity=".45"/>
    <text x="290" y="402" text-anchor="middle" fill="#eaf0fa" font-weight="600">Longitudinal record &mdash; FHIR R4</text>
    <text x="290" y="420" text-anchor="middle" fill="#a9b8d2" font-size="11">encounters, observations, waveforms, prescriptions</text>

    <rect x="490" y="376" width="180" height="58" rx="12" fill="url(#gA)" stroke="#8b6cff" stroke-opacity=".45"/>
    <text x="580" y="402" text-anchor="middle" fill="#eaf0fa" font-weight="600">ABDM bridge</text>
    <text x="580" y="420" text-anchor="middle" fill="#a9b8d2" font-size="11">ABHA, HIP/HIU, HFR</text>

    <rect x="690" y="376" width="190" height="58" rx="12" fill="url(#gA)" stroke="#8b6cff" stroke-opacity=".45"/>
    <text x="785" y="402" text-anchor="middle" fill="#eaf0fa" font-weight="600">Export &amp; share</text>
    <text x="785" y="420" text-anchor="middle" fill="#a9b8d2" font-size="11">PDF, CSV, JSON, HL7, QR</text>

    <!-- arrows -->
    <g stroke="#00e0b8" stroke-opacity=".6" stroke-width="1.6" fill="none" marker-end="url(#ar)">
      <path d="M200 78 V134"/><path d="M405 78 V134"/><path d="M605 78 V134"/><path d="M800 78 V134"/>
      <path d="M198 200 V252"/><path d="M388 200 V252"/><path d="M578 200 V252"/><path d="M780 200 V252"/>
      <path d="M198 318 V370"/><path d="M388 318 V370"/><path d="M578 318 V370"/><path d="M780 318 V370"/>
    </g>
  </g>
</svg>'''

def platform():
    b = page_hero(
        u'Platform',
        u'One loop: <span class="grad">capture, stream, decide, persist.</span>',
        u'The architecture exists to keep a physiological reading trustworthy from the sensor on a '
        u'patient&rsquo;s chest to the signed record a specialist reads six months later.',
        [u'WebRTC data channel', u'FHIR R4 core', u'Consent ledger', u'23 scoped AI agents'])
    b += (u'<section id="architecture" style="padding-top:0"><div class="wrap">'
          u'<div class="card reveal" style="padding:34px">' + ARCH_SVG + u'</div>'
          u'<p class="muted" style="margin-top:14px;font-size:.86rem">Four lanes: edge capture, the realtime '
          u'signal bus, stateless services, and the record. Nothing crosses a lane without an authenticated '
          u'room and an active consent artefact.</p></div></section>')
    b += (u'<section style="background:var(--surface);border-block:1px solid var(--stroke)"><div class="wrap">'
          + feature_rows([
              (u'01 &middot; Capture',
               u'Signal quality decided at the edge',
               u'A bad trace is worse than no trace. Every reading carries a quality score, the device&rsquo;s '
               u'calibration state and a device-signed timestamp before it is allowed on the bus.',
               [u'BLE pairing with a device registry per organisation',
                u'On-device signing; clock skew corrected against server time',
                u'Signal-quality scoring per frame, surfaced to the doctor',
                u'Offline buffering with replay when the line returns']),
              (u'02 &middot; Stream',
               u'Sub-second, in the same room as the video',
               u'Waveforms travel on a WebRTC data channel beside the media stream, so there is no second '
               u'system to reconcile and no polling lag between what is said and what is seen.',
               [u'SFU-based rooms with per-room authorisation',
                u'Vitals events and waveform frames on one ordered channel',
                u'Graceful degradation: vitals survive when video drops',
                u'Replay buffer for the last 10 minutes of any consult']),
              (u'03 &middot; Decide',
               u'Assistive AI, scoped and attributable',
               u'The scribe drafts; the clinician signs. Decision support flags interactions and abnormal '
               u'ranges. Nothing is presented as a diagnosis, and every suggestion is logged against the model version.',
               [u'Ambient scribe drafting SOAP notes during the consult',
                u'Interaction and allergy checks at the point of prescribing',
                u'Queue triage by clinical urgency, not arrival order',
                u'Model version and prompt recorded on every output']),
              (u'04 &middot; Persist',
               u'One record, and the patient can take it',
               u'Consult, waveform, note and prescription land as a single FHIR R4 encounter, linked to '
               u'ABHA under a consent artefact the patient can revoke without calling anyone.',
               [u'FHIR R4 observations for every vital and waveform segment',
                u'Six export formats including HL7 v2.5 and a QR share link',
                u'Care-context linking to ABHA via the ABDM bridge',
                u'Per-access audit rows with a reason code']),
          ]) + u'</div></section>')
    b += (u'<section id="ai"><div class="wrap"><div class="section-head reveal">'
          u'<span class="eyebrow">AI agent layer</span><h2>Twenty-three narrow agents beat one wide one.</h2>'
          u'<p class="lede" style="margin-top:14px">Each agent has a scope, a data contract and a '
          u'change-control record. None of them can write to the clinical record without a human signature.</p></div>'
          + cards([
              (u'&#128221;', u'Scribe', u'Ambient voice-to-SOAP during the consult, editable before signature.'),
              (u'&#9888;&#65039;', u'Medication safety', u'Interaction, allergy and duplication checks at prescribing time.'),
              (u'&#128202;', u'Vitals interpreter', u'Range flags and trend deltas against the patient&rsquo;s own history.'),
              (u'&#128337;', u'Triage', u'Queue ordering by clinical urgency from intake answers and live vitals.'),
              (u'&#128233;', u'Follow-up', u'Schedules and drafts follow-ups tied to the care plan, not to a calendar rule.'),
              (u'&#128269;', u'Record analyser', u'OCR and structuring of uploaded reports into FHIR observations.'),
          ]) + u'</div></section>')
    b += cta(u'Walk the loop with your own workflow.',
             u'Bring a real clinic scenario. We will run it end to end and show you the audit rows it produced.')
    return b

# ================================================================= DEVICES
def devices():
    b = page_hero(
        u'Device layer &middot; Aetos One Signal',
        u'The part <span class="grad">nobody else wired up.</span>',
        u'Dozee and Tricog hold the clearances. Eka Care holds the doctors. Neither holds the wire between '
        u'them. Aetos One Signal is that wire &mdash; a device registry, a stream and a record contract.',
        [u'BLE ECG &middot; BP &middot; SpO&#8322; &middot; glucose', u'Calibration state tracked',
         u'Signal-quality scoring', u'Replay &amp; audit'])
    b += (u'<section style="padding-top:0"><div class="wrap">' + cards([
        (u'&#128147;', u'ECG &mdash; ikinloop ECG2',
         u'Single-lead chest sensor over BLE. Continuous Lead II into the consult window, with per-frame '
         u'quality scoring. Rhythm classification stays behind a feature flag pending CDSCO clearance.'),
        (u'&#129656;', u'Blood pressure',
         u'Standard BLE oscillometric cuffs. Systolic, diastolic and MAP written as FHIR observations with '
         u'cuff size and posture captured alongside.'),
        (u'&#129440;', u'SpO&#8322; &amp; pulse',
         u'Fingertip oximeters streaming saturation and perfusion index, with motion-artefact rejection '
         u'before the reading reaches the doctor.'),
        (u'&#127852;', u'Glucose',
         u'BLE glucometers and CGM imports. Readings land on the same timeline as medication changes, so '
         u'the trend and the prescription sit side by side.'),
        (u'&#128225;', u'Device registry',
         u'Every device belongs to an organisation, carries a calibration date and a firmware version, and '
         u'can be retired without orphaning its historical readings.'),
        (u'&#9851;&#65039;', u'Replay &amp; provenance',
         u'Ten minutes of rolling buffer per consult, plus a permanent provenance chain: which device, which '
         u'firmware, which signal quality, which clinician saw it.'),
    ]) + u'</div></section>')
    b += (u'<section style="background:var(--surface);border-block:1px solid var(--stroke)"><div class="wrap">'
          u'<div class="section-head reveal"><span class="eyebrow">Integration posture</span>'
          u'<h2>We would rather integrate your device than out-build it.</h2>'
          u'<p class="lede" style="margin-top:14px">The RPM cohort has spent years on signal processing and '
          u'regulatory files. Reproducing that is a bad use of everyone&rsquo;s capital. What is missing is '
          u'the interoperability layer &mdash; so that is what we build.</p></div>'
          u'<div class="table-wrap reveal"><table><thead><tr><th>Partner class</th><th>What they bring</th>'
          u'<th>What we add</th><th>Interface</th></tr></thead><tbody>'
          u'<tr><td><strong>Cleared RPM vendors</strong></td><td>FDA / CE / CDSCO cleared sensing and '
          u'validated algorithms</td><td>ABDM linking, consult streaming, longitudinal record</td>'
          u'<td class="mono">REST + webhook ingest</td></tr>'
          u'<tr><td><strong>Consumer BLE devices</strong></td><td>Reach and price</td>'
          u'<td>Quality scoring, provenance, clinician-grade presentation</td><td class="mono">GATT profiles</td></tr>'
          u'<tr><td><strong>Clinic lab machines</strong></td><td>In-clinic diagnostics</td>'
          u'<td>Order-to-result matching against the encounter</td><td class="mono">HL7 v2.5</td></tr>'
          u'<tr><td><strong>Hospital HIMS</strong></td><td>Beds, billing, pharmacy, existing workflow</td>'
          u'<td>The signal lane and the consent ledger</td><td class="mono">FHIR R4</td></tr>'
          u'</tbody></table></div></div></section>')
    b += cta(u'Have a device you want in the loop?',
             u'Send us the GATT profile or the API doc. If it produces a clinically useful reading, we will '
             u'tell you within a week whether it fits.',
             (u'contact.html', u'Talk to the device team'), (u'platform.html', u'See the architecture'))
    return b

# ================================================================= PATIENT WEB
def care():
    b = page_hero(
        u'For patients &amp; families',
        u'Your health record, <span class="grad">finally in one place.</span>',
        u'Book a doctor, join the consult, read the results and hand the whole history to the next '
        u'specialist in one link. Eight features shipped, and every one of them exports.',
        [u'Family accounts', u'6-format export', u'Delivery tracking', u'Refill automation'])
    b += (u'<section style="padding-top:0"><div class="wrap">' + cards([
        (u'&#128337;', u'Booking &amp; consults',
         u'Find a doctor by specialty, book a slot and join by video, audio or chat. Live vitals attach '
         u'themselves if you have a paired device.'),
        (u'&#128220;', u'Medical history timeline',
         u'Consultations, prescriptions, lab results and vitals on one scrollable timeline instead of a '
         u'folder of PDFs.'),
        (u'&#128228;', u'Consultation export',
         u'PDF, CSV, JSON, FHIR R4, HL7 v2.5 or a plain summary &mdash; plus a QR share link with an expiry '
         u'you control.'),
        (u'&#128247;', u'OCR document scanning',
         u'Photograph an old report and it is parsed into structured observations that sit on the same timeline.'),
        (u'&#128138;', u'Prescription refills',
         u'Track up to eight medications with auto-refill toggles, doctor verification and reminder alerts.'),
        (u'&#128666;', u'Delivery tracking',
         u'Live GPS tracking for medicine delivery, with pharmacy partner status and expected arrival.'),
        (u'&#129514;', u'Lab tests',
         u'Transparent per-test pricing, home collection booking and results landing directly in the timeline.'),
        (u'&#128106;', u'Family accounts',
         u'Four roles, parental controls for minors, emergency override and insurance coordination for the '
         u'whole household.'),
        (u'&#128274;', u'Consent you can revoke',
         u'See exactly who accessed what and why &mdash; and withdraw a consent without phoning anyone.'),
    ]) + u'</div></section>')
    b += (u'<section style="background:var(--surface);border-block:1px solid var(--stroke)"><div class="wrap">'
          u'<div class="grid g2" style="gap:52px;align-items:center">'
          u'<div class="reveal"><span class="eyebrow">Why this matters</span>'
          u'<h2>Portability is the feature, not the footnote.</h2>'
          u'<p class="lede" style="margin-top:16px">Most Indian health apps will happily store your history '
          u'and quietly make it hard to leave. We publish export in six formats because a record you cannot '
          u'take with you is not your record.</p>'
          u'<div class="btn-row"><a class="btn btn-ghost" href="compliance.html">How your data is handled ' + ARROW + u'</a></div></div>'
          u'<div class="card reveal"><h3>What leaves with you</h3>'
          u'<ul style="list-style:none;display:grid;gap:12px;margin-top:16px">'
          u'<li style="display:flex;gap:11px;color:var(--ink-2)"><span style="color:var(--signal)">&#9679;</span>'
          u'Every consultation note, signed and timestamped</li>'
          u'<li style="display:flex;gap:11px;color:var(--ink-2)"><span style="color:var(--signal)">&#9679;</span>'
          u'Raw and interpreted vitals, including ECG segments</li>'
          u'<li style="display:flex;gap:11px;color:var(--ink-2)"><span style="color:var(--signal)">&#9679;</span>'
          u'Prescriptions with dosage, duration and issuing doctor</li>'
          u'<li style="display:flex;gap:11px;color:var(--ink-2)"><span style="color:var(--signal)">&#9679;</span>'
          u'Lab results as structured FHIR observations</li>'
          u'<li style="display:flex;gap:11px;color:var(--ink-2)"><span style="color:var(--signal)">&#9679;</span>'
          u'Your ABHA care-context links, intact</li>'
          u'</ul></div></div></div></section>')
    b += cta(u'Ready when your clinic is.',
             u'Aetos One Care works best when your doctor is on the platform. Tell us where you get treated '
             u'and we will reach out to them.',
             (u'contact.html', u'Suggest my clinic'), (u'mobile.html', u'See the mobile app'))
    return b

# ================================================================= MOBILE
def mobile():
    b = page_hero(
        u'Patient app &middot; Android',
        u'The app that <span class="grad">talks to the sensor.</span>',
        u'A native Kotlin app that pairs over BLE, captures a clean trace, and pushes it into the consult '
        u'your doctor is already in. Offline-first, because Indian connectivity is.',
        [u'Kotlin + Compose', u'Direct BLE', u'Offline record access', u'Push reminders'])
    b += (u'<section style="padding-top:0"><div class="wrap">' + cards([
        (u'&#128242;', u'Direct BLE capture',
         u'Talks to the ECG2 sensor, BP cuff and glucometer without a vendor cloud in the middle. Readings '
         u'are signed on the handset.'),
        (u'&#128246;', u'Offline first',
         u'Records and prescriptions are readable with no connection; captures queue and sync when the line returns.'),
        (u'&#128251;', u'Join and stream',
         u'One tap joins the consult and starts streaming vitals; the doctor sees the trace as it is captured.'),
        (u'&#128276;', u'Reminders that mean something',
         u'Medication, refill and follow-up reminders generated from the care plan, not from a generic scheduler.'),
        (u'&#128179;', u'Payments',
         u'UPI and card payments for consults, labs and medicines, with receipts attached to the encounter.'),
        (u'&#128100;', u'Profiles for the family',
         u'Switch between household members with role-based permissions and parental controls for minors.'),
    ]) + u'</div></section>')
    b += cta(u'Want early access on Android?',
             u'The app ships alongside the doctor console. Join the pilot list and we will send a build.',
             (u'contact.html', u'Join the pilot'), (u'devices.html', u'See supported devices'))
    return b

# ================================================================= DOCTOR
def doctor():
    b = page_hero(
        u'For doctors &middot; Aetos One Clinic',
        u'Vitals beside the chart. <span class="grad">Notes that write themselves.</span>',
        u'A console built around the twelve minutes you actually have: the trace on the left, the history '
        u'on the right, the note drafting itself in the middle, and your signature at the end.',
        [u'Live Lead II', u'Ambient scribe', u'e-Rx with interaction checks', u'Urgency-ordered queue'])
    b += (u'<section style="padding-top:0"><div class="wrap">' + cards([
        (u'&#128200;', u'Live vitals panel',
         u'Lead II, BP, SpO&#8322; and glucose streaming in the consult, with the patient&rsquo;s own baseline '
         u'drawn behind the current trace.'),
        (u'&#128221;', u'Ambient scribe',
         u'Drafts a SOAP note while you talk. You edit and sign; nothing enters the record unsigned.'),
        (u'&#128138;', u'e-Prescription',
         u'Indian medication directory, interaction and allergy checks, WhatsApp delivery to the patient.'),
        (u'&#128203;', u'History that loads fast',
         u'Prior encounters, uploaded reports and lab trends on one pane &mdash; OCR&rsquo;d documents included.'),
        (u'&#9203;', u'Queue by urgency',
         u'Intake answers and live vitals reorder the queue, so the chest pain is not behind the repeat prescription.'),
        (u'&#128279;', u'Works beside your EMR',
         u'Run it alongside an incumbent system over FHIR R4 and HL7 v2.5 rather than replacing what works.'),
    ]) + u'</div></section>')
    b += (u'<section style="background:var(--surface);border-block:1px solid var(--stroke)"><div class="wrap">'
          u'<div class="section-head reveal"><span class="eyebrow">Straight answer</span>'
          u'<h2>If you only want a scribe, buy a scribe.</h2>'
          u'<p class="lede" style="margin-top:14px">Eka Care ships EkaScribe at a million sessions across '
          u'fifteen Indian languages, and Arogyam.ai will sell you voice-to-SOAP at &#8377;1,099 a month. '
          u'Both are good products. Choose us when the physiological signal is part of the decision &mdash; '
          u'cardiology, chronic care, post-discharge follow-up, anything where the number on the screen '
          u'changes what you prescribe.</p></div>'
          u'<div class="quote reveal">Our differentiator is not that we write your note. It is that the '
          u'note has a waveform attached to it, captured while you were talking.'
          u'<cite>Aetos One Care &mdash; product positioning, September 2026</cite></div>'
          u'</div></section>')
    b += cta(u'Try it against one real clinic day.',
             u'We will set up a room, hand you the device kit and let you run your own patients through it.',
             (u'contact.html', u'Book a clinical pilot'), (u'compare.html', u'Compare with Eka Care'))
    return b

# ================================================================= ADMIN
def admin():
    b = page_hero(
        u'For hospitals &amp; clinic chains',
        u'Multi-branch control, <span class="grad">audit-grade by default.</span>',
        u'Organisations, branches, credentialing, role-based access and a consent ledger that can answer '
        u'&ldquo;who saw this record, and why&rdquo; without a database query.',
        [u'RBAC by join, not by filter', u'Consent ledger', u'Reason-coded audit', u'Branch analytics'])
    b += (u'<section style="padding-top:0"><div class="wrap">' + cards([
        (u'&#127970;', u'Organisations &amp; branches',
         u'A clinic chain is a first-class object: shared doctors, separate patient pools, per-branch billing '
         u'and reporting.'),
        (u'&#129658;', u'Credentialing',
         u'Registration numbers, specialty, HPR linkage and document expiry, enforced before a doctor can take '
         u'a consult.'),
        (u'&#128273;', u'Access control',
         u'Scope enforced in the query layer by join, so a mis-written filter cannot leak another branch&rsquo;s '
         u'patients.'),
        (u'&#128220;', u'Consent ledger',
         u'Purpose, grant time, expiry and revocation for every data use &mdash; the DPDPA obligation expressed '
         u'as a table you can audit.'),
        (u'&#128202;', u'Operational analytics',
         u'Consult volume, wait time, device utilisation and revenue per branch, refreshed on a schedule you set.'),
        (u'&#128737;&#65039;', u'Audit &amp; retention',
         u'Reason-coded access rows, ~180M/year, compressed at 7 days and partitioned monthly against a '
         u'12-month retention policy.'),
    ]) + u'</div></section>')
    b += (u'<section style="background:var(--surface);border-block:1px solid var(--stroke)"><div class="wrap">'
          u'<div class="section-head reveal"><span class="eyebrow">Deployment</span>'
          u'<h2>Cloud, or inside your walls.</h2></div>'
          u'<div class="grid g3">'
          u'<article class="card reveal"><span class="tag live">Managed</span><h3 style="margin-top:14px">Aetos Cloud</h3>'
          u'<p>Indian data residency, managed upgrades, 99.9% target availability. The default for clinics and '
          u'small chains.</p></article>'
          u'<article class="card reveal"><span class="tag dev">Hybrid</span><h3 style="margin-top:14px">Edge + cloud</h3>'
          u'<p>Device gateway and signal bus on-site for latency and continuity; record and analytics in the '
          u'managed cloud.</p></article>'
          u'<article class="card reveal"><span class="tag plan">Enterprise</span><h3 style="margin-top:14px">On-premise</h3>'
          u'<p>Full stack inside your data centre for institutions with a residency mandate. Bahmni sets the '
          u'expectation here and we meet it.</p></article>'
          u'</div></div></section>')
    b += cta(u'Bring us your procurement checklist.',
             u'Security questionnaire, ABDM milestone evidence, retention policy, exit plan. We would rather '
             u'answer it now than at contract stage.',
             (u'contact.html', u'Request the security pack'), (u'compliance.html', u'Read the compliance posture'))
    return b

# ================================================================= COMPARE
CMP = [
    # seg, name, products, pricing, abdm, loop
    (u'india-consumer', u'eSanjeevani', u'AB-HWC assisted module, OPD module, e-Rx',
     u'Free (GoI)', u'Deepest &mdash; HPR, HFR, ABHA, FHIR', u'<span class="no">&mdash;</span>'),
    (u'india-consumer', u'Practo', u'Consumer app, Practo Plus, Ray, Insta',
     u'Consults from &#8377;199 &middot; Plus &#8377;2,999/yr', u'Provider side only', u'<span class="no">&mdash;</span>'),
    (u'india-consumer', u'Apollo 24|7', u'Apollo app, Clinical Intelligence Engine',
     u'Consults &#8377;399&ndash;&#8377;2,500', u'No claim found', u'<span class="no">&mdash;</span>'),
    (u'india-consumer', u'MediBuddy', u'MediBuddy app, corporate OPD benefits',
     u'Not published (corporate funded)', u'Verified patient-side ABHA', u'<span class="no">&mdash;</span>'),
    (u'india-consumer', u'Tata 1mg', u'E-pharmacy, diagnostics, chat consults',
     u'Consults free (funnel)', u'Not verified', u'<span class="no">&mdash;</span>'),
    (u'india-consumer', u'mfine', u'mfine app, insurer channel, chronic care',
     u'Not published', u'Not verified', u'<span class="no">&mdash;</span>'),
    (u'india-consumer', u'Visit Health', u'Corporate OPD / wellness / EAP suite',
     u'B2B only', u'Not verified', u'<span class="no">&mdash;</span>'),
    (u'india-saas', u'Eka Care', u'EkaScribe, MedAssist, EkaDoc, developer platform + MCP',
     u'&#8377;2,999&ndash;&#8377;27,999/mo &middot; &#8377;16,999&ndash;&#8377;1,00,000/yr',
     u'NHA approved, FHIR', u'<span class="part">Pillo Health only</span>'),
    (u'india-saas', u'Practo Ray + Insta', u'Ray clinic PM/EHR, Insta hospital HMS',
     u'Ray &#8377;999&ndash;&#8377;1,999/mo &middot; Insta &#8377;1,000&ndash;&#8377;1,200/user/mo',
     u'Compliant, milestone not stated', u'<span class="no">&mdash;</span>'),
    (u'india-saas', u'HealthPlix', u'Doctor-first EMR, Rx in 30s, 14 languages',
     u'Not published', u'ABDM / ABHA', u'<span class="no">&mdash;</span>'),
    (u'india-saas', u'KareXpert', u'60+ module HIMS, LIMS, RIS/PACS, Medical IoT',
     u'Quote only', u'Claims M1 + M2 + M3 certified', u'<span class="part">IoT modules</span>'),
    (u'india-saas', u'MocDoc', u'HMS, LIMS, pharmacy, dental / ophthal / ART verticals',
     u'~&#8377;15,000 (third-party listing)', u'ABDM + PMJAY, NPHIES', u'<span class="part">Lab machines</span>'),
    (u'india-saas', u'DocPulse', u'e-Rx, LIMS, IVR scheduling, teleconsult',
     u'Modular, not published', u'ABDM certified + DPDP claim', u'<span class="part">Lab machines</span>'),
    (u'india-saas', u'Healthray', u'OPD/IPD HIMS, specialty EMR, LIMS',
     u'Not published', u'ABDM compliant', u'<span class="no">&mdash;</span>'),
    (u'india-saas', u'MediXcel / Plus91', u'HIS/EMR, LIMS, BHAIRAV Clinical AI, TeleHealth Connect',
     u'Enterprise quote', u'Most verifiable M1&ndash;M3 evidence', u'<span class="no">&mdash;</span>'),
    (u'india-saas', u'Arogyam.ai', u'AI charting, e-Rx, nine named agents',
     u'&#8377;1,099 / &#8377;1,599 / &#8377;2,699 per mo', u'&ldquo;ABDM-ready&rdquo; claim only',
     u'<span class="no">&mdash;</span>'),
    (u'india-saas', u'Clinicea', u'Customisable EMR, video in chart, Compare Visit',
     u'$59 / $69 / $89 per practitioner/mo', u'Not stated', u'<span class="no">&mdash;</span>'),
    (u'india-saas', u'Bahmni', u'OpenMRS + OpenELIS + Odoo + PACS, offline on-prem',
     u'Free &amp; open source', u'Not mentioned', u'<span class="no">&mdash;</span>'),
    (u'devices', u'Dozee', u'Contactless BCG monitor, DEWS early warning',
     u'Quote', u'Not verified', u'<span class="part">Closed silo</span>'),
    (u'devices', u'Tricog', u'InstaECG, InstaEcho, VCardia, KeeboHealth',
     u'Quote', u'Not verified', u'<span class="part">Closed silo</span>'),
    (u'global', u'Teladoc Health', u'Virtual care, Primary360, chronic care',
     u'Payer / employer contracts', u'n/a (US)', u'<span class="part">Program devices</span>'),
    (u'global', u'Amwell', u'Converge platform, Carepoint carts',
     u'Enterprise', u'n/a (US)', u'<span class="part">Cart devices</span>'),
    (u'global', u'Epic Systems', u'Epic EHR, MyChart, Care Everywhere',
     u'Enterprise', u'n/a (US)', u'<span class="part">Via integration</span>'),
    (u'global', u'Oracle Health (Cerner)', u'Millennium EHR, CareAware device connectivity',
     u'Enterprise', u'n/a (US)', u'<span class="yes">CareAware</span>'),
    (u'global', u'One Medical', u'Membership primary care, app + clinics',
     u'$99/yr membership', u'n/a (US)', u'<span class="no">&mdash;</span>'),
    (u'global', u'Verily (Onduo)', u'Virtual diabetes / hypertension clinic, CGM',
     u'Payer contracts', u'n/a (US)', u'<span class="yes">CGM-led</span>'),
    (u'global', u'Omada Health', u'Chronic condition programmes with connected devices',
     u'Employer contracts', u'n/a (US)', u'<span class="part">Program devices</span>'),
    (u'global', u'Propeller Health', u'Sensor inhaler + respiratory adherence',
     u'Pharma / payer', u'n/a (US)', u'<span class="part">Single therapy</span>'),
    (u'global', u'Medisafe', u'Medication adherence app, Medisafe Connect',
     u'Freemium', u'n/a (US)', u'<span class="no">&mdash;</span>'),
    (u'global', u'Doximity', u'Physician network, Dialer telehealth, GPT',
     u'Ad / enterprise', u'n/a (US)', u'<span class="no">&mdash;</span>'),
    (u'global', u'Ada Health', u'Symptom assessment app, enterprise triage API',
     u'Enterprise API', u'n/a (EU)', u'<span class="no">&mdash;</span>'),
    (u'global', u'HealthTap', u'Virtual primary care, Dr. A.I. triage',
     u'From $15/mo', u'n/a (US)', u'<span class="no">&mdash;</span>'),
]

def compare():
    b = page_hero(
        u'Competitive landscape',
        u'Thirty-two products, <span class="grad">one honest table.</span>',
        u'Every provider below was checked against its live site in September 2026. Where we could not '
        u'confirm a claim we say &ldquo;not verified&rdquo; rather than &ldquo;no&rdquo; &mdash; they are '
        u'not the same thing.', actions=False)
    rows = (u'<tr class="us"><td><strong>Aetos One Care</strong></td>'
            u'<td>Care web, Clinic console, Mobile, Admin, Signal device layer</td>'
            u'<td>Published &mdash; see <a href="pricing.html" style="color:var(--signal)">pricing</a></td>'
            u'<td>M1&ndash;M3 on the roadmap, FHIR R4 core</td>'
            u'<td><span class="yes">Core product</span></td></tr>')
    for seg, name, prods, price, abdm, loop in CMP:
        rows += (u'<tr data-seg="%s"><td><strong>%s</strong></td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>'
                 % (seg, name, prods, price, abdm, loop))
    b += (u'<section style="padding-top:0"><div class="wrap">'
          u'<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:22px">'
          u'<label class="mono" style="font-size:.78rem;letter-spacing:.1em;color:var(--ink-3)">SEGMENT</label>'
          u'<select id="cmp-filter" style="background:var(--surface);border:1px solid var(--stroke);'
          u'color:var(--ink);padding:10px 14px;border-radius:10px;font-family:inherit">'
          u'<option value="all">All 32 products</option>'
          u'<option value="india-consumer">India &mdash; teleconsult &amp; consumer</option>'
          u'<option value="india-saas">India &mdash; clinic &amp; hospital SaaS</option>'
          u'<option value="devices">India &mdash; devices &amp; RPM</option>'
          u'<option value="global">Global reference set</option></select></div>'
          u'<div class="table-wrap reveal"><table><thead><tr>'
          u'<th>Provider</th><th>Products shipped</th><th>Published pricing</th>'
          u'<th>ABDM / interop</th><th>Device-in-consult</th></tr></thead><tbody>'
          + rows + u'</tbody></table></div></div></section>')
    b += (u'<section style="background:var(--surface);border-block:1px solid var(--stroke)"><div class="wrap">'
          u'<div class="section-head reveal"><span class="eyebrow">What the table says</span>'
          u'<h2>Four findings we did not want to be true.</h2></div>' + cards([
              (u'&#129337;', u'Eka Care is ahead on AI',
               u'Ninety thousand doctors, an ambient scribe at a million sessions and the only mature public '
               u'API in the market. If the scribe is all you need, they are the safer buy today.'),
              (u'&#128176;', u'Arogyam.ai resets the price floor',
               u'&#8377;1,099 a month for voice-to-SOAP and nine agents changes what a small clinic expects '
               u'to pay. Any pricing above that needs a reason attached.'),
              (u'&#127963;&#65039;', u'eSanjeevani gives away the assisted consult',
               u'Forty-three crore consultations, free. Competing on the nurse-assisted flow alone is '
               u'competing with the Government of India.'),
              (u'&#128295;', u'Bahmni is the build-vs-buy floor',
               u'Zero licence cost, offline, on-premise. Any customer with engineers can deploy it &mdash; '
               u'so &ldquo;we wrote our own OpenMRS&rdquo; is not an answer.'),
          ], u'g2') + u'</div></section>')
    b += (u'<section><div class="wrap"><div class="callout reveal">'
          u'<h3>Only four vendors in the entire Indian survey publish a price.</h3>'
          u'<p>Practo Ray, Eka Care, Arogyam.ai and Clinicea. Everyone else quotes. We publish, because an '
          u'information vacuum is a trust problem, not a negotiating advantage.</p>'
          u'<div class="btn-row"><a class="btn btn-primary" href="pricing.html">See our pricing ' + ARROW + u'</a></div>'
          u'</div></div></section>')
    b += cta(u'Think we scored you wrong?',
             u'If you are one of the vendors above and something here is out of date, send us the page and we '
             u'will correct it with a dated note.',
             (u'contact.html', u'Send a correction'), (u'platform.html', u'See our architecture'))
    return b

# ================================================================= COMPLIANCE
def compliance():
    b = page_hero(
        u'Trust &amp; compliance',
        u'The 2026 rulebook, <span class="grad">read properly.</span>',
        u'CDSCO&rsquo;s final Medical Device Software guidance landed in July 2026 and classifies by '
        u'function, not by disclaimer. DPDPA obligations are on a firm calendar. ABDM certification is a '
        u'paid, gated process. Here is exactly where we stand.', actions=False)
    b += (u'<section id="cdsco" style="padding-top:0"><div class="wrap">' + cards([
        (u'&#129521;', u'CDSCO &mdash; software as a device',
         u'The July 2026 guidance classifies by what the software does. Our screening-scope labelling is '
         u'enforced in product, a predetermined change control plan sits with each model, and rhythm '
         u'classification stays behind a feature flag until cleared.'),
        (u'&#128220;', u'DPDPA 2023',
         u'Consent is an object with a purpose, an expiry and a revocation path. Data-principal rights '
         u'&mdash; access, correction, erasure &mdash; are product features, not support tickets.'),
        (u'&#127760;', u'ABDM',
         u'ABHA creation and linking, HIP/HIU consent flows and HFR-registered facilities. Milestones M1 to '
         u'M3 are on the roadmap with sandbox exit, functional testing and the Safe-to-Host certificate '
         u'budgeted rather than assumed.'),
        (u'&#128273;', u'Security',
         u'AES-256-GCM at rest, TLS 1.3 in transit, RBAC enforced in the query layer by join, and Indian '
         u'data residency by default.'),
        (u'&#128202;', u'Audit &amp; retention',
         u'Every record access carries a user, a record, an action, a timestamp and a reason code. Monthly '
         u'partitions, 12-month regulatory retention, compression at seven days.'),
        (u'&#9878;&#65039;', u'Practitioner-anchored',
         u'There is no standalone licensing regime for telemedicine platforms in India &mdash; regulation '
         u'attaches to the practitioner. Every clinical output is attributed to a registered doctor who signs it.'),
    ]) + u'</div></section>')
    b += (u'<section id="security" style="background:var(--surface);border-block:1px solid var(--stroke)">'
          u'<div class="wrap"><div class="section-head reveal"><span class="eyebrow">Stated plainly</span>'
          u'<h2>What we have, and what we do not &mdash; yet.</h2></div>'
          u'<div class="table-wrap reveal"><table><thead><tr><th>Item</th><th>Status</th><th>Note</th></tr></thead>'
          u'<tbody>'
          u'<tr><td><strong>FHIR R4 record core</strong></td><td class="yes">Shipping</td>'
          u'<td>Encounters, observations, prescriptions, waveform segments</td></tr>'
          u'<tr><td><strong>HL7 v2.5 export</strong></td><td class="yes">Shipping</td><td>Lab and order interfaces</td></tr>'
          u'<tr><td><strong>DPDPA consent ledger</strong></td><td class="yes">Shipping</td>'
          u'<td>Purpose-bound, revocable, audited</td></tr>'
          u'<tr><td><strong>ABDM M1 &mdash; ABHA linking</strong></td><td class="part">In progress</td>'
          u'<td>Sandbox integration complete; production gated on HFR-registered partner facilities</td></tr>'
          u'<tr><td><strong>ABDM M2 / M3</strong></td><td class="part">Planned</td>'
          u'<td>Consent and PHR approval flows; functional testing and Safe-to-Host budgeted</td></tr>'
          u'<tr><td><strong>ISO 27001 certification</strong></td><td class="part">Controls in place</td>'
          u'<td>Certification audit scheduled; controls implemented ahead of it</td></tr>'
          u'<tr><td><strong>CDSCO device clearance</strong></td><td class="no">Not held</td>'
          u'<td>Screening-scope only today. Diagnostic claims require clearance and we make none.</td></tr>'
          u'<tr><td><strong>NHCX claims</strong></td><td class="part">Ready</td>'
          u'<td>Exchange went live June 2026; integration scoped for when insurance enters scope</td></tr>'
          u'</tbody></table></div>'
          u'<p class="muted" style="margin-top:16px;font-size:.86rem">We would rather lose a deal on a '
          u'checklist than win one on a claim we cannot evidence.</p></div></section>')
    b += cta(u'Request the full security pack.',
             u'Architecture diagram, data-flow map, retention policy, sub-processor list, exit plan and the '
             u'answers to the standard hospital questionnaire.',
             (u'contact.html', u'Request the pack'), (u'admin.html', u'Deployment options'))
    return b

# ================================================================= PRICING
def pricing():
    b = page_hero(
        u'Pricing',
        u'Published, because <span class="grad">almost nobody else does.</span>',
        u'Four vendors in the entire Indian survey publish a price. Here is ours, per clinic, per month, '
        u'excluding GST. Device kits are quoted separately because hardware is hardware.', actions=False)
    plans = [
        (u'', u'Practice', u'&#8377;1,899', u'per clinic / month',
         u'Single-location clinics up to 3 doctors getting the loop working.',
         [u'Patient web + patient app', u'Doctor console, 3 seats', u'Live vitals for 2 paired devices',
          u'Ambient scribe, 400 sessions/mo', u'FHIR R4 record + 6-format export', u'Email support, 48h']),
        (u'featured', u'Clinic Pro', u'&#8377;4,499', u'per clinic / month',
         u'Multi-doctor clinics and small chains running real device workflows.',
         [u'Everything in Practice', u'Unlimited doctor seats per branch', u'Unlimited paired devices',
          u'Ambient scribe, unlimited', u'Consent ledger + reason-coded audit', u'ABHA linking (as milestones land)',
          u'WhatsApp Rx delivery', u'Priority support, 8h']),
        (u'', u'Enterprise', u'Quote', u'hospitals &amp; chains',
         u'Multi-branch hospitals, on-premise mandates and custom integration.',
         [u'Everything in Clinic Pro', u'Hybrid or on-premise deployment', u'HL7 v2.5 lab / HIMS interfaces',
          u'SSO, custom RBAC, data residency', u'Security questionnaire + exit plan', u'Named implementation lead']),
    ]
    b += u'<section style="padding-top:0"><div class="wrap"><div class="plans">'
    for cls, name, price, unit, sub, items in plans:
        ribbon = u'<span class="ribbon">Most clinics</span>' if cls else u''
        li = u"".join(u'<li>%s</li>' % i for i in items)
        b += (u'<div class="plan %s reveal">%s<h3>%s</h3>'
              u'<div class="price">%s</div><div class="muted" style="font-size:.88rem">%s</div>'
              u'<p style="margin-top:14px;color:var(--ink-2);font-size:.94rem">%s</p>'
              u'<ul>%s</ul>'
              u'<a class="btn %s" style="margin-top:26px;width:100%%;justify-content:center" href="contact.html">%s</a>'
              u'</div>' % (cls, ribbon, name, price, unit, sub, li,
                           u'btn-primary' if cls else u'btn-ghost',
                           u'Start a pilot' if cls else u'Talk to us'))
    b += u'</div>'
    b += (u'<p class="muted" style="margin-top:22px;font-size:.88rem">All prices exclude 18% GST. Device kits '
          u'(ECG2 sensor, BP cuff, oximeter, glucometer) are quoted per unit and can be purchased or rented. '
          u'Annual commitments carry a 15% discount. No charge for patient accounts &mdash; patients never pay '
          u'to read their own record.</p></div></section>')
    b += (u'<section style="background:var(--surface);border-block:1px solid var(--stroke)"><div class="wrap">'
          u'<div class="section-head reveal"><span class="eyebrow">Market context</span>'
          u'<h2>What everyone else charges.</h2>'
          u'<p class="lede" style="margin-top:14px">Published figures only, verified September 2026. Use it '
          u'to hold us to a number.</p></div>'
          u'<div class="table-wrap reveal"><table><thead><tr><th>Product</th><th>Entry</th><th>Mid</th>'
          u'<th>Top</th><th>Notes</th></tr></thead><tbody>'
          u'<tr class="us"><td><strong>Aetos One Care</strong></td><td>&#8377;1,899/mo</td><td>&#8377;4,499/mo</td>'
          u'<td>Quote</td><td>Device loop included; + 18% GST</td></tr>'
          u'<tr><td><strong>Arogyam.ai</strong></td><td>&#8377;1,099/mo</td><td>&#8377;1,599/mo</td>'
          u'<td>&#8377;2,699/mo</td><td>Early-stage; top tier covers 6 doctors</td></tr>'
          u'<tr><td><strong>Practo Ray</strong></td><td>&#8377;999/mo</td><td>&#8377;1,999/mo</td><td>&mdash;</td>'
          u'<td>&#8377;999 on a 4-year commit</td></tr>'
          u'<tr><td><strong>Practo Insta</strong></td><td>&#8377;1,000/user/mo</td><td>&#8377;1,200/user/mo</td>'
          u'<td>&mdash;</td><td>Min 5 users OP, 10 users IP</td></tr>'
          u'<tr><td><strong>Eka Care</strong></td><td>&#8377;2,999/mo</td><td>&#8377;5,999&ndash;9,999/mo</td>'
          u'<td>&#8377;27,999/mo</td><td>Annual &#8377;16,999&ndash;&#8377;1,00,000; + 18% GST</td></tr>'
          u'<tr><td><strong>Clinicea</strong></td><td>$59/practitioner/mo</td><td>$69</td><td>$89</td>'
          u'<td>Lab, pharmacy and portal add-ons extra</td></tr>'
          u'<tr><td><strong>Practo Plus</strong> (consumer)</td><td>&#8377;1,199/mo</td><td>&#8377;2,499/qtr</td>'
          u'<td>&#8377;2,999/yr</td><td>Capped 5/day, 15/month</td></tr>'
          u'<tr><td><strong>eSanjeevani &middot; Bahmni</strong></td><td colspan="3">Free</td>'
          u'<td>Government platform; open-source stack</td></tr>'
          u'</tbody></table></div></div></section>')
    faqs = [
        (u'Why are you more expensive than Arogyam.ai?',
         u'Because the device layer is not free to run &mdash; registry, streaming, replay storage and '
         u'provenance. If you do not need live vitals, their price is honestly the better deal.'),
        (u'Do patients pay?', u'No. Patient accounts, record access and export are free. Charging someone '
         u'to read their own medical history is not a business model we want.'),
        (u'What happens to our data if we leave?',
         u'You get a full FHIR R4 export plus HL7 v2.5 interfaces and the raw waveform archive, within '
         u'30 days, at no charge. The exit plan is in the contract, not a goodwill gesture.'),
    ]
    b += u'<section><div class="wrap" style="max-width:860px">'
    for q, a in faqs:
        b += u'<details class="faq reveal"><summary>%s</summary><p>%s</p></details>' % (q, a)
    b += u'</div></section>'
    b += cta(u'Run the numbers with us.',
             u'Tell us your clinic size, device mix and current vendor. We will price it and say plainly if '
             u'switching is not worth it.')
    return b

# ================================================================= CONTACT
def contact():
    b = page_hero(
        u'Talk to us',
        u'Thirty minutes, <span class="grad">a real clinical scenario.</span>',
        u'No slide deck first. Bring a workflow, we bring the device kit, and you see the loop run end to end.',
        actions=False)
    form = (u'<form class="card reveal" data-demo style="padding:34px">'
            u'<div class="grid g2" style="gap:18px">'
            u'<div class="field"><label for="n">Name</label><input id="n" name="name" required></div>'
            u'<div class="field"><label for="o">Organisation</label><input id="o" name="org"></div>'
            u'<div class="field"><label for="e">Work email</label><input id="e" type="email" name="email" required></div>'
            u'<div class="field"><label for="p">Phone</label><input id="p" name="phone"></div>'
            u'</div>'
            u'<div class="field"><label for="r">You are</label><select id="r" name="role">'
            u'<option>A clinic or hospital</option><option>A doctor in practice</option>'
            u'<option>A device manufacturer</option><option>A patient</option>'
            u'<option>An investor or partner</option></select></div>'
            u'<div class="field"><label for="m">What would you like to see?</label>'
            u'<textarea id="m" name="message" rows="4" placeholder="e.g. post-discharge cardiac follow-up '
            u'with ECG at home"></textarea></div>'
            u'<button class="btn btn-primary btn-lg" type="submit" style="width:100%;justify-content:center">'
            u'Request a demo</button>'
            u'<p data-result hidden class="muted" style="margin-top:16px;font-size:.9rem"></p>'
            u'</form>')
    side = (u'<div class="reveal"><h3>Direct lines</h3>'
            u'<p class="lede" style="font-size:1rem;margin-top:12px">Aetos Tech Labs LLP<br>'
            u'<span class="mono" style="font-size:.9rem">hello@aetostechlabs.com</span></p>'
            u'<div style="display:grid;gap:14px;margin-top:28px">'
            u'<div class="card" style="padding:22px"><h3 style="font-size:1.05rem">Clinical pilots</h3>'
            u'<p>We run a small number of pilots at a time so each one gets a named engineer.</p></div>'
            u'<div class="card" id="partners" style="padding:22px"><h3 style="font-size:1.05rem">Device partners</h3>'
            u'<p>Send the GATT profile or API doc. We answer integration feasibility within a week.</p></div>'
            u'<div class="card" style="padding:22px"><h3 style="font-size:1.05rem">Procurement</h3>'
            u'<p>Ask for the security pack: architecture, data-flow map, retention, sub-processors, exit plan.</p></div>'
            u'</div></div>')
    b += (u'<section style="padding-top:0"><div class="wrap"><div class="grid g2" style="gap:44px;align-items:start">'
          + form + side + u'</div></div></section>')
    return b

# ================================================================= BUILD
PAGES = [
    (u"index.html", u"Aetos One Care — live device data inside live consultations",
     u"India's care platform where ECG, BP, SpO2 and glucose stream into the consult and into an ABDM-linked FHIR record.",
     home),
    (u"platform.html", u"Platform — Aetos One Care",
     u"Capture, stream, decide, persist: the architecture behind device-led consultations.", platform),
    (u"devices.html", u"Device layer — Aetos One Signal",
     u"BLE ECG, blood pressure, SpO2 and glucose with a device registry, quality scoring and replay.", devices),
    (u"care.html", u"For patients — Aetos One Care",
     u"Book, consult, track and export your medical record in six formats, with family accounts.", care),
    (u"mobile.html", u"Patient app — Aetos One Care",
     u"Android app with direct BLE device capture, offline records and live vitals streaming.", mobile),
    (u"doctor.html", u"For doctors — Aetos One Clinic",
     u"Live vitals beside the chart, ambient scribe, e-prescription with interaction checks.", doctor),
    (u"admin.html", u"For hospitals — Aetos One Admin",
     u"Multi-branch management, credentialing, RBAC, consent ledger and reason-coded audit.", admin),
    (u"compare.html", u"Compare — 32 healthtech products",
     u"Aetos One Care against Eka Care, Apollo 24|7, Practo, Dozee, Tricog and 27 more, verified Sep 2026.", compare),
    (u"compliance.html", u"Trust & compliance — Aetos One Care",
     u"CDSCO software guidance, DPDPA 2023, ABDM milestones and our security posture, stated plainly.", compliance),
    (u"pricing.html", u"Pricing — Aetos One Care",
     u"Published per-clinic pricing, plus what every other Indian vendor charges.", pricing),
    (u"contact.html", u"Contact — Aetos One Care",
     u"Book a 30-minute demo with a real clinical scenario and a live device kit.", contact),
]

if __name__ == "__main__":
    total = 0
    for fn, title, desc, fn_body in PAGES:
        n = page(fn, title, desc, fn_body())
        total += n
        print("%-18s %7d bytes" % (fn, n))
    print("---\n%d pages, %.1f KB" % (len(PAGES), total / 1024.0))
