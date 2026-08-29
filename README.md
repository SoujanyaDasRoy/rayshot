# RayShot 🎬

> A modern, browser-native desktop-class creative video editor powered by Svelte 5 (Runes), SvelteKit 2, Web Workers, IndexedDB, and the Web Audio API.

---

## ✨ Features

- **5-Pillar Creative Rail**: Fast navigation between **Media** (▦), **Text** (T), **Audio** (♫), **Effects** (✨), and **Transitions** (↔).
- **Pro Multitrack Timeline**: Layered tracks with video filmstrips, audio waveform textures, magnetic snapping, and interactive clip trimming / splitting.
- **Contextual Inspector**: Progressive disclosure for transform (X/Y/Scale/Rotation), opacity, audio parameters, volume, and visual filters.
- **High-Performance Architecture**:
  - **Web Workers**: Dedicated worker threads for thumbnail generation and waveform extraction off the main thread.
  - **IndexedDB Asset Cache**: Fast local caching of media blobs, thumbnails, and waveforms.
  - **OPFS Project Persistence**: Sandboxed Origin Private File System project storage with debounced auto-save and seamless recovery across refreshes.
  - **Web Audio API Mixing Graph**: Real-time multi-track mixing with `GainNode`, `StereoPannerNode`, and master dynamic range compression.
- **Responsive 16:9 Canvas & Transport Controls**: Precise seekbar, timecode display (`00:00.00 / 00:00.00`), frame stepping, speed control, and full-resolution export engine.

---

## 📁 Documentation

All product specifications and design documents are located in [`docs/`](./docs/):
- [`docs/RayShot_Vision.md`](./docs/RayShot_Vision.md) — Product Vision & Philosophy
- [`docs/RayShot_PRD.md`](./docs/RayShot_PRD.md) — Product Requirements Document
- [`docs/RayShot_HLD.md`](./docs/RayShot_HLD.md) — High-Level Design & Architecture
- [`docs/RayShot_Technical_Requirements.md`](./docs/RayShot_Technical_Requirements.md) — Technical Specifications

---

## 🛠️ Getting Started

### Prerequisites
- Node.js `20+` (Tested on Node `24`)
- npm / pnpm / yarn

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```

### Type Checking & Linting
```bash
npm run check
npm run lint
```

### Running Tests
```bash
npm run test:unit -- --run
```

### Production Build
```bash
npm run build
npm run preview
```

---

## 📄 License
MIT
