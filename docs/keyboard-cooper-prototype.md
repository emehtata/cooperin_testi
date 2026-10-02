# Task: Build a standalone browser prototype of a keyboard-based Cooper test game

Create a standalone browser game prototype based on the following concept:

The game is a keyboard-based reinterpretation of the Cooper 12-minute run test. Instead of physically running, the player controls a runner by rapidly alternating between two separate keyboard keys. The faster and more consistently the player presses the keys, the faster the runner moves.

The first goal is NOT to build the final 12-minute game. Build a technically clean prototype that allows the gameplay mechanics to be tested quickly with configurable short test durations.

## 1. First inspect the repository

Before changing anything:

1. Inspect the existing repository structure.
2. Determine what technology/framework is already being used, if anything.
3. Check existing package/configuration files.
4. Check whether there is already a browser-game, frontend, Canvas, WebGL, JavaScript, TypeScript, Vite, React, or similar setup.
5. Reuse the existing project structure if one exists.
6. Do not introduce a framework or dependency unless there is a clear technical reason.
7. Do not create a backend.
8. Do not add networking, accounts, online leaderboards, databases, telemetry, or external APIs.

If the repository is effectively empty, create the smallest sensible standalone browser-game structure.

The game must work locally without an Internet connection.

## 2. Core prototype requirements

Build a playable game with:

* A runner character.
* Two keyboard controls.
* Default keys:

  * `A`
  * `D`
* The player must alternate between the two keys.
* Repeated presses of the same key must NOT count as valid alternating input.
* Browser keyboard auto-repeat must NOT generate additional valid presses.
* The game measures the player's actual valid alternating keypress rate.
* The keypress rate determines the runner's target speed.
* The runner accelerates toward the target speed.
* The runner decelerates when the player's input rate decreases.
* The runner visually runs at a rate corresponding to the current movement speed.
* Distance travelled is continuously accumulated.
* Display:

  * remaining time
  * elapsed time
  * distance
  * current speed
  * current valid keypress rate
* At the end of the test, stop accepting gameplay input and show a result screen.

## 3. Test durations

Do NOT hard-code the game to 12 minutes yet.

Create a simple test-duration configuration that supports at least:

* 10 seconds
* 30 seconds
* 1 minute
* 2 minutes
* 5 minutes
* 12 minutes

The selected duration should be easy to change for testing.

Prefer a small start/menu screen where the player can select the test duration.

For development and balancing, 10 seconds should be the default.

The game architecture must nevertheless treat the duration as a configurable value rather than having special logic for individual durations.

## 4. Input model

The input system is important.

Implement explicit state tracking for the two keys.

Example:

```text
A → valid
D → valid
A → valid
D → valid
```

But:

```text
A → valid
A → invalid
A → invalid
D → valid
D → invalid
A → valid
```

Only valid alternating presses affect the player's running performance.

Do not use browser key-repeat as gameplay input.

Use the physical key-down event only when the key transitions from released to pressed.

Prevent unintended browser behaviour such as scrolling or browser shortcuts where appropriate.

Make the two keys configurable in one clearly defined configuration object so they can later be changed without rewriting the input system.

## 5. Measuring input rate

Do not simply map the total number of keypresses to speed.

The game needs a meaningful instantaneous/short-term input rate.

Implement a rolling measurement of valid alternating keypresses, for example using a recent time window.

The exact window should be configurable.

The system should produce something similar to:

```text
valid presses/sec
```

This value should react reasonably quickly when the player speeds up or slows down.

Avoid making the runner instantly jump between speeds based on a single keypress.

The input rate should feed a target-speed calculation, followed by acceleration/deceleration.

Keep these concepts separate:

```text
keyboard input
    ↓
valid alternating presses
    ↓
measured input rate
    ↓
target running speed
    ↓
acceleration/deceleration
    ↓
actual running speed
    ↓
distance travelled
```

This separation is important because the conversion between input rate and running speed will almost certainly need balancing later.

## 6. Speed conversion

Create a dedicated function/module/configuration for converting input rate into target running speed.

Do NOT scatter magic numbers throughout the code.

For example, conceptually:

```text
input rate → target speed
```

The exact values are experimental at this stage.

Make the mapping easy to modify.

Prefer a non-linear curve rather than assuming:

```text
10 presses/sec = 10 km/h
```

The purpose of the first prototype is to make this relationship easy to tune.

Document the chosen initial values in code.

## 7. Runner animation

The runner should visibly run.

Do not simply move a static image across the screen.

The animation should react to actual running speed:

* standing/stationary at zero speed
* walking/slow movement at low speed
* normal running at medium speed
* faster running at high speed

The animation rate should be driven by the actual running speed, not directly by keyboard events.

If no external art assets exist, create a simple procedural or CSS/Canvas runner.

Do not spend excessive time creating final graphics.

The goal is to test the gameplay mechanic.

## 8. World movement

The player should perceive the runner as actually travelling forward.

A simple scrolling running track/background is sufficient.

For example:

```text
-----------------------------------------------
             🏃
-----------------------------------------------
```

The environment should scroll according to actual movement.

The runner itself can remain approximately centered while the world moves past it.

Distance must still be calculated mathematically from the actual running speed:

```text
distance += speed * deltaTime
```

Do not derive distance from rendered pixels.

## 9. Timing

Use a real elapsed-time based game loop.

Do NOT assume a fixed frame rate.

The game must remain correct at:

* 30 FPS
* 60 FPS
* 120 FPS
* temporarily lower FPS

Use `deltaTime` for:

* acceleration
* deceleration
* distance accumulation
* world movement
* animation timing

The test timer must also be based on elapsed time rather than frame count.

## 10. Game states

Implement explicit game states, for example:

```text
MENU
COUNTDOWN
RUNNING
FINISHED
```

The menu allows selecting the test duration.

Before starting the actual test, provide a short countdown such as:

```text
3
2
1
GO!
```

Do not count the countdown toward the test duration.

During RUNNING:

* process keyboard input
* update input rate
* update target speed
* update actual speed
* update distance
* update animation
* update world movement
* update UI

At FINISHED:

* stop movement
* stop accepting gameplay input
* show final results
* provide restart functionality

## 11. Results

At the end display at least:

```text
Distance
Average speed
Maximum speed
Total valid keypresses
Average valid keypresses/sec
```

Also show the test duration.

The distance should be the primary result because the concept is based on the Cooper test.

Do not yet attempt to calculate VO2max or fitness classifications.

## 12. Performance

Keep the implementation lightweight.

The game must run smoothly in a normal desktop browser.

Avoid unnecessary:

* DOM updates every frame
* allocations inside the main game loop
* expensive rendering operations
* external assets
* large frameworks

If Canvas is appropriate, use Canvas for the game rendering.

Keep frequently changing UI elements separate from the rendering layer if that improves performance.

The first prototype should be capable of running for the full 12-minute test without accumulating unnecessary state or memory.

## 13. No persistence yet

Do not add:

* database
* local leaderboard
* cloud storage
* login
* backend
* network communication

A restart should simply start another local test.

Local persistence can be considered later.

## 14. Development/debug information

Add a development/debug mode that can show useful live information such as:

```text
FPS
elapsed time
raw keypresses
valid alternating keypresses
input rate
target speed
actual speed
distance
```

Make it easy to disable the debug overlay for normal gameplay.

This is particularly important because the input-to-speed conversion will need to be tuned experimentally.

## 15. Audio

Do not add audio yet unless the repository already contains an appropriate audio system.

The first prototype is about validating the gameplay mechanic and visual feedback.

## 16. Responsive browser behaviour

The game should work in a normal desktop browser window.

It should not require fullscreen.

Make the layout reasonably responsive so that resizing the browser does not break the game.

Keyboard controls must remain reliable regardless of where the mouse cursor is.

## 17. Code quality

Keep the architecture simple but maintainable.

Separate at least these responsibilities conceptually:

```text
InputManager
GameState
GameTimer
Runner
Movement/Physics
InputRateCalculator
Renderer
UI
Configuration
```

Do not over-engineer the prototype with unnecessary abstractions.

The most important requirement is that the input-to-running-speed model can be modified easily.

Avoid magic numbers.

Put balancing parameters into a clearly identifiable configuration section.

## 18. Testing

After implementation, test at least:

1. Starting a 10-second test.
2. Starting a 30-second test.
3. Starting a 2-minute test.
4. Holding A down.
5. Repeatedly pressing A only.
6. Alternating A/D slowly.
7. Alternating A/D rapidly.
8. Starting slowly and accelerating.
9. Starting rapidly and then stopping.
10. Holding both keys.
11. Pressing keys before the countdown finishes.
12. Resizing the browser during a test.
13. Running at a normal 60 FPS.
14. Verifying that distance is time-based rather than frame-based.
15. Verifying that browser key-repeat does not inflate the score.
16. Verifying that the test ends exactly when the configured duration expires.
17. Restarting immediately after a completed test.

Pay particular attention to the difference between:

```text
physical key press
```

and:

```text
browser-generated repeated keydown events
```

The latter must not inflate the player's performance.

## 19. Initial balancing

Use sensible initial values, but treat them explicitly as experimental.

Do not claim that the initial conversion represents a scientifically valid Cooper test.

This is a game mechanic prototype.

The goal of this phase is to answer:

> "Does it feel good to control a runner by alternating two keyboard keys?"

Once the mechanic works, we can separately calibrate the relationship between keypress rate, running speed, fatigue, and the eventual 12-minute Cooper-style result.

## 20. Documentation

Add a short README section explaining:

* how to run the game locally
* how to select test duration
* default keyboard controls
* how input rate is calculated
* how input rate is converted to speed
* where the balancing parameters are located
* how to enable/disable debug information

Do not introduce a build system if the project does not need one.

If the project can work as a simple static HTML/JS application, prefer that.

## 21. Important implementation principle

Do not prematurely implement the final game design.

This is a prototype intended for iterative experimentation.

Prioritize:

1. Reliable keyboard input
2. Correct alternating-key detection
3. Good input-rate measurement
4. Smooth acceleration/deceleration
5. Convincing runner animation
6. Correct distance calculation
7. Easy gameplay balancing
8. Simple local execution

After implementation, run the available tests/lint/build checks and manually verify the gameplay flow.

At the end, provide a concise summary of:

* files created/changed
* architecture
* input model
* initial input-rate → speed mapping
* test durations
* tests performed
* any known limitations or balancing issues

Do not stop at describing what should be done. Implement the prototype in the repository.
