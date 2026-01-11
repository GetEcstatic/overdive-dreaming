<script lang="ts">
	import { isValidYouTubeUrl, getYouTubeEmbedUrl } from '$lib/storage';
	import PhotoCropper from '$lib/components/PhotoCropper.svelte';

	interface Props {
		existingPhotoUrl?: string;
		existingYoutubeUrl?: string;
		onPhotoChange: (file: File | null, action: 'add' | 'remove' | 'replace') => void;
		onYoutubeChange: (url: string | null, action: 'add' | 'remove' | 'update') => void;
		triggerApplyCrop?: () => void; // Bindable: parent can trigger crop application
	}

	let { existingPhotoUrl, existingYoutubeUrl, onPhotoChange, onYoutubeChange, triggerApplyCrop = $bindable() }: Props = $props();

	// Photo state
	let photoFile = $state<File | undefined>(undefined);
	let sourcePhotoFile = $state<File | undefined>(undefined);
	let photoPreviewUrl = $state<string | undefined>(existingPhotoUrl);
	let showPhotoUpload = $state(!existingPhotoUrl);
	let showCropper = $state(false);
	let pendingPhotoAction = $state<'add' | 'replace'>('add');
	let triggerPhotoCropInner = $state<(() => void) | undefined>(undefined);

	// Expose method to trigger crop from parent
	$effect(() => {
		triggerApplyCrop = () => {
			if (showCropper && sourcePhotoFile && triggerPhotoCropInner) {
				triggerPhotoCropInner();
			}
		};
	});

	// YouTube state
	let youtubeUrl = $state<string>(existingYoutubeUrl || '');
	let youtubeError = $state<string | null>(null);
	let showYoutubeInput = $state(!existingYoutubeUrl);
	let isEditingYoutube = $state(false);

	// Photo handlers
	function handlePhotoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) {
			photoFile = undefined;
			return;
		}

		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			alert('Please select a JPG, PNG, or WebP image');
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			alert('Image must be under 5MB');
			return;
		}

		sourcePhotoFile = file;
		pendingPhotoAction = existingPhotoUrl ? 'replace' : 'add';
		showCropper = true;
	}

	function removePhoto() {
		photoFile = undefined;
		sourcePhotoFile = undefined;
		photoPreviewUrl = undefined;
		showPhotoUpload = true;

		// Notify parent
		onPhotoChange(null, 'remove');
	}

	function replacePhoto() {
		showPhotoUpload = true;
		photoPreviewUrl = undefined;
	}

	function applyCrop(croppedFile: File, previewUrl: string) {
		photoFile = croppedFile;
		photoPreviewUrl = previewUrl;
		showPhotoUpload = false;
		showCropper = false;
		onPhotoChange(croppedFile, pendingPhotoAction);
	}

	function cancelCrop() {
		showCropper = false;
		if (!photoPreviewUrl) {
			showPhotoUpload = true;
		}
	}

	function adjustCrop() {
		if (!sourcePhotoFile) return;
		showCropper = true;
	}

	// YouTube handlers
	function handleYoutubeInput() {
		if (!youtubeUrl.trim()) {
			youtubeError = null;
			return;
		}

		if (!isValidYouTubeUrl(youtubeUrl)) {
			youtubeError = 'Invalid YouTube URL';
		} else {
			youtubeError = null;
		}
	}

	function saveYoutubeUrl() {
		if (youtubeError || !youtubeUrl.trim()) {
			return;
		}

		const action = existingYoutubeUrl ? 'update' : 'add';
		onYoutubeChange(youtubeUrl.trim(), action);
		showYoutubeInput = false;
		isEditingYoutube = false;
	}

	function editYoutubeUrl() {
		isEditingYoutube = true;
		showYoutubeInput = true;
	}

	function removeYoutubeUrl() {
		youtubeUrl = '';
		youtubeError = null;
		showYoutubeInput = true;
		isEditingYoutube = false;
		onYoutubeChange(null, 'remove');
	}

	function cancelYoutubeEdit() {
		youtubeUrl = existingYoutubeUrl || '';
		youtubeError = null;
		showYoutubeInput = !existingYoutubeUrl;
		isEditingYoutube = false;
	}
</script>

<div class="media-manager">
	<!-- Photo Section -->
	<div class="field-group">
		<label class="field-label">Session Photo (Optional)</label>

		{#if showCropper && sourcePhotoFile}
			<PhotoCropper 
				file={sourcePhotoFile} 
				onApply={applyCrop} 
				onCancel={cancelCrop}
				bind:triggerApply={triggerPhotoCropInner}
			/>
		{:else if photoPreviewUrl && !showPhotoUpload}
			<div class="photo-preview">
				<img src={photoPreviewUrl} alt="Session photo" class="preview-image" />
				<div class="photo-actions">
					{#if sourcePhotoFile}
						<button type="button" onclick={adjustCrop} class="btn-secondary">
							Adjust Crop
						</button>
					{/if}
					<button type="button" onclick={replacePhoto} class="btn-secondary">
						Replace
					</button>
					<button type="button" onclick={removePhoto} class="btn-danger"> Remove </button>
				</div>
			</div>
		{:else}
			<input
				type="file"
				accept="image/jpeg,image/png,image/webp"
				onchange={handlePhotoChange}
				class="file-input"
			/>
			<p class="field-hint">JPG, PNG, or WebP • Max 5MB</p>
		{/if}
	</div>

	<!-- YouTube Section -->
	<div class="field-group">
		<label class="field-label">YouTube Video URL (Optional)</label>

		{#if youtubeUrl && !showYoutubeInput && !isEditingYoutube && !youtubeError}
			<div class="youtube-preview">
				<iframe
					src={getYouTubeEmbedUrl(youtubeUrl) || ''}
					title="YouTube video"
					frameborder="0"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
					allowfullscreen
					class="youtube-embed"
				></iframe>
				<div class="youtube-actions">
					<button type="button" onclick={editYoutubeUrl} class="btn-secondary"> Edit URL </button>
					<button type="button" onclick={removeYoutubeUrl} class="btn-danger"> Remove </button>
				</div>
			</div>
		{:else}
			<div class="youtube-input-group">
				<input
					type="url"
					bind:value={youtubeUrl}
					oninput={handleYoutubeInput}
					class="field-input"
					class:error={youtubeError}
					placeholder="https://www.youtube.com/watch?v=..."
				/>
				{#if youtubeError}
					<p class="field-error">{youtubeError}</p>
				{/if}
				{#if youtubeUrl && !youtubeError}
					<p class="field-hint field-success">✓ Valid YouTube URL</p>
				{/if}

				{#if isEditingYoutube}
					<div class="youtube-edit-actions">
						<button type="button" onclick={cancelYoutubeEdit} class="btn-secondary">
							Cancel
						</button>
						<button
							type="button"
							onclick={saveYoutubeUrl}
							class="btn-primary"
							disabled={!youtubeUrl || !!youtubeError}
						>
							Save URL
						</button>
					</div>
				{:else if youtubeUrl && !youtubeError}
					<button type="button" onclick={saveYoutubeUrl} class="btn-primary"> Add Video </button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.media-manager {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Field Groups */
	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	/* Photo Preview */
	.photo-preview {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.15);
	}

	.preview-image {
		width: 100%;
		height: auto;
		display: block;
		max-height: 300px;
		object-fit: cover;
	}

	.photo-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(15, 23, 42, 0.95);
	}

	/* File Input */
	.file-input {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-bg);
		border: 2px dashed rgba(148, 163, 184, 0.3);
		border-radius: 8px;
		color: var(--color-text);
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.file-input:hover {
		border-color: var(--color-primary);
	}

	/* YouTube Preview */
	.youtube-preview {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.youtube-embed {
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: 8px;
		border: 1px solid rgba(148, 163, 184, 0.15);
	}

	.youtube-actions {
		display: flex;
		gap: 0.5rem;
	}

	.youtube-input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.youtube-edit-actions {
		display: flex;
		gap: 0.5rem;
	}

	/* Input Fields */
	.field-input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.15);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		transition: border-color 0.2s ease;
	}

	.field-input::placeholder {
		color: var(--color-text-muted);
	}

	.field-input:focus {
		border-color: var(--color-primary);
	}

	.field-input.error {
		border-color: #ef4444;
	}

	/* Buttons */
	.btn-primary {
		padding: 0.625rem 1rem;
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		flex: 1;
		padding: 0.625rem 1rem;
		background: var(--color-bg);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-secondary:hover {
		background: rgba(148, 163, 184, 0.1);
		color: var(--color-text);
	}

	.btn-danger {
		flex: 1;
		padding: 0.625rem 1rem;
		background: rgba(239, 68, 68, 0.9);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-danger:hover {
		background: rgba(220, 38, 38, 1);
	}

	/* Field Hints */
	.field-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}

	.field-success {
		color: var(--color-secondary);
	}

	.field-error {
		font-size: 0.75rem;
		color: #ef4444;
		margin-top: 0.25rem;
	}
</style>
