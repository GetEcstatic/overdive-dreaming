<script lang="ts">
import { onDestroy, onMount, tick } from 'svelte';

	interface Props {
		file: File;
		onApply: (file: File, previewUrl: string) => void;
		onCancel: () => void;
		triggerApply?: () => void; // Bindable: parent can assign a function to trigger crop
	}

	let { file, onApply, onCancel, triggerApply = $bindable() }: Props = $props();
	
	// Expose the applyCrop function via the bindable triggerApply prop
	$effect(() => {
		triggerApply = applyCrop;
	});

	let cropContainer: HTMLDivElement | null = null;
	let imageEl: HTMLImageElement | null = null;
let imageSrc = $state('');
let isLoading = $state(true);
let loadError = $state<string | null>(null);
	let fallbackSrc = $state<string | null>(null);
	const showDebug = false;
	let canvasEl: HTMLCanvasElement | null = null;
	let displayWidth = $derived(Math.max(1, naturalWidth * fitScale * zoom));
	let displayHeight = $derived(Math.max(1, naturalHeight * fitScale * zoom));
	let cropSize = $state(240);
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);
	let fitScale = $state(1);
	let zoom = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let isDragging = $state(false);

	const minZoom = 1;
	const maxZoom = 3;
	const outputSize = 1024;

	function updateCropSize() {
		if (!cropContainer) return;
		const rect = cropContainer.getBoundingClientRect();
		const nextSize = Math.max(1, Math.floor(rect.width));
		if (nextSize && nextSize !== cropSize) {
			cropSize = nextSize;
		}
	}

	function clampOffsets(nextX: number, nextY: number) {
		const safeCropSize = Math.max(1, cropSize);
		const scaledWidth = naturalWidth * fitScale * zoom;
		const scaledHeight = naturalHeight * fitScale * zoom;
		const minX = Math.min(0, safeCropSize - scaledWidth);
		const minY = Math.min(0, safeCropSize - scaledHeight);
		const maxX = 0;
		const maxY = 0;

		return {
			x: Math.min(maxX, Math.max(minX, nextX)),
			y: Math.min(maxY, Math.max(minY, nextY))
		};
	}

	function centerImage() {
		const safeCropSize = Math.max(1, cropSize);
		const scaledWidth = naturalWidth * fitScale * zoom;
		const scaledHeight = naturalHeight * fitScale * zoom;
		offsetX = (safeCropSize - scaledWidth) / 2;
		offsetY = (safeCropSize - scaledHeight) / 2;
	}

	async function handleImageLoad() {
		if (!imageEl) return;
		await tick();
		updateCropSize();
		naturalWidth = imageEl.naturalWidth || 1;
		naturalHeight = imageEl.naturalHeight || 1;
		fitScale = Math.max(cropSize / naturalWidth, cropSize / naturalHeight);
		zoom = 1;
		centerImage();
		isLoading = false;
		requestAnimationFrame(() => drawPreview());
	}

	function handleZoomChange(nextZoom: number) {
		if (!naturalWidth || !naturalHeight) return;
		const clampedZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
		const centerX = cropSize / 2;
		const centerY = cropSize / 2;
		const prevScale = fitScale * zoom;
		const nextScale = fitScale * clampedZoom;

		const imageCenterX = (centerX - offsetX) / prevScale;
		const imageCenterY = (centerY - offsetY) / prevScale;

		const nextOffsetX = centerX - imageCenterX * nextScale;
		const nextOffsetY = centerY - imageCenterY * nextScale;
		const clamped = clampOffsets(nextOffsetX, nextOffsetY);

		zoom = clampedZoom;
		offsetX = clamped.x;
		offsetY = clamped.y;
		drawPreview();
	}

	function handlePointerDown(event: PointerEvent) {
		if (!cropContainer) return;
		isDragging = true;
		cropContainer.setPointerCapture(event.pointerId);
		startX = event.clientX;
		startY = event.clientY;
		startOffsetX = offsetX;
		startOffsetY = offsetY;
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isDragging) return;
		const deltaX = event.clientX - startX;
		const deltaY = event.clientY - startY;
		const clamped = clampOffsets(startOffsetX + deltaX, startOffsetY + deltaY);
		offsetX = clamped.x;
		offsetY = clamped.y;
		drawPreview();
	}

	function handlePointerUp(event: PointerEvent) {
		if (!cropContainer) return;
		isDragging = false;
		cropContainer.releasePointerCapture(event.pointerId);
	}

	let startX = 0;
	let startY = 0;
	let startOffsetX = 0;
	let startOffsetY = 0;

	async function applyCrop() {
		if (!imageEl) return;
		const canvas = document.createElement('canvas');
		drawToCanvas(canvas, outputSize);

		const previewUrl = canvas.toDataURL('image/jpeg', 0.9);
		canvas.toBlob(
			(blob) => {
				if (!blob) return;
				const baseName = file.name.replace(/\.[^/.]+$/, '');
				const croppedFile = new File([blob], `${baseName}_crop.jpg`, {
					type: 'image/jpeg'
				});
				onApply(croppedFile, previewUrl);
			},
			'image/jpeg',
			0.9
		);
	}

	onMount(() => {
		updateCropSize();
		requestAnimationFrame(() => updateCropSize());
		const handleResize = () => {
			updateCropSize();
			if (naturalWidth && naturalHeight) {
				fitScale = Math.max(cropSize / naturalWidth, cropSize / naturalHeight);
				centerImage();
				drawPreview();
			}
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		isLoading = true;
		loadError = null;
		imageSrc = '';
		fallbackSrc = null;

		const reader = new FileReader();
		reader.onload = (event) => {
			const result = event.target?.result;
			if (typeof result === 'string') {
				imageSrc = result;
				fallbackSrc = result;
			} else {
				loadError = 'Unable to load image preview.';
				isLoading = false;
			}
		};
		reader.onerror = () => {
			loadError = 'Unable to load image preview.';
			isLoading = false;
		};
		reader.readAsDataURL(file);
	});

	onDestroy(() => {
		// no-op
	});

	$effect(() => {
		if (!isLoading && canvasEl && imageEl) {
			requestAnimationFrame(() => drawPreview());
		}
	});

	function handleImageError() {
		if (fallbackSrc && imageSrc !== fallbackSrc) {
			imageSrc = fallbackSrc;
			return;
		}
		loadError = 'Image format not supported. Use JPG, PNG, or WebP.';
		isLoading = false;
	}

	function drawPreview() {
		if (!canvasEl) return;
		drawToCanvas(canvasEl, Math.max(1, cropSize));
	}

	function drawToCanvas(target: HTMLCanvasElement, size: number) {
		if (!imageEl) return;
		const ctx = target.getContext('2d');
		if (!ctx) return;
		target.width = size;
		target.height = size;
		ctx.clearRect(0, 0, size, size);
		const scale = size / Math.max(1, cropSize);
		ctx.drawImage(
			imageEl,
			offsetX * scale,
			offsetY * scale,
			displayWidth * scale,
			displayHeight * scale
		);
	}
</script>

<div class="cropper">
	<div class="cropper-header">
		<div>
			<div class="cropper-title">Adjust photo</div>
			<div class="cropper-subtitle">Drag to reposition • Use the slider to zoom</div>
		</div>
		<div class="cropper-actions">
			<button type="button" class="btn-secondary" onclick={onCancel}>Cancel</button>
			<button type="button" class="btn-primary" onclick={applyCrop}>Use Crop</button>
		</div>
	</div>

	<div
		class="cropper-frame"
		bind:this={cropContainer}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointerleave={handlePointerUp}
	>
		{#if imageSrc}
			<img
				bind:this={imageEl}
				src={imageSrc}
				alt=""
				class="cropper-image"
				onload={handleImageLoad}
				onerror={handleImageError}
				draggable="false"
			/>
			<canvas bind:this={canvasEl} class="cropper-canvas" aria-label="Crop preview"></canvas>
		{/if}
		{#if showDebug}
			<div class="cropper-debug">
				<div>cropSize: {cropSize}px</div>
				<div>natural: {naturalWidth}×{naturalHeight}</div>
				<div>fitScale: {fitScale.toFixed(3)}</div>
				<div>display: {Math.round(displayWidth)}×{Math.round(displayHeight)}</div>
				<div>zoom: {zoom.toFixed(2)}</div>
				<div>offset: {offsetX.toFixed(1)}, {offsetY.toFixed(1)}</div>
			</div>
		{/if}
		{#if isLoading && !loadError}
			<div class="cropper-message">Loading image…</div>
		{:else if loadError}
			<div class="cropper-message">{loadError}</div>
		{/if}
	</div>

	<div class="cropper-controls">
		<label class="zoom-label" for="zoomRange">Zoom</label>
		<input
			id="zoomRange"
			type="range"
			min={minZoom}
			max={maxZoom}
			step="0.05"
			value={zoom}
			oninput={(event) => handleZoomChange(parseFloat((event.target as HTMLInputElement).value))}
		/>
	</div>
</div>

<style>
	.cropper {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.15);
		background: rgba(12, 20, 33, 0.85);
	}

	.cropper-header {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
	}

	.cropper-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.cropper-subtitle {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.cropper-actions {
		display: flex;
		gap: 0.5rem;
	}

	.cropper-frame {
		position: relative;
		width: 100%;
		max-width: 280px;
		aspect-ratio: 1 / 1;
		overflow: hidden;
		border-radius: 10px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: #0b1220;
		cursor: grab;
		touch-action: none;
	}

	.cropper-message {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 0 1rem;
	}

	.cropper-debug {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.6);
		color: #e2e8f0;
		font-size: 0.65rem;
		line-height: 1.4;
		border-radius: 6px;
		pointer-events: none;
	}

	.cropper-frame:active {
		cursor: grabbing;
	}

	.cropper-image {
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.cropper-canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	.cropper-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.zoom-label {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	input[type='range'] {
		flex: 1;
		accent-color: var(--color-primary);
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 600;
		border: none;
		cursor: pointer;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: #0f172a;
	}

	.btn-secondary {
		background: rgba(148, 163, 184, 0.15);
		color: var(--color-text);
	}
</style>
