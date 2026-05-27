# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

The app is authored as a single JSX source file, `e6b_tankering.jsx` (~3500 lines, ~200KB), and built into a single self-contained `index.html`. React 18, Tesseract.js, and pdf.js are pulled from CDNs at runtime — no bundler, no module system, just the babel JSX transform.

There is no test runner or lint config. "Building" means running the three-step pipeline below.

## Build pipeline

```
node prep.js              # strip `react` imports, append the ReactDOM.createRoot(...) mount call
                          #   in  : e6b_tankering.jsx
                          #   out : e6b_for_build.jsx
npx babel e6b_for_build.jsx --presets=@babel/preset-react --out-file e6b_built.js
                          # JSX → React.createElement
node build_html.js        # wrap e6b_built.js in the HTML shell (CDN scripts, root div,
                          #   useState/useEffect/useRef bindings from the React global)
                          #   out : index.html
```

Or just `npm run build`. First-time setup: `npm install` to pull `@babel/cli`, `@babel/core`, `@babel/preset-react` (pinned in `package.json`).

`e6b_for_build.jsx` and `e6b_built.js` are intermediates and are `.gitignore`d. Commit the source (`e6b_tankering.jsx`) and the built `index.html`.

## Run and deploy

- Local dev: serve the directory with any static server, e.g. `python3 -m http.server 8000`, then visit `http://localhost:8000`.
- Production: GitHub Pages auto-deploys `main`. `vercel.json` is still present and rewrites every path to `/index.html` if hosted on Vercel.
- Deploy = `npm run build && git add . && git commit -m "..." && git push`.
- When shipping changes that should invalidate the offline cache, bump **both** of these together — otherwise returning users keep the old cached `index.html`:
  - `APP_VERSION` constant near the top of `e6b_tankering.jsx` (around line 4) — shown in the UI.
  - `CACHE` constant in `sw.js` (currently `e6b-v22`).

## High-level architecture

The root component is `E6B()` near the bottom of `e6b_tankering.jsx`. It holds a `screen` state that switches between six top-level views, each rendered inline or via a dedicated component:

| `screen` value | Component | Purpose |
|---|---|---|
| `calc` | inline in `E6B` | Fuel tankering optimizer (the original tool) |
| `pcn`  | `PavementCalc` | PCN/ACN and PCR/ACR pavement-bearing calc |
| `bke`  | `BrakeCalc`    | Landing-brake-energy + turnaround calc |
| `duty` | `FlightDutyCalc` | FAR 135.267/.269 10-in-24 flight-duty calc |
| `aircraft` | inline | Custom aircraft profile manager |
| `history` | inline | Last 30 tankering runs |

Each calculator is largely self-contained. Don't try to share state across them — the only shared things are the `C` color palette, the formatter helpers `fL/fG/fLt/fM`, the `Field`/`NumPad`/`NumPadOverlay`/`TextInp` input primitives, and the storage wrappers below.

### Fuel-tankering engine

`calcLeg(ac, leg, globalAlt, reserveFuel, fobAtDep, nextLeg)` is the heart of the tankering tab. It sweeps tanker quantity in 200-lb increments from 0 to `maxExtra` and picks the amount that maximizes `tankerLbs * priceDiff − burnPenalty + arrFeeSaved + depRampSaved`. Burn penalty is `tankerLbs * ac.burnPenaltyFactor * hours * depPrice`. Arrival-ramp-fee waivers depend on the **next** leg's `depMinPurchase`, so changing leg N can change the optimum of leg N−1.

### Aircraft data

The Gulfstream V is hard-coded in the `GV` constant near the top of the source. ACN/ACR pavement tables are baked in from the GV Performance Handbook (tire pressure 198 PSI, WoM 91%) and are not derived — if a manual revision changes them, update the literal arrays. User-defined aircraft go through the `aircraft` screen and merge with `GV` via `currentAc` in `E6B`.

### Flight-duty rules

`CREW_LIMITS` encodes FAR 135.267 (2-pilot) and 135.269 (3- and 4-pilot) duty/flight/rest/rolling-24 limits. `ICAO_TZ` is a manually maintained lookup of UTC offsets for major airports — there is no automatic DST handling, just static offsets per airport. If a user reports wrong times after a DST shift, the fix is editing this map.

### Image/PDF import pipeline

Both the tankering tab and the duty tab can import trips from screenshots/PDFs:
1. `loadTesseract()` lazy-loads Tesseract.js from jsdelivr on first use.
2. `ocrFromDataUrl()` auto-inverts dark-background images and boosts contrast before OCR.
3. `parseTripText()` / `parseOcrTripText()` regex-parse ARINCDirect-style output into legs.
4. `parseImageViaAPI()` and `parseDutyImageViaAPI()` are an Anthropic-vision fallback. Note: they POST directly to `https://api.anthropic.com/v1/messages` with **no API key header** — they only work via a proxy or browser extension that injects auth. Treat the OCR path as the real path.

PDF import in `FlightDutyCalc` uses pdf.js, also CDN-loaded on demand.

### Persistence

`store(k, v)` / `recall(k)` / `forget(k)` wrap `localStorage` with JSON. Only two keys are used app-wide:
- `e6b:hist` — last 30 tankering calculations (capped in `runCalc`).
- `e6b:profiles` — custom aircraft profiles.

In-memory only: `priceMemory` ref inside `E6B` remembers entered fuel prices by ICAO for the session.

## Working in this codebase

- **Edit `e6b_tankering.jsx`, not `index.html`.** The HTML is build output and will be overwritten on next build. Anyone who edits the HTML directly will lose their work the next time `npm run build` runs.
- The same input primitives (`Field`, `NumPad`, `TextInp`) are reused throughout — prefer them over raw `<input>` so the on-screen numpad and styling stay consistent on iOS.
- Mobile is the primary target. `useWide(768)` gates two-column layouts; assume narrow by default.
- The Numpad and WindPad are intentionally dark-themed (hardcoded colors) even though the rest of the app uses the light Navy Ops palette in `C={...}`.
- Service-worker caching is aggressive (cache-first with network fallback in `sw.js`). When testing changes locally, hard-reload or unregister the SW — otherwise you'll see stale code.
