# Video — implementation map

Up: [Docs index](../INDEX.md) · Status: current navigation; verify behaviour in the linked code

## Find the owner

| Task | Implementation | Verification / context |
|---|---|---|
| Recording resolution, quality and size estimate | [videoQuality.ts](../../src/lib/capture/videoQuality.ts) | [Tests](../../src/lib/capture/videoQuality.test.ts); use recording defaults, not legacy-video fallbacks |
| Recorder setup defaults | [recorderDefaults.ts](../../src/lib/capture/recorderDefaults.ts), [record route](../../src/routes/%28app%29/dive/record/%5Bid%5D/+page.svelte) | [Tests](../../src/lib/capture/recorderDefaults.test.ts); per-discipline pool, waypoint and optional AIDA AP values, with legacy global fallback |
| Recorder transitions and timeline conversion | [recorderState.ts](../../src/lib/capture/recorderState.ts), [timeline.ts](../../src/lib/capture/timeline.ts) | [State tests](../../src/lib/capture/recorderState.test.ts), [timeline tests](../../src/lib/capture/timeline.test.ts) |
| Pending uploads and exhausted retries | [uploadQueue.ts](../../src/lib/capture/uploadQueue.ts), [uploadProcessor.ts](../../src/lib/capture/uploadProcessor.ts) | Inspect attempt limit, resetAttempts and drain behaviour together; never remove the only recovery action |
| HUD data, speed graph and layout | [shareHud](../../src/lib/media/shareHud/) | [Model tests](../../src/lib/media/shareHud/model.test.ts), [layout tests](../../src/lib/media/shareHud/layout.test.ts), [speed tests](../../src/lib/media/shareHud/speedGraph.test.ts) |
| In-app HUD rendering | [ShareHudSvg](../../src/lib/components/ShareHudSvg.svelte), [DiveVideoPlayer](../../src/lib/components/DiveVideoPlayer.svelte) | Shared model/layout; browser playback still needs visual/device checks |
| Export duration and result-card hold | [exportPlan.ts](../../src/lib/media/shareHud/exportPlan.ts) | [Tests](../../src/lib/media/shareHud/exportPlan.test.ts) |
| Server export and resource limits | [mediaWorker.ts](../../functions/src/mediaWorker.ts) | [Deployment map](../storage-infra/README.md); inspect actual worker configuration before estimating costs |
| Persisted video shapes and storage | [types.ts](../../src/lib/types.ts), [storage.ts](../../src/lib/storage.ts) | Call out schema, storage-key and Functions changes explicitly |

## Boundaries

- Shared HUD modules must remain browser-independent and usable from Functions; avoid DOM and app-only `$lib` imports there.
- Changing shared rendering can require both app and Functions deployment. Check render-key/style invalidation, not just the visual result.
- Automatic queue draining does not mean unlimited retries. Preserve manual recovery for exhausted attempts.
- Recording defaults are owned by `videoQuality.ts` for media quality and `recorderDefaults.ts` for setup values. Historical specifications below contain old defaults and must not override them.
- `UserSettings.recorder.defaultsByDiscipline` is the per-user setup-default schema. Updates must preserve sibling recorder settings such as `framingGuide`.
- Unit tests do not prove camera behaviour, offline recovery or export memory usage on real devices/workers.

## Design history and remaining work

- [Social cut implementation](social-cut-implementation.md): plan and status for the Reel-first social cut (phase 2 of the share HUD redesign).
- [Share HUD redesign](share-hud-redesign.md): mixed implementation history and proposed follow-ups. Read individual sections against code; its old headline status is not a deployment record.
- Superseded: [Original video overview](overview.md): historical master specification containing superseded defaults and proposals.
- [Device QA checklist](qa-checklist.md): starting point for manual coverage; review against the flow being changed.

This map establishes ownership, not a claim that every video plan has shipped. Older plans remain discoverable through the [index](../INDEX.md).
