# best-flight-game-01

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/kinu2932/best-flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/kinu2932/best-flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sky Courier: Island Run** — a complete 2D-canvas pseudo-3D flight game over three
islands, built with zero libraries and zero network requests. You are the courier
pilot of a little teal prop plane, SKY-01, flying out of Home Reef.

Three missions, three different ways to fly:

- **Ring Run** — thread all 8 glowing rings strung across the islands (a smooth
  course, not a hairpin: each gate is flown by crossing its plane, the way a
  real pilot flies a gate). 250 points a ring, 500 more for the full course.
- **Island Hop** — land on all three runways in order: Palm Cay, Storm Peak,
  Home Reef. A landing only counts when it is low, gentle (sink under 9 m/s),
  slow (under 62 m/s) and level, on the strip itself — then the ground crew
  refuels you and you take off for the next leg.
- **Storm Courier** — deliver the parcel to Storm Peak in a storm. Gusts shove
  the wings ±18°, rain streaks the windscreen, and the peak's flank is
  unforgiving. The hardest way to earn 1,000 points.

Under the hood: throttle sets the speed she wants, pitch trades speed for
height, bank turns her in a coordinated turn, and below flying speed she sinks
whether the pilot likes it or not. Fuel burns faster at full throttle (a full
tank lasts about 238 seconds flat out), and running dry over the sea is a soft
ditch, not a smash. The terrain is deterministic noise carved flat around every
runway, with a clear approach corridor 600 m out, so a fair approach never
meets a hillside — but flying into one is a crash, with a reason on the screen.

The HUD is the whole instrument panel: compass tape with heading, altitude in
feet, airspeed in knots, vertical speed, throttle and fuel gauges, an
artificial horizon, the mission card, and a NEXT target readout with an
off-screen arrow. Sound is synthesized in WebAudio (engine hum, ring chime,
touchdown thud, crash buzz) — no audio files. Controls: Arrows/WASD to fly,
Shift/Ctrl for throttle, mouse to steer, wheel for throttle, 1/2/3 for the
mission, P to pause, R to restart, M to mute.

Source is split one job per file under `game/src/`: `config.js` (world and
physics constants), `random.js` (deterministic noise), `terrain.js` (islands,
runways, rings), `plane.js` (flight model), `world.js` (missions, scoring,
landings, crashes), `input.js`, `sound.js`, `render.js` (chase camera,
terrain mesh, HUD), `shots.js` (staged screenshot scenes with autopilot) and
`main.js` (boot and fixed-step loop). `screenshots/` holds four frames rendered
by this code in a headless browser: the cover (ring 4 ahead), a ring pass, a
final approach, and the storm.

## Run it

```sh
node serve.ts
# open http://localhost:8080 — no build step, no network, just static files
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ahfzfq6y&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
