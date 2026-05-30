# Firebase Cost Guardrails

This note records the cost controls currently in place for the Firebase/GCP side of Overdive Dreaming, plus the remaining places where spend can still escape a simple monthly target.

Important baseline: Firebase Blaze / Google Cloud budgets are alerting controls, not a guaranteed hard spend cap. A true hard stop requires automation that disables billing or disables services, and that can break production immediately. The current setup aims to reduce blast radius and warn early, not promise that spend can never exceed the budget.

## Current Project

- Firebase project: `overdive-dreaming-fb`
- GCP project number: `515149378190`
- Billing account: `0163DF-8418CF-1D5CC6`
- Existing project-scoped budget: `billingAccounts/0163DF-8418CF-1D5CC6/budgets/210b8f66-4e9b-4231-9cfa-cfdbeb5f5998`

## Completed Guardrails

### Billing Budget

The existing Firebase project budget was updated from `15 SGD` to `20 SGD` per calendar month.

Current threshold alerts are based on current spend:

- 50%: `10 SGD`
- 75%: `15 SGD`
- 90%: `18 SGD`
- 100%: `20 SGD`

The `billingbudgets.googleapis.com` API was enabled for `overdive-dreaming-fb`, and local ADC was configured with `overdive-dreaming-fb` as the quota project so budget commands can be run from this machine.

Verification command:

```sh
gcloud billing budgets describe \
  billingAccounts/0163DF-8418CF-1D5CC6/budgets/210b8f66-4e9b-4231-9cfa-cfdbeb5f5998 \
  --billing-account=0163DF-8418CF-1D5CC6 \
  --billing-project=overdive-dreaming-fb \
  --format=json
```

### Cloud Functions Instance Caps

Cloud Functions were updated and deployed with explicit `maxInstances`, timeout, and memory limits so runaway traffic has a bounded concurrency ceiling.

Media processing and overlay generation:

- `processMediaJob`: `maxInstances: 1`, `concurrency: 1`, `timeoutSeconds: 540`, `memory: 4GiB`, `cpu: 2`
- `onMediaProcessingJobCreated`: `maxInstances: 1`, `concurrency: 1`, `timeoutSeconds: 540`, `memory: 4GiB`, `cpu: 2`
- `requestOverlayDownload`: `maxInstances: 5`, `timeoutSeconds: 60`, `memory: 256MiB`

Media signing callables:

- `createMediaUpload`
- `getMediaReadUrl`
- `deleteMediaObject`
- `createDiveVideoMultipartUpload`
- `signDiveVideoPart`
- `completeDiveVideoMultipartUpload`
- `abortDiveVideoMultipartUpload`

These share `maxInstances: 10`, `timeoutSeconds: 60`, and `memory: 256MiB`.

Other write-heavy functions:

- `acceptDiveGift`: `maxInstances: 5`, `timeoutSeconds: 60`, `memory: 256MiB`
- `saveDiveVideoTimelineCorrection`: `maxInstances: 5`, `timeoutSeconds: 60`, `memory: 256MiB`
- `onDiveVideoCreated`: `maxInstances: 2`, `timeoutSeconds: 120`, `memory: 256MiB`

Validation and deployment completed:

```sh
npm --prefix functions run build
firebase deploy --only functions
```

The guardrail code was committed and pushed in `3d2d2d8 Add Firebase cost guardrails`.

## Remaining Risks

### Budget Alerts Are Not A Hard Cap

The `20 SGD` budget sends alerts, but it does not stop usage. Google Cloud billing data and budget notifications can lag behind real usage, so a traffic spike can exceed the target before alerts arrive.

### No Automatic Kill Switch Yet

No Pub/Sub budget notification or automated shutdown function is currently configured. A hard-stop style guardrail would need a budget notification topic plus automation to disable billing, disable selected services, or reduce traffic. That is powerful but risky because it can break production access, uploads, functions, or storage reads.

### Wasabi Costs Are Separate

This budget only covers Google Cloud / Firebase charges. Wasabi object storage, egress, and API request costs are outside this GCP billing budget. Because video storage and media downloads use Wasabi, a separate Wasabi-side budget/alert or operational monitoring is still needed.

### Firestore, Hosting, Storage, And Logs Can Still Accumulate Cost

Function instance caps reduce compute blast radius, but they do not directly cap:

- Firestore reads/writes from normal client traffic or inefficient queries.
- Firebase Hosting bandwidth.
- Google Cloud log ingestion and retention.
- Artifact Registry storage for function container images.
- Firebase Storage costs, if any legacy paths still use it.

### Abuse Protection Depends On Rules And App Check

Firestore and Storage security rules still matter. App Check should be enabled and enforced where possible for callable functions and Firebase services. Without enforcement, authenticated abuse or leaked app configuration can still drive reads, writes, and callable invocations.

### Function Caps Can Degrade Availability

The `maxInstances` values intentionally trade capacity for cost safety. If legitimate traffic exceeds these caps, users may see slower media processing, queued overlay exports, or temporarily unavailable callable functions.

## Recommended Next Steps

1. Add a Pub/Sub notification channel to the `20 SGD` budget.
2. Decide whether the automated response should be a hard billing disable, a safer selective throttle, or just a high-priority alert.
3. Add service-specific GCP alerts for Cloud Run / Functions invocations, Firestore reads/writes, log ingestion, and egress.
4. Review and enforce Firebase App Check for production app clients and callable functions.
5. Add Wasabi-side budget or usage alerts, especially for egress and stored video growth.
6. Review Cloud Logging retention and exclusions for noisy function logs.
7. Periodically verify function `maxInstances` after deployments, especially for media-processing functions.