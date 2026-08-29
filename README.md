# RAYSHOT ⚡

> **The next-generation, browser-native video editing workstation.**  
> Fast. Private. Zero-install. Built for modern creators.

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/z2mNFZYzW4)
[![Svelte 5](https://img.shields.io/badge/Svelte-5.0%20(Runes)-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 💡 What is RayShot?

**RayShot** is a desktop-class non-linear video editor (NLE) that runs completely inside the browser. It combines the clean, frictionless editing flow of modern consumer tools with the speed, precision, and multitrack power of professional creative software.

No mandatory logins. No watermarks. No uploading gigabytes of private footage to cloud servers. Everything is processed locally on your hardware.

---

## 🎯 What We Aim to Do

Traditional video editors are heavy, bloated, and tied to desktop installations. Most web video editors compromise on performance, lock basic features behind paywalls, or force slow cloud uploads before you can even make a cut.

**RayShot is built on three core pillars:**
- **⚡ Zero-Lag Editing**: Non-blocking Web Worker threads and local caching keep the interface responsive even with large video files.
- **🔒 100% Privacy**: Your media files stay sandboxed on your device. Zero remote tracking or server-side media processing required.
- **🎨 Beginner-Friendly, Power-Ready**: A calm, contextual interface that gets out of your way — simple for first-time creators while providing frame-accurate splitting, multitrack audio mixing, and granular transform controls.

---

## ✨ Key Features

- **5-Pillar Creative Rail**: Instant category switching between **Media** (▦), **Text** (T), **Audio** (♫), **Effects** (✨), and **Transitions** (↔).
- **Pro Multitrack Timeline**: Multi-layered video and audio tracks, visual filmstrip thumbnails, audio waveforms, magnetic snapping, and interactive clip splitting (`S`).
- **Contextual Inspector**: Dynamically displays only what's relevant to the active clip — Transforms (X/Y/Scale/Rotation), Opacity, Audio Volume, and Visual Adjustments.
- **Responsive 16:9 Canvas & Transport**: Monospace timecodes, frame stepping (◀/▶), smooth playhead scrubbing, and live multi-track preview.
- **Auto-Save & Project Recovery**: Automatic sandboxed project persistence so you never lose your progress on page refresh.

---

## 🏗️ Architecture & Tech Stack

RayShot is engineered from the ground up for modern web browsers without requiring backend infrastructure:

```
┌─────────────────────────────────────────────────────────────┐
│                         RAYSHOT UI                          │
│           (Svelte 5 Runes • Tailwind CSS v4)                │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐┌──────────────▼───────────────┐
│     COMMAND & STATE BUS     ││      WEB WORKER THREADS      │
│  - Command Pattern History  ││  - Thumbnail Filmstrips      │
│  - Reactive Svelte Stores   ││  - Audio Waveform Analysis   │
└──────────────┬──────────────┘└──────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────────────────────▼───────────────┐
│                    PERSISTENCE & STORAGE                    │
│  - OPFS (Origin Private File System) — Project Auto-Save    │
│  - IndexedDB Cache — Media Blobs & Waveform Peaks           │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐┌──────────────▼───────────────┐
│    WEB AUDIO API GRAPH      ││       EXPORT ENGINE          │
│  GainNode • Panner • Comp   ││ WebCodecs / MediaRecorder    │
└─────────────────────────────┘└──────────────────────────────┘
```

### Core Technologies
- **Framework**: [Svelte 5](https://svelte.dev) (Runes architecture: `$state`, `$derived`, `$props`, `$effect`)
- **Application Engine**: [SvelteKit 2](https://kit.svelte.dev)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) (Dark obsidian workstation aesthetic)
- **Storage**: **OPFS** (Origin Private File System) + **IndexedDB**
- **Audio Engine**: **Web Audio API** (`AudioContext`, `GainNode`, `DynamicsCompressorNode`)
- **Language**: **TypeScript** (Strict mode)
- **Testing**: [Vitest](https://vitest.dev) (190+ test suite) & [Playwright](https://playwright.dev)

---

## 📁 Documentation

Technical designs and product specifications are available in the [`docs/`](./docs/) directory:
- [`docs/RayShot_Vision.md`](./docs/RayShot_Vision.md) — Product Philosophy & Vision
- [`docs/RayShot_PRD.md`](./docs/RayShot_PRD.md) — Product Requirements Document
- [`docs/RayShot_HLD.md`](./docs/RayShot_HLD.md) — High-Level Architecture Design
- [`docs/RayShot_Technical_Requirements.md`](./docs/RayShot_Technical_Requirements.md) — Technical Specifications

---

## 💬 Community & Support

Join the creator and developer community on Discord to share feedback, ask questions, or contribute:

[![Join Discord](https://img.shields.io/badge/Discord-Join%20Server-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/z2mNFZYzW4)

👉 **[https://discord.gg/z2mNFZYzW4](https://discord.gg/z2mNFZYzW4)**

---

## 🚀 Getting Started

### Prerequisites
- Node.js `20+` (Tested on Node `24`)
- npm, pnpm, or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/SoujanyaDasRoy/rayshot.git
cd rayshot

# Install dependencies
npm install

# Start development server
npm run dev
```

### Development Scripts
| Command | Action |
|:---|:---|
| `npm run dev` | Start development server at `http://localhost:5173` |
| `npm run check` | Run TypeScript & Svelte compiler checks (0 errors) |
| `npm run test:unit -- --run` | Run the Vitest unit test suite (100% passing) |
| `npm run build` | Generate production build |
| `npm run preview` | Preview production build locally |

---

## 📄 License
MIT License © 2026 [Soujanya Das Roy](https://github.com/SoujanyaDasRoy)
