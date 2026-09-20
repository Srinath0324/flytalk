# 🪰 FlyTalk: Talk Shit to an Actual Fruit-Fly Connectome

> **“Talk shit to an actual fruit-fly connectome.”**
>
> You make hand gestures into your webcam (or press keys 1–8). Those gestures are translated into biologically real visual stimuli that fire into the **actual connectome of a male fruit fly (*Drosophila melanogaster*)** released by **HHMI Janelia & Google Research (MaleCNS v1.0)**. 
>
> The signals propagate through **5,000 real neurons and ~150,000 real synaptic connections**. When motor neurons fire, the virtual fly reacts in real time—and a Gen-Z translation layer roasts you based on its actual neural state.

---

## 📑 Table of Contents
1. [What is This Project?](#-what-is-this-project)
2. [How It Works (System Architecture)](#-how-it-works-system-architecture)
3. [Neurobiology: How Gestures Connect to the Fly Brain](#-neurobiology-how-gestures-connect-to-the-fly-brain)
4. [Gesture & Behavior Reference Table](#-gesture--behavior-reference-table)
5. [Tech Stack](#-tech-stack)
6. [Quick Start & How to Run](#-quick-start--how-to-run)
7. [How to Demo (Presentation Guide)](#-how-to-demo-presentation-guide)
8. [Project Structure](#-project-structure)

---

## 🧠 What is This Project?

Most chatbots pretend to have a brain using Large Language Models. **FlyTalk does the opposite:** it gives an actual biological brain a funny voice.

We extracted a functional 5,000-neuron subnetwork from the **Janelia MaleCNS v1.0 connectome**—the most comprehensive synaptic wiring diagram of an adult male fruit fly central nervous system ever mapped by electron microscopy.

When you flip off the webcam or wave your hand, you aren't triggering a canned animation. You are injecting simulated visual signals into lobula columnar visual projection neurons (**LC4, LPLC2, LC10a, LC16**). Activity cascades through intermediate circuits into real descending motor neurons (**DNp01, MDN, DNa02, DNp09**). 

The fly's behavior—fleeing, backing up, turning left/right, approaching, or freezing—is decoded directly from this neural cascade.

---

## ⚙️ How It Works (System Architecture)

```
┌─────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│  Human Action   │  ───> │ Gesture Classification │  ───> │ Visual Stimulus Mapper │
│ Webcam / Keys   │       │ MediaPipe HandLandmark │       │ (stimuli.ts)           │
└─────────────────┘       └────────────────────────┘       └────────────────────────┘
                                                                       │
                                                                       ▼
┌─────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│ Virtual Fly &   │  <─── │ Behavior Decoder       │  <─── │ Real MaleCNS Connectome│
│ Gen-Z Dialogue  │       │ (engine.ts)            │       │ 5,000 Neurons / 150k W │
└─────────────────┘       └────────────────────────┘       └────────────────────────┘
```

1. **Input Stage**:
   - **Webcam**: MediaPipe `HandLandmarker` tracks 21 3D hand landmarks in real time.
   - **Keyboard Fallback**: Number keys `1` through `8` immediately trigger gestures without needing a camera.
2. **Visual Stimulus Mapping**:
   - Gestures are converted to activations in specific visual projection neurons based on real fly neuroanatomy.
3. **Connectome Simulation Engine**:
   - Runs a leaky-integrator rate model at **50 Hz** (20 ms timesteps).
   - Computes signal propagation across 149,588 synaptic edges with normalized weights.
4. **Behavioral Decoding**:
   - Decodes activity from 5 output channels corresponding to descending motor pathways.
5. **Stage & Dialogue**:
   - Animated SVG fly responds with realistic movement and wing flutters.
   - Fly "replies" in real-time chat with Gen-Z roasts matched to its neurological state.

---

## 🔬 Neurobiology: How Gestures Connect to the Fly Brain

The fruit fly brain doesn't see "middle fingers" or "waves"—it sees optical flow, expanding edges (looming), and moving targets. Here is the real neuroscience under the hood:

### 1. Visual Input Populations (Lobula Columnar Neurons)
* **LC4 & LPLC2 (Looming Detectors)**: Fire vigorously when an object rapidly expands in the visual field (simulating an incoming predator or swatter).
* **LC10a (Target Tracking)**: Fires when small moving objects cross the visual field. Crucial for courtship, following, and orientation.
* **LC16 (Threat / Retreat)**: Sensitive to approaching visual stimuli, associated with backward walking and avoidance.

### 2. Descending Motor Neurons (The Output)
* **DNp01 (Giant Fiber Neuron)**: The master escape command neuron. Activating the Giant Fiber triggers an all-or-nothing jump-and-flight escape sequence.
* **MDN (Moonwalker Descending Neuron)**: Controls backward walking (retreating away from noxious stimuli).
* **DNa02 (Steering Neuron)**: Unilateral activation drives lateral turning and banking (left vs. right).
* **DNp09 (Walking / Approach)**: Drives forward walking and approach behaviors.

---

## 📊 Gesture & Behavior Reference Table

| Key | Gesture | Visual Stimulus | Stimulated Neurons | Motor Neurons Activated | Fly Behavior | Example Gen-Z Trash Talk |
|:---:|:---|:---|:---|:---|:---|:---|
| **`1`** | 👋 **Wave** | Moving Object | `LC10a_L` + `LC10a_R` (alternating) | `DNa02` (bilateral steering) | **CONFUSED / STOP** | *"the neurons have entered a group discussion."* |
| **`2`** | 👈 **Point Left** | Left Visual Cue | `LC10a_L` | `DNa02_L` | **MOVE_LEFT** | *"aight damn"*, *"recalculating. against my will."* |
| **`3`** | 👉 **Point Right** | Right Visual Cue | `LC10a_R` | `DNa02_R` | **MOVE_RIGHT** | *"bro thinks he’s my GPS 💀"*, *"scenic route."* |
| **`4`** | ☝️ **Come Here** | Bilateral Object Cue | `LC10a` | `DNp09` | **APPROACH** | *"why are you summoning me 😭"*, *"rare human W"* |
| **`5`** | ✋ **Stop (Open Palm)** | Stimulus Withdrawn | *(none)* | Decaying activity | **STOP / IDLE** | *"bro said ✋ like he’s traffic police"*, *"buffering."* |
| **`6`** | 🫸 **Go Away (Push)** | Moderate Looming | `LC16` + `LC4` + `LPLC2` | `MDN` | **RETREAT** | *"this meeting could have been a pheromone."* |
| **`7`** | 🖕 **Insult (Middle)** | **Strong Looming Predator** | `LC4` (100%) + `LPLC2` (100%) | **`DNp01` (Giant Fiber)** | **ESCAPE 🚨** | *"crazy coming from a species with student loans 💀"* |
| **`8`** | 👍 **Be Nice (Thumb)** | Gentle Object Cue | `LC10a` (30%) | Low `DNp09` | **APPROACH / IDLE** | *"acceptable mammal behavior."*, *"finally, enrichment."* |

---

## 💻 Tech Stack

- **Frontend & Framework**: Next.js 15 / Vinext, React 19, TypeScript
- **Styling**: Tailwind CSS, dark sci-fi theme with animated SVG arena
- **Computer Vision**: `@mediapipe/tasks-vision` (HandLandmarker)
- **Connectome Data Pipeline**: Python 3.12, PyArrow, NumPy (streamed feather processing)
- **Dataset**: Janelia MaleCNS v1.0 (CC-BY-4.0 license)

---

## 🚀 Quick Start & How to Run

### Prerequisites
- **Node.js**: `>= 22.13.0`
- **Modern Web Browser**: Chrome, Edge, Brave, or Firefox

### Step 1: Open the Web Directory & Install Dependencies
```powershell
cd web
npm install
```

*(Note: The connectome data is already preprocessed and packaged inside `web/public/data/`, so you don't need to download the 1GB raw file again!)*

### Step 2: Start the Application
```powershell
npm run dev
```

### Step 3: Open in Browser
Open your browser and navigate to:
👉 **`http://localhost:3000`**

---

## 🧪 Testing the Simulation Engine (Headless)

You can run the connectome simulation engine entirely from the terminal without opening a browser:

```powershell
cd web
npx tsx scripts/calibrate.ts
```

This runs all 8 gestures through the real 5,000-neuron connectome, measures peak channel activations across `escape`, `retreat`, `left`, `right`, and `approach`, and outputs state transition traces.

---

## 🎬 How to Demo (Presentation Guide)

When presenting this project to judges, colleagues, or friends, follow this simple 3-step walkthrough:

### 1. Show the Neutral State (Idle)
- Point out the header: **5,000 real neurons** and **149,588 synapses** loaded from Janelia MaleCNS v1.0.
- Point to the central arena: the fruit fly (*Drosophila melanogaster*) is idling and hovering gently.
- Point to the right sidebar: the 5 neural activity channels (`escape`, `retreat`, `left`, `right`, `approach`) are near 0%.

### 2. Trigger the Escape Reflex (The "Middle Finger" / Predator Loom)
- Press key **`7`** or click **🖕 Insult**.
- **What happens:**
  1. `LC4` and `LPLC2` looming neurons fire at 100%.
  2. Signal propagates to `DNp01` (Giant Fiber).
  3. The **ESCAPE** channel meter spikes to 100% in red.
  4. The fly's wings flutter frantically, its body glows red, and it darts across the arena.
  5. The fly roasts you in the chat: *"crazy coming from a species with student loans"*.

### 3. Steer the Fly & Beckon It
- Press **`2`** (👈 Point Left) or **`3`** (👉 Point Right): Notice the fly rotates and turns laterally as the steering channel activates.
- Press **`4`** (☝️ Come Here): Watch the fly approach forward and scale up as `approach` spikes.
- Click **"Enable Camera"** to demonstrate live hands-free webcam interaction using MediaPipe.

---

## 📁 Project Structure

```
flytalk/
├── data/raw/                 # Raw Janelia connectome feather files (~1.1GB)
├── scripts/
│   ├── download_connectome.py   # Resumable downloader for MaleCNS files
│   ├── preprocess_connectome.py # Extracts 5,000-neuron subnetwork via BFS
│   └── setup.mjs                # Master setup orchestrator
├── web/
│   ├── app/
│   │   ├── globals.css          # Sci-fi UI styles & fly animations
│   │   ├── layout.tsx           # Root Next.js layout (dark mode)
│   │   └── page.tsx             # Entry page (mounts FlyTalkApp)
│   ├── public/
│   │   ├── data/                # Connectome binaries (manifest.json, weights.f32, etc.)
│   │   └── models/              # MediaPipe HandLandmarker task & WASM files
│   ├── src/
│   │   ├── components/
│   │   │   ├── FlyTalkApp.tsx   # Main 3-panel UI orchestrator
│   │   │   ├── FlyStage.tsx     # Animated SVG fruit fly arena
│   │   │   ├── GestureCamera.tsx# MediaPipe webcam hand tracking
│   │   │   └── useSimulation.ts # Connectome simulation lifecycle hook
│   │   ├── dialogue/
│   │   │   └── responses.ts     # Gen-Z trash-talk dialogues
│   │   └── simulation/
│   │       ├── engine.ts        # Leaky-integrator connectome simulation engine
│   │       ├── graph.ts         # Binary graph loader & SHA-256 validator
│   │       ├── stimuli.ts       # Biological gesture-to-neuron mappings
│   │       └── types.ts         # TypeScript definitions
│   └── scripts/
│       └── calibrate.ts         # Connectome calibration script
└── README.md                    # This file
```

---

## 📜 License & Citation

- Connectome data courtesy of **HHMI Janelia Research Campus & Google Research** under **CC-BY-4.0**.
- Connectome publication: *Takemura et al., "A connectome of the male Drosophila central nervous system"*, Nature / bioRxiv.
