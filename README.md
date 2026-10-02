# Keyboard Cooper (prototype)

A browser game where you run a Cooper-style test by quickly alternating two keys. It's a prototype for testing the mechanic; it does not measure fitness.

## Run

Open `src/index.html` in a desktop browser. No build step, no server and no internet connection are needed.

| Command | What it does |
|---|---|
| `make test` | Model and server-validation tests |
| `make serve` | Game only at http://localhost:8000 (top lists show "unavailable offline") |
| `make azurite` then `make dev` | Full site and API, the same as on Azure, at http://localhost:4280 (needs Docker and `npm i -g azure-functions-core-tools@4`) |
| `make sync` | Copies `src/logic.js` into `api/` (run after any balancing change; `make test` fails if the copies differ) |

## Play

- Choose a duration on the menu (10 s, 30 s, 1, 2, 5 or 12 min; 10 s is the default), then press **Enter** or click Start.
- Alternate **A** and **D**. Pressing the same key twice in a row, holding a key down, and keyboard auto-repeat don't count.
- **Esc** returns to the menu, and **Enter** on the results screen runs the test again.

To change the durations, edit `CONFIG.durations` in `src/logic.js`. To change the keys, edit `CONFIG.keys` (these are `KeyboardEvent.code` values).

## How input becomes speed

```
keydown → valid alternation → presses/sec → target speed → accel/decel → speed → distance
```

1. **Validity** (`createInput`): a press counts only when the key goes from released to pressed (`e.repeat` and repeated keydowns without a keyup are ignored) and it differs from the last valid key.
2. **Rate** (`createRateMeter`): the number of valid presses in the last `rateWindowSeconds` (1.0 s), divided by the window length.
3. **Target speed** (`targetSpeed`): `maxSpeed · (1 − e^(−(rate − deadzone)/softness))`. This curve saturates: roughly 2/s ≈ 6 km/h, 4/s ≈ 12, 8/s ≈ 19, 12/s ≈ 23, with a ceiling of 27 km/h.
4. **Physics** (`stepPhysics`): speed moves toward the target at `acceleration` / `deceleration` m/s², and distance is integrated from speed × real elapsed time. Frame rate doesn't change the result.

**All balancing parameters are in the `BALANCING` section of `CONFIG` in `src/logic.js`.** These starting values are experimental and are not a validated Cooper conversion.

## Debug overlay

Press **`** (backquote) during play, or open `src/index.html?debug=1`, to see FPS, elapsed time, raw and valid presses, rate, target and actual speed, and distance. `CONFIG.debug` sets whether it's shown at start.

## Files

- `src/logic.js`: config and the pure model (input validity, rate meter, speed curve, physics). It has no DOM code.
- `src/game.js`: game states (MENU → COUNTDOWN → RUNNING → FINISHED), the main loop, input wiring, canvas rendering and the HUD.
- `src/index.html`: the page layout and styles.
- `src/staticwebapp.config.json`: tells Azure which Node version runs the API.
- `api/scores.js`: the Azure Function behind `GET /api/scores?duration=N` and `POST /api/scores`.
- `api/logic.js`: a copy of `src/logic.js`. Edit only the `src/` copy and run `make sync`.
- `test.js`: Node assertions for the model and the server checks.
- `Makefile`: commands for local runs.

## Top lists

Each test duration has its own world top 100.

- **Submitting:** the client sends the times of the valid key presses, not a distance.
- **Checking:** the server runs `validateRun` (rate limits, minimum gap between presses, rejecting suspiciously regular timing, name format), replays the presses through the same model and stores the distance it calculates.
- **Storage:** Azure Table Storage, table `scores`, using the `SCORES_CONNECTION` app setting. Rows are partitioned by `v<rulesVersion>-<duration>`, and the row key is the inverted distance, so the first rows of a partition are already the top list.
- **Rules changes:** after changing balancing values, increase `CONFIG.rulesVersion`. That starts fresh lists, and old clients are told to reload.
- **Abuse limits:** 5 submissions per minute per IP, counted in memory only. IP addresses are never stored.

## Deploy

The site is deployed to Azure Static Web Apps (free plan). In the workflow, set `app_location: "src"`, `api_location: "api"`, leave `output_location` empty and set `skip_app_build: true`. In Azure, create a Storage account and set the app setting `SCORES_CONNECTION` to its connection string.
# cooperin_testi
