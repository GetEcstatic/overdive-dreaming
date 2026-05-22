# OverDive Landing HTML Explanation

## What This File Does

`overdive-landing.html` is a standalone animated landing screen for OverDive. When opened in a browser, it fills the whole window with a dark underwater pool-like animation and places the word `OverDive` in the middle.

It does not connect to the main Svelte app, Firebase, or any backend. Everything it needs is inside the one HTML file: the page markup, the styling, and the JavaScript that draws the animation.

## What You See On Screen

The page has two visible parts:

1. A full-screen canvas background that looks like dark water, pool tiles, soft light patterns, and ripples.
2. A large centered `OverDive` title that fades in with a soft blur and glow.

The result is more like an animated splash screen or visual concept than a normal web page with buttons, links, or navigation.

## How The HTML Is Structured

The body contains only two elements:

```html
<canvas id="water" aria-hidden="true"></canvas>
<h1>OverDive</h1>
```

The `canvas` is the drawing surface. JavaScript paints the animated water effect onto it.

The `h1` is the title text. CSS positions it in the exact center of the screen and gives it the pale glowing look.

## How The Styling Works

The CSS makes the page behave like a full-screen visual:

- `html` and `body` are set to 100% width and height.
- `overflow: hidden` prevents scrolling.
- The `canvas` is fixed to all four edges of the viewport, so it always covers the whole screen.
- The `h1` is also fixed and centered using `left: 50%`, `top: 50%`, and `transform: translate(-50%, -50%)`.
- The title uses `mix-blend-mode: screen` and text shadows so it feels like light sitting inside the water.

The title animation is called `titleArrive`. It starts invisible, blurry, and widely spaced, then settles into a clear glowing wordmark.

If the user has reduced motion enabled in their system settings, the title animation is disabled.

## How The Water Animation Works

The water is drawn with WebGL. In simple terms, WebGL lets the browser use the computer's graphics hardware to draw every pixel of the canvas very quickly.

The JavaScript does this:

1. Finds the canvas with `document.getElementById('water')`.
2. Starts a WebGL drawing context.
3. Defines two small graphics programs called shaders.
4. Sends a rectangle covering the whole screen to WebGL.
5. On every animation frame, asks WebGL to redraw the rectangle with updated time and screen-size values.

The rectangle itself is not interesting. The shader is what makes each pixel look like water.

## What The Shaders Do

There are two shaders:

- The vertex shader places a rectangle over the whole screen.
- The fragment shader decides the color of each pixel on that rectangle.

The fragment shader is the heart of the effect. It creates a fake underwater scene using math instead of image files.

It includes functions for:

- Random-looking noise, which creates natural uneven texture.
- Layered noise, which makes the pool floor feel less flat.
- A ripple height calculation, which simulates a ring-shaped disturbance moving outward.
- Caustics, which are the bright wavy light patterns you see on a pool floor.
- Vignetting and darkening, which make the edges feel deeper and moodier.
- Small grain, which prevents the image from looking too clean or computer-perfect.

So the animation is not a video. It is generated live by mathematical formulas.

## How Motion Is Controlled

The JavaScript records the start time with `performance.now()`.

Every frame, it calculates how many seconds have passed and passes that number into the shader as `u_time`.

The shader uses that time value to slowly move the ripples, light patterns, and glints.

The animation loop is driven by:

```js
requestAnimationFrame(frame);
```

That tells the browser to run the drawing function again before the next screen refresh.

## How It Handles Screen Size

The `resize()` function keeps the canvas sharp and correctly sized.

It checks the browser window size and the device pixel ratio, then resizes the canvas drawing buffer to match. It caps the device pixel ratio at 2 so very high-resolution screens do not demand too much graphics work.

This means the animation should fill the screen cleanly on phones, tablets, and desktops.

## What Happens If WebGL Fails

If the browser cannot create a WebGL context, the script simply stops. The canvas still has a dark radial-gradient background from CSS, and the title still appears.

If the shader code fails to compile or link, the error is logged to the console and the script stops instead of crashing the page.

## In Plain English

This file is a self-contained animated OverDive splash screen. It creates a dark underwater mood by drawing a fake pool surface and pool floor directly in the browser. The big title sits on top, glowing softly, while the background continually redraws itself to look like moving water.

It is useful as a visual experiment, landing-page hero, or brand animation concept. It is not currently an interactive app screen.

## Can This Be Used In The Overdive App?

Yes, with guardrails. This could work well as a short post-Google-auth loading screen while the authenticated app is preparing the dashboard or protected layout.

The best fit is not to use the raw HTML file directly. Instead, convert the idea into a Svelte component, for example `AuthLoadingSplash.svelte`, and render it from the authenticated app layout while `$loading` is true or while the first authenticated route is resolving.

In plain terms: after Google says "yes, this person is signed in," Overdive can briefly show this animated water screen before the dashboard appears.

## Mobile And GPU Feasibility

It should work on modern mobile devices for a short loading moment, but the current shader is heavier than a normal CSS spinner.

Why it may be okay:

- It uses one full-screen WebGL canvas, which phones are designed to handle.
- The canvas device-pixel ratio is already capped at `2`, which avoids the worst high-resolution cost.
- It has no images, videos, network requests, or extra assets.
- It already respects `prefers-reduced-motion` by freezing the shader time and disabling the title animation.

Why it still needs care:

- The fragment shader runs math for every pixel on every frame.
- The water effect uses layered noise, ripple math, caustics, glints, and grain, which is more expensive than simple gradients.
- Older phones, low-power mode, or backgrounded PWAs may struggle if this runs for more than a brief transition.
- Running it behind the main app after loading would waste battery and GPU.

Recommendation: use it only as a temporary loading splash, stop its animation as soon as the main page is ready, and use a lightweight fallback for reduced-motion or failed WebGL.

For mobile, consider lowering the maximum DPR to `1.5` inside the app component. The visual difference should be small, but the GPU cost can drop noticeably.

## App-Consistent Overdive Title Styling

The standalone file currently uses `OverDive`, a very light font weight, wide letter spacing, and a pale glowing treatment.

The app uses:

- The spelling `Overdive`.
- The system sans font stack from `src/app.css`.
- A bold `700` wordmark.
- A teal-to-green gradient: `var(--color-primary)` to `var(--color-secondary)`.
- No wide letter spacing.

So the Svelte version should style the splash title more like the existing `.app-title` and `.nav-title`:

```css
.splash-title {
  font-family: inherit;
  font-size: clamp(3rem, 14vw, 6rem);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

The title can still keep a subtle underwater glow, but the main brand signal should be the same gradient wordmark already used in the app.

## Implementation Plan

1. Create a reusable Svelte component for the splash.

	Suggested path: `src/lib/components/AuthLoadingSplash.svelte`.

	It should contain the canvas, the centered `Overdive` title, and the WebGL setup/teardown code.

2. Move the shader code out of the raw HTML shape and into component lifecycle code.

	Use `onMount` to initialize WebGL and `onDestroy` to cancel the animation frame and remove the resize listener.

3. Add performance controls.

	Cap DPR lower on mobile, for example `1.5`. Stop drawing when the component unmounts. Keep the reduced-motion path, and use a static dark gradient if WebGL is unavailable.

4. Replace the authenticated loading placeholder.

	In `src/routes/(app)/+layout.svelte`, replace the current plain `Loading...` block with the splash component while `$loading` is true.

5. Keep the public landing page separate for now.

	The user asked for the post-Google-auth loading moment, so the first implementation should only touch the authenticated loading state. The existing public landing page can stay as-is.

6. Validate on desktop and mobile viewport sizes.

	Run `npm run check`. Then test visually at around 375px width and desktop width. Confirm the splash appears during authenticated loading, disappears once the app is ready, and does not keep animating in the background.

7. Optional follow-up after the first version works.

	If the shader feels heavy on real devices, simplify the fragment shader by reducing the noise layers, reducing caustic layers, lowering DPR further, or switching mobile to a static canvas/gradient fallback.