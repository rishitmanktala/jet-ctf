# Jet CTF (Fighter Jets 3D) ✈️🚩

A fast-paced, high-fidelity 3D aerial combat and Capture The Flag (CTF) web game powered by **Three.js** and procedural audio synthesis.

## Features

- **5 Procedural Military Airframes**:
  - `F-22 Falcon` — Air Superiority Fighter
  - `F-16 Viper` — Multi-Role Interceptor
  - `A-10 Titan` — Heavy Close Air Support Attack Jet
  - `Su-57 Phantom` — 5th-Gen Stealth Air Superiority Fighter
  - `F-35 Spectre` — Stealth Strike Fighter
- **Pure Capture The Flag (CTF) Gameplay**:
  - 5v5 team match (Blue Squadron vs Red Squadron) with dynamic AI tactics (`SWARM_PUSH`, `SPLIT_INFILTRATION`, `HUNTER_KILLER`).
  - Home base recovery rules, mid-match respawn hangar, and live carrier sorties.
- **Flight & Combat Physics**:
  - Horizon-stabilized mouse aim steering with auto-leveling.
  - Afterburner nitro boost, high-G brake turns, and barrel roll evasion maneuvers.
  - 20mm rotary cannon with lead-assist targeting and Hyper Overdrive twin plasma streams.
- **Customization & Progression**:
  - Custom aircraft liveries (Cyber Emerald, Ion Cyan, Crimson Nova, Stealth Onyx, Solar Gold, Arctic Ghost) with signature neon trims and team navigation beacon lights.
  - Airframe upgrades across Speed, Agility, Firepower, Armor, and Boost Fuel.
  - Military rank progression and pilot career profiles.
- **Pure Web Standards**:
  - Zero build tools required. Open `index.html` in any modern web browser or serve statically.
  - WebAudio procedural synthwave soundtrack and combat sound effects.

## Project Structure

```
├── index.html              # Main application entry point
├── css/
│   └── styles.css          # Design system, HUD & modal styling
├── js/
│   ├── config.js           # World, CTF, combat, and airframe configurations
│   ├── career.js           # Pilot career profile, unlocks, upgrades & storage
│   ├── crazygames.js       # CrazyGames SDK v3 bridge & cloud data
│   ├── audio.js            # Procedural WebAudio engine & synthwave music
│   ├── input.js            # Keyboard, mouse aim & mobile touch controls
│   ├── particles.js        # Visual effects, sparks, smoke trails & shockwaves
│   ├── weapons.js          # Cannon ballistics, lead assist & collision physics
│   ├── flight-model.js     # Aerodynamics, mouse tracking & flight mechanics
│   ├── aircraft-models.js  # Procedural 3D airframes & model factory
│   ├── ai.js               # Tactical bot controller & squadron commander
│   ├── aircraft.js         # Aircraft state, HP, shields & animations
│   ├── world.js            # 48km procedural multi-biome terrain, ocean & bases
│   ├── hud.js              # 2D canvas military HUD, radar & flight telemetry
│   ├── tutorial.js         # Interactive onboarding tutorial
│   └── game.js             # Main game loop, showroom hangar & match manager
```

## Getting Started

Serve locally with any static web server:

```bash
# Python
python3 -m http.server 8000

# Or Node / npx
npx serve
```

Then visit `http://localhost:8000` in your browser.
