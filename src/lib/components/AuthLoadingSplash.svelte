<script lang="ts">
	import { onMount } from 'svelte';

	let canvas: HTMLCanvasElement | undefined = $state();

	const vertexSource = `
		attribute vec2 a_position;
		void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
	`;

	const fragmentSource = `
		precision highp float;
		uniform vec2 u_resolution;
		uniform float u_time;
		uniform float u_reduceMotion;

		float hash(vec2 p) {
			p = fract(p * vec2(123.34, 456.21));
			p += dot(p, p + 45.32);
			return fract(p.x * p.y);
		}

		float noise(vec2 p) {
			vec2 i = floor(p);
			vec2 f = fract(p);
			vec2 u = f * f * (3.0 - 2.0 * f);
			return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
			           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
		}

		float fbm(vec2 p) {
			float v = 0.0;
			float a = 0.5;
			mat2 r = mat2(0.78, -0.63, 0.63, 0.78);
			for (int i = 0; i < 5; i++) {
				v += a * noise(p);
				p = r * p * 2.05 + 9.4;
				a *= 0.52;
			}
			return v;
		}

		float waterHeight(vec2 p, float t) {
			vec2 c = vec2(0.0, 0.015);
			float d = length(p - c);

			float intro = smoothstep(0.0, 1.9, t);
			float radius = 0.035 + t * 0.108;
			float endFade = 1.0 - smoothstep(1.20, 1.78, radius);
			float width = mix(0.020, 0.078, smoothstep(0.0, 1.55, radius));

			float mainRing = exp(-pow((d - radius) / width, 2.0));
			float ringWave = sin((d - radius) * 82.0 - t * 1.28);
			float initialRipple = mainRing * ringWave * intro * endFade * 0.072;

			float fine = 0.0;
			fine += sin(p.x * 6.0 + p.y * 2.1 + t * 0.30) * 0.0045;
			fine += sin(p.x * -3.4 + p.y * 7.2 - t * 0.25) * 0.0038;
			fine += (fbm(p * 1.9 + vec2(t * 0.018, -t * 0.014)) - 0.5) * 0.012;

			return initialRipple + fine;
		}

		float causticLayer(vec2 p, float t, float scale) {
			p *= scale;
			p += vec2(sin(t * 0.09), cos(t * 0.075)) * 0.10;
			float a = sin(p.x * 1.62 + sin(p.y * 1.10 + t * 0.22));
			float b = sin(p.y * 1.88 + sin(p.x * 1.02 - t * 0.19));
			float c = sin((p.x + p.y) * 1.05 + t * 0.16);
			float v = abs((a + b + c) / 3.0);
			return pow(1.0 - v, 8.5);
		}

		vec3 darkPoolFloor(vec2 uv, vec2 p, vec2 normal, float t) {
			vec2 refr = uv + normal * 0.035;
			vec2 floorUv = refr;
			floorUv.x += (refr.y - 0.5) * 0.055;

			vec3 abyss = vec3(0.002, 0.011, 0.017);
			vec3 deepTeal = vec3(0.008, 0.055, 0.071);
			vec3 mutedBlue = vec3(0.018, 0.105, 0.130);

			float depth = smoothstep(0.0, 1.0, refr.y);
			vec3 col = mix(deepTeal, abyss, depth * 0.52);
			col = mix(col, mutedBlue, pow(max(1.0 - length(p * vec2(0.72, 0.88)), 0.0), 2.4) * 0.42);

			float plaster = fbm(floorUv * 7.0 + 2.0) * 0.5 + fbm(floorUv * 24.0) * 0.12;
			col += vec3(0.009, 0.020, 0.019) * (plaster - 0.36);

			vec2 grid = abs(fract(floorUv * vec2(5.0, 3.1) + vec2(0.03, 0.07)) - 0.5);
			float grout = 1.0 - smoothstep(0.009, 0.016, min(grid.x, grid.y));
			col = mix(col, col + vec3(0.010, 0.030, 0.033), grout * 0.10);

			float caustics = causticLayer(floorUv + normal * 0.65, t, 18.0);
			caustics += causticLayer(floorUv.yx + normal * 0.4, t + 3.7, 30.0) * 0.45;
			caustics = smoothstep(0.060, 0.88, caustics);
			col += vec3(0.38, 0.76, 0.72) * caustics * 0.060;

			float barelySunlit = pow(max(1.0 - length(p - vec2(-0.08, 0.03)) * 0.76, 0.0), 3.0);
			col += vec3(0.018, 0.075, 0.080) * barelySunlit;

			float vignette = smoothstep(1.48, 0.18, length(p * vec2(0.78, 0.96)));
			col *= 0.48 + 0.52 * vignette;
			col = mix(col, vec3(0.0, 0.004, 0.007), smoothstep(1.05, 1.75, length(p)) * 0.58);
			return col;
		}

		void main() {
			vec2 frag = gl_FragCoord.xy;
			vec2 uv = frag / u_resolution;
			vec2 p = (frag * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
			float t = u_reduceMotion > 0.5 ? 22.0 : u_time;

			float e = 1.55 / min(u_resolution.x, u_resolution.y);
			float hx = waterHeight(p + vec2(e, 0.0), t) - waterHeight(p - vec2(e, 0.0), t);
			float hy = waterHeight(p + vec2(0.0, e), t) - waterHeight(p - vec2(0.0, e), t);
			vec2 n = vec2(hx, hy) * 10.0;

			vec3 col = darkPoolFloor(uv, p, n, t);

			vec2 c = vec2(0.0, 0.015);
			float d = length(p - c);
			float radius = 0.035 + t * 0.108;
			float ringFade = smoothstep(0.0, 1.9, t) * (1.0 - smoothstep(1.20, 1.78, radius));
			float brightRing = exp(-pow((d - radius) / 0.040, 2.0)) * ringFade;
			col += vec3(0.28, 0.72, 0.78) * brightRing * 0.050;

			float glint = sin((uv.x + n.x) * 54.0 + t * 0.23) * sin((uv.y + n.y) * 42.0 - t * 0.20);
			glint = pow(max(glint, 0.0), 11.0);
			col += vec3(0.34, 0.72, 0.72) * glint * 0.018;

			float grain = hash(frag + floor(t * 18.0)) - 0.5;
			col += grain * 0.006;
			col = pow(max(col, 0.0), vec3(0.94));
			gl_FragColor = vec4(col, 1.0);
		}
	`;

	function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
		const shader = gl.createShader(type);
		if (!shader) throw new Error('Shader creation failed');

		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
		}
		return shader;
	}

	onMount(() => {
		if (!canvas) return;

		const gl = canvas.getContext('webgl', {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			powerPreference: 'high-performance'
		});
		if (!gl) return;

		let animationFrame: number | undefined;
		let program: WebGLProgram | null = null;
		const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const mobileQuery = window.matchMedia('(max-width: 767px)');

		try {
			program = gl.createProgram();
			if (!program) throw new Error('Program creation failed');
			gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
			gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
			}
		} catch (error) {
			console.error('[AuthLoadingSplash] WebGL setup failed', error);
			return;
		}

		gl.useProgram(program);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW
		);

		const position = gl.getAttribLocation(program, 'a_position');
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

		const uResolution = gl.getUniformLocation(program, 'u_resolution');
		const uTime = gl.getUniformLocation(program, 'u_time');
		const uReduceMotion = gl.getUniformLocation(program, 'u_reduceMotion');
		const start = performance.now();

		function resize() {
			if (!canvas || !gl) return;
			const dprLimit = mobileQuery.matches ? 1.5 : 2;
			const dpr = Math.min(window.devicePixelRatio || 1, dprLimit);
			const width = Math.max(1, Math.floor(window.innerWidth * dpr));
			const height = Math.max(1, Math.floor(window.innerHeight * dpr));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
				gl.viewport(0, 0, width, height);
			}
		}

		function draw(now: number) {
			if (!canvas || !gl) return;
			resize();
			gl.uniform2f(uResolution, canvas.width, canvas.height);
			gl.uniform1f(uTime, (now - start) / 1000);
			gl.uniform1f(uReduceMotion, reduceMotionQuery.matches ? 1 : 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}

		function frame(now: number) {
			draw(now);
			if (!reduceMotionQuery.matches) animationFrame = requestAnimationFrame(frame);
		}

		function handleResize() {
			if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
			draw(performance.now());
			if (!reduceMotionQuery.matches) animationFrame = requestAnimationFrame(frame);
		}

		window.addEventListener('resize', handleResize, { passive: true });
		reduceMotionQuery.addEventListener('change', handleResize);
		mobileQuery.addEventListener('change', handleResize);
		animationFrame = requestAnimationFrame(frame);

		return () => {
			if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
			window.removeEventListener('resize', handleResize);
			reduceMotionQuery.removeEventListener('change', handleResize);
			mobileQuery.removeEventListener('change', handleResize);
			if (buffer) gl.deleteBuffer(buffer);
			if (program) gl.deleteProgram(program);
		};
	});
</script>

<div class="auth-splash" aria-live="polite" aria-label="Loading Overdive">
	<canvas bind:this={canvas} class="water-canvas" aria-hidden="true"></canvas>
	<div class="fallback-bg" aria-hidden="true"></div>
	<h1 class="splash-title">Overdive</h1>
</div>

<style>
	.auth-splash {
		position: fixed;
		inset: 0;
		min-height: 100vh;
		min-height: 100dvh;
		overflow: hidden;
		background: #000;
		display: grid;
		place-items: center;
		isolation: isolate;
	}

	.water-canvas,
	.fallback-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.water-canvas {
		z-index: 1;
		display: block;
		background: radial-gradient(circle at 50% 42%, #09202a 0%, #031016 50%, #000407 100%);
	}

	.fallback-bg {
		z-index: 0;
		background:
			radial-gradient(circle at 50% 42%, rgba(20, 184, 166, 0.14), transparent 34%),
			radial-gradient(circle at 25% 80%, rgba(16, 185, 129, 0.08), transparent 36%),
			#000;
	}

	.splash-title {
		position: relative;
		z-index: 2;
		margin: 0;
		font-family: inherit;
		font-size: clamp(3rem, 14vw, 6rem);
		font-weight: 700;
		letter-spacing: 0;
		line-height: 1;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 0 1.1rem rgba(20, 184, 166, 0.18));
		animation: title-arrive 1400ms cubic-bezier(0.16, 1, 0.3, 1) both;
		pointer-events: none;
		user-select: none;
	}

	@keyframes title-arrive {
		from {
			opacity: 0;
			filter: blur(10px) drop-shadow(0 0 1.1rem rgba(20, 184, 166, 0.18));
			transform: translateY(0.35rem) scale(0.98);
		}
		to {
			opacity: 1;
			filter: blur(0) drop-shadow(0 0 1.1rem rgba(20, 184, 166, 0.18));
			transform: translateY(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.splash-title {
			animation: none;
		}
	}
</style>
