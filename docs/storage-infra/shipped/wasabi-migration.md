# Wasabi Object Storage Migration Plan

> Goal: move Overdive session photos and in-app dive video recordings from
> Firebase Storage to Wasabi object storage, while keeping Firebase Auth and
> Firestore as the application identity and metadata layer.
>
> Status: planning only. Do not implement until explicitly approved.

---

## 1. Context

Overdive currently stores binary media in Firebase Storage:

- Session photos: `session-photos/{userId}/{routineLogId}/{fileName}`
- Biometric CSVs: `biometric-csvs/{userId}/{routineLogId}/{fileName}`
- Dive videos: `users/{userId}/videos/{videoId}/clean.{mp4|webm}`
- Dive thumbnails: `users/{userId}/videos/{videoId}/thumb.jpg`
- Optional burned overlay videos: `users/{userId}/videos/{videoId}/burned.mp4`

Relevant current files:

- `src/lib/storage.ts` handles photo and biometric CSV upload/delete.
- `src/lib/services/diveVideos.ts` handles video Firestore docs, Firebase
  Storage uploads, download URLs, deletion, and client-side retention reaping.
- `src/lib/capture/uploadQueue.ts` stores pending recorder blobs in IndexedDB.
- `src/lib/capture/uploadProcessor.ts` drains the queue into Firebase Storage.
- `functions/src/retentionReaper.ts` deletes old video objects from Firebase
  Storage after new `diveVideos` documents are created.
- `storage.rules` currently enforces Firebase Storage access rules.

Wasabi is S3-compatible. Official docs state that S3-compatible clients can use
Wasabi by pointing to the correct Wasabi endpoint and using Wasabi access keys;
they also note that region-specific service URLs matter, and that using the
wrong endpoint can permit some reads while breaking writes/deletes.

Official references:

- Wasabi S3 compatibility:
  https://docs.wasabi.com/docs/since-wasabi-is-100-bit-compatible-with-amazon-s3-can-i-use-my-existing-s3-compatible-application-without-making-any-changes-to-my-application-with-wasabi
- Wasabi S3 API reference:
  https://docs.wasabi.com/apidocs/wasabi-api
- Wasabi access keys:
  https://docs.wasabi.com/v1/docs/access-keys-1
- Wasabi multipart uploads:
  https://docs.wasabi.com/docs/how-does-wasabi-handle-multipart-uploads
- Wasabi CORS behavior:
  https://docs.wasabi.com/apidocs/bucket-cors-support-with-the-wasabi-s3-api
- Wasabi private bucket check:
  https://docs.wasabi.com/docs/how-can-i-check-if-my-bucket-is-private

---

## 2. Recommendation

Use Wasabi as a **private object store** and keep Firestore as the source of
truth for metadata, ownership, visibility, gifting, retention tier, and session
relationships.

Do **not** put Wasabi access keys in the browser.

Recommended architecture:

1. Browser authenticates with Firebase as it does today.
2. Browser asks a Firebase Cloud Function for a signed upload/download/delete
   operation.
3. Cloud Function verifies the Firebase ID token, checks Firestore ownership /
   visibility rules, validates content type and size, then signs a Wasabi S3
   operation.
4. Browser uploads/downloads directly to/from Wasabi using the short-lived signed
   URL.
5. Firestore stores object keys and storage provider metadata, not permanent
   public URLs.

This preserves the current app model while replacing Firebase Storage as the
binary blob backend.

---

## 3. Key Design Decisions

### 3.1 Storage Provider Abstraction

Add a thin media storage layer instead of spreading Wasabi calls across UI code.

Suggested files:

- `src/lib/media/types.ts`
- `src/lib/media/keys.ts`
- `src/lib/media/client.ts`
- `src/lib/media/photoMedia.ts`
- `src/lib/media/diveVideoMedia.ts`
- `functions/src/wasabiClient.ts`
- `functions/src/mediaSigning.ts`
- `functions/src/mediaRetention.ts`

The browser-facing code should speak in application concepts:

- `createPhotoUpload()`
- `uploadPhotoWithSignedUrl()`
- `getPhotoReadUrl()`
- `createDiveVideoUploadSession()`
- `uploadDiveVideoMultipart()`
- `getDiveVideoReadUrl()`
- `deleteMediaObject()`

Only server-side functions should know about Wasabi credentials and signing.

### 3.2 Firestore Metadata Remains Canonical

Keep:

- `routineLogs.photoUrl` for backward compatibility during transition.
- `routineLogs.biometricCsvUrl` for backward compatibility during transition.
- `diveVideos.storagePathClean`
- `diveVideos.thumbnailPath`
- `diveVideos.storagePathBurned`

Add provider-aware fields:

```ts
export type MediaStorageProvider = 'firebase-storage' | 'wasabi';

export interface MediaObjectRef {
  provider: MediaStorageProvider;
  bucket?: string;
  key: string;
  contentType?: string;
  sizeBytes?: number;
  createdAt?: Timestamp;
}
```

Add to `RoutineLog`:

```ts
photoObject?: MediaObjectRef;
biometricCsvObject?: MediaObjectRef;
```

Add to `DiveVideo`:

```ts
storageProvider?: MediaStorageProvider;
cleanObject?: MediaObjectRef;
thumbnailObject?: MediaObjectRef;
burnedObject?: MediaObjectRef;
```

For compatibility, keep existing string path fields for now:

- `storagePathClean`
- `thumbnailPath`
- `storagePathBurned`

For Wasabi records, these can initially hold the Wasabi object key. Later, after
the migration stabilizes, readers can use only the `*Object` fields.

### 3.3 Private Bucket, Signed Reads

Use a private Wasabi bucket.

Do not store public Wasabi URLs directly in Firestore for private user media.
Instead, store object keys and request signed read URLs when rendering:

- dashboard feed cards
- session detail pages
- share card photo loader
- video player source URLs

Signed read URLs should be short-lived. Initial recommendation:

- Photos: 15-60 minutes
- Videos: 15-60 minutes
- Upload URLs: 10-30 minutes

### 3.4 Upload Strategy

Photos and CSVs:

- Use single-object presigned `PUT`.
- Keep current photo 5 MB limit unless we intentionally change it.
- Keep CSV 1 MB limit.
- Browser can use `XMLHttpRequest` for upload progress.

Videos:

- Use S3 multipart upload via Wasabi for recorder videos.
- Wasabi supports S3 multipart upload and incomplete multipart uploads are
  automatically removed after roughly 31 days according to Wasabi docs.
- Store `uploadId`, part size, uploaded part ETags, and object key in the
  IndexedDB queue so interrupted uploads can continue or restart cleanly.

Rationale:

- The current Firebase upload uses resumable uploads.
- Replacing it with one big `PUT` would be simpler but worse on pool-deck
  networks.
- Multipart upload gives predictable progress, retry-per-part behavior, and
  avoids restarting a 100-500 MB video from zero.

### 3.5 Security Boundary

Firebase Storage Rules will no longer protect Wasabi objects.

The replacement security boundary is:

- Firestore rules protect metadata.
- Firebase Cloud Functions verify Firebase Auth.
- Cloud Functions validate user ownership / visibility / gift access before
  signing read or delete operations.
- Wasabi IAM policy limits the application key to the specific bucket and
  required S3 actions.

---

## 4. Wasabi Setup Guide and Account Information Needed

Please do **not** paste secret keys into chat unless you are comfortable
rotating them immediately afterward. Ideally, we add them directly to local
`.env` / Firebase Functions secrets.

This section assumes nothing has been created in Wasabi yet.

### 4.1 Recommended Initial Setup

Recommendation for Overdive:

- Bucket: `overdive-media-prod`
- Region: choose the closest region to the main user base.
  - If most testing/use is in Singapore/Asia: `ap-southeast-1`
  - If most users are in the UK/Europe: `eu-west-1` or another EU/UK region
  - If most users are in the US: a US region
- Access: private bucket only
- Key type: application-specific sub-user key, not root account key
- Environment split: eventually `overdive-media-dev` and
  `overdive-media-prod`; for the first implementation we can start with prod
  only if that matches how the app is currently deployed.

### 4.2 Create a Bucket

1. Sign in to the Wasabi console:
   - https://console.wasabisys.com

2. In the left navigation, open **Buckets**.

3. Click **Create Bucket**.

4. Enter a bucket name.
   - Suggested: `overdive-media-prod`
   - Bucket names are global-ish S3 names. If that name is unavailable, use
     something unique such as `overdive-media-prod-thomas` or
     `overdive-dreaming-media-prod`.

5. Select the storage region.
   - Write down the exact region shown in the console. 
	   - Region: Singapore ap-southeast-1
	   - s3.ap-southeast-1.wasabisys.com
   - This is the value we need later as `WASABI_REGION`.

6. Leave public access disabled / private.
   - Wasabi buckets are private by default according to Wasabi docs.
   - Do not enable public access for this project.

4. Create the bucket.


Information to give me after this step:

```txt
Bucket name: overdive-media-prod
Bucket region: ap-southeast-1 / s3.ap-southeast-1.wasabisys.com
```

*Note: I was asked to complete the following settings. I left them switched of by default. Please indicate whether these should be used or not.*
*Set Properties*

*Bucket Versioning: Suspended*

*Object Lock: Suspended*

*Logging*

*Bucket Logging: Suspended*

*Replication*

*Create an Object Replication job now? No*

*Tags: No tags applied*

### 4.3 Find the Correct S3 Endpoint URL

The endpoint depends on the bucket region. Wasabi's region service URL table is
here:

https://docs.wasabi.com/docs/service-urls-for-wasabis-storage-regions

Common examples:

| Region           | Endpoint                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `us-east-1`      | `https://s3.us-east-1.wasabisys.com` or `https://s3.wasabisys.com` |
| `us-west-1`      | `https://s3.us-west-1.wasabisys.com`                               |
| `eu-west-1`      | `https://s3.eu-west-1.wasabisys.com`                               |
| `ap-southeast-1` | `https://s3.ap-southeast-1.wasabisys.com`                          |
| `ap-southeast-2` | `https://s3.ap-southeast-2.wasabisys.com`                          |

Information to give me after this step:

```txt
Wasabi endpoint URL: https://s3.ap-southeast-1.wasabisys.com
```

### 4.4 Verify the Bucket Is Private

Open a private/incognito browser window where you are **not** signed in to
Wasabi.

Try both URL forms, replacing values:

```txt
https://{endpoint-without-https}/{bucket-name}
https://{bucket-name}.{endpoint-without-https}
```

Example for `ap-southeast-1`:

```txt
https://s3.ap-southeast-1.wasabisys.com/overdive-media-prod
https://overdive-media-prod.s3.ap-southeast-1.wasabisys.com/
```

Expected result:

- Access denied / forbidden is good.
- A list of files/objects is bad and means the bucket is public.

Information to give me after this step:

```txt
Private bucket check result: Access denied
```

### 4.5 Create an Application Sub-User

Do not use the root Wasabi account key for the app if avoidable. Wasabi docs
also recommend sub-users for delegated/programmatic access.

1. In the Wasabi console, open **Users**.

2. Click **Create User**.

3. Name the user something like:

```txt
overdive-media-app
```

4. Enable programmatic/API access.
   - Console access is optional. For the app, API access is what matters.

5. Attach a restricted policy.
   - If the console makes this awkward, start with a temporary broader policy
     only for the first smoke test, then replace it with a bucket-scoped policy
     before real user uploads.
   - Final target: this user should only access the Overdive media bucket, not
     billing, users, or unrelated buckets.

Information to give me after this step:

```txt
Sub-user name: overdive-media-app
```

### 4.6 Create an Access Key

1. In the Wasabi console, open **Access Keys**.

2. Click **Create Access Key**.

3. Choose **Sub-User**, then select the app sub-user, e.g.
   `overdive-media-app`.

4. Create the key.

5. Copy/download the key immediately.
   - Wasabi docs note that if you do not save the secret key at creation time,
     you cannot retrieve it later.

What to do with the key:

- Do not commit it.
- Do not paste the secret into the plan file.
- If you need me to wire it into local development, we can add it directly to
  your local `.env` or Firebase Functions secrets.

Information to give me after this step:

```txt
Access Key ID: DX7DKUF7HKGL3Y8RIIS4

Secret Access Key: rotated and stored privately; do not paste into chat or this
document.
```

### 4.7 Add a Bucket-Scoped Policy

The final app key should have least-privilege access to only this bucket. We can
write the exact policy once the bucket name is known.

Policy intent:

- Allow object read/write/delete under the chosen bucket/prefix.
- Allow multipart upload actions for videos.
- Avoid account administration permissions.
- Avoid access to other buckets.

If using one bucket with prefixes:

```txt
prod/*
dev/*
```

If using separate buckets:

```txt
overdive-media-prod/*
overdive-media-dev/*
```

Information to give me after this step:

```txt
Policy attached to sub-user: yes/no
Policy name:
```

#### 4.7.1 Recommended Policy for Current Bucket

For the current setup:

```txt
Bucket: overdive-media-prod
Sub-user: overdive-media-app
```

Create a policy named:

```txt
overdive-media-prod-app-policy
```

Use this JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBucketListingForMultipartAndDiagnostics",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": "arn:aws:s3:::overdive-media-prod"
    },
    {
      "Sid": "AllowObjectMediaOperations",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::overdive-media-prod/*"
    }
  ]
}
```

Why this policy:

- `s3:PutObject` covers photo uploads, CSV uploads, thumbnails, video parts,
  and multipart completion.
- `s3:GetObject` lets our server generate signed read URLs.
- `s3:DeleteObject` lets the app delete photos/videos and lets the retention
  reaper delete old videos.
- `s3:AbortMultipartUpload` and multipart listing permissions are needed for
  robust video upload cleanup/retry.
- The resources are restricted to only `overdive-media-prod`.

#### 4.7.2 How to Add the Policy in Wasabi

1. Open the Wasabi console.

2. Go to **Policies**.

3. Click **Create Policy**.

4. Name it:

```txt
overdive-media-prod-app-policy
```

5. Paste the JSON from section 4.7.1.

6. Save the policy.

7. Go to **Users**.

8. Open:

```txt
overdive-media-app
```

9. Find **Permissions**, **Policies**, or **Attach Policy**.

10. Attach:

```txt
overdive-media-prod-app-policy
```

11. Save.

Information to give me after this step:

```txt
Policy attached to sub-user: yes
Policy name: overdive-media-prod-app-policy
```

#### 4.7.3 Rotate the Current Access Key

Because the secret access key was pasted into chat and this document during
planning, rotate it before implementation:

1. In Wasabi, go to **Access Keys**.
2. Create a new access key for `overdive-media-app`.
3. Store the new secret somewhere private.
4. Delete/deactivate the exposed key.
5. Do not paste the new secret into this document or chat.

*Done*
For implementation, the secret should be entered directly into Firebase
Functions secrets or a local `.env` file.

### 4.8 Decide Dev/Prod Bucket Strategy

Choose one:

1. Separate buckets
   - `overdive-media-dev`
   - `overdive-media-prod`
   - Cleaner and safer.
   - Recommended if you expect to test real uploads locally.

2. One bucket with prefixes
   - `dev/users/...`
   - `prod/users/...`
   - Slightly simpler account setup, but easier to mix environments by mistake.

Recommendation: separate buckets if Wasabi does not charge meaningfully per
empty bucket; otherwise one bucket with strict prefixes is acceptable.

Information to give me:

```txt
Dev/prod strategy: Separate buckets
```

#### 4.8.1 Next Step: Create the Dev Bucket

Because the chosen strategy is separate buckets, create a second bucket for
development/testing:

```txt
overdive-media-dev
```

Use the same region as production unless there is a clear reason not to:

```txt
ap-southeast-1
```

Keep the same bucket settings as production:

- Public access: disabled/private
- Bucket versioning: suspended for now
- Object lock: suspended for now
- Bucket logging: suspended for now
- Replication: no

Then run the same private bucket check:

```txt
https://s3.ap-southeast-1.wasabisys.com/overdive-media-dev
https://overdive-media-dev.s3.ap-southeast-1.wasabisys.com/
```

Expected result:

```txt
Access denied
```

#### 4.8.2 Update the Policy for Separate Buckets

If one sub-user/key should access both dev and prod, update
`overdive-media-prod-app-policy` or create a new policy named:

```txt
overdive-media-app-policy
```

Use this JSON after both buckets exist:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBucketListingForMultipartAndDiagnostics",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::overdive-media-prod",
        "arn:aws:s3:::overdive-media-dev"
      ]
    },
    {
      "Sid": "AllowObjectMediaOperations",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::overdive-media-prod/*",
        "arn:aws:s3:::overdive-media-dev/*"
      ]
    }
  ]
}
```

Attach the updated policy to:

```txt
overdive-media-app
```

Alternative, stricter setup:

- Create `overdive-media-app-prod` for prod.
- Create `overdive-media-app-dev` for dev.
- Use separate access keys.

That is more secure, but more setup. One sub-user scoped to both media buckets is
acceptable for the first implementation if the key is stored only in server-side
secrets.

### 4.9 Information Checklist for Implementation

Once setup is done, I need:

```txt
Prod bucket name: overdive-media-prod
Dev bucket name: overdive-media-dev
Bucket region: ap-southeast-1
Wasabi endpoint URL: https://s3.ap-southeast-1.wasabisys.com
Dev/prod strategy: separate buckets
Sub-user name: overdive-media-app
Access Key ID: DX7DKUF7HKGL3Y8RIIS4
Secret Access Key stored where: stored privately; do not add a link or paste the
secret here
Private bucket check result: prod Access denied; dev Access denied
Policy attached to sub-user: overdive-media-prod-app-policy; updated to include
both `overdive-media-prod` and `overdive-media-dev`
Firebase Functions deployable on this Firebase project: unknown; verify in Phase A
Move biometric CSVs too: no
Video retention cap: 100 non-pinned videos
```

Remaining setup checks before implementation:

- [x] Confirm the dev bucket name is intentionally
      `overdive-media-dev`.
- [x] Run the private bucket check for the dev bucket. Expected result:
      `Access denied`.
- [x] Confirm whether `overdive-media-prod-app-policy` was updated to include
      the dev bucket as well as prod. If it only contains
      `overdive-media-prod`, local/dev uploads will fail.
- [x] Replace "Keep 20-video retention cap: no" with the desired new retention:
      `100 non-pinned videos`.
    
- [ ] Confirm Firebase Functions deployability. If not sure, this becomes part
      of Phase A: verify Firebase project billing/Blaze status and run a
      functions deployment smoke test.

---

## 5. Proposed Object Key Layout

Use stable, non-user-supplied keys. Preserve the current rough hierarchy but
standardize around app concepts.

```txt
users/{userId}/routineLogs/{routineLogId}/photos/{photoId}.{ext}
users/{userId}/routineLogs/{routineLogId}/biometrics/{csvId}.csv
users/{userId}/videos/{videoId}/clean.{mp4|webm}
users/{userId}/videos/{videoId}/thumb.jpg
users/{userId}/videos/{videoId}/burned.mp4
```

Optional environment prefix:

```txt
prod/users/{userId}/...
dev/users/{userId}/...
```

Recommendation:

- Use separate buckets for dev/prod if possible.
- If using one bucket, require an environment prefix and make it part of every
  signed key.

Filename rules:

- Do not trust `file.name` for object keys.
- Derive extension from validated MIME type.
- Generate IDs with Firestore doc IDs or `crypto.randomUUID()`.

---

## 6. Backend Signing Functions

Add Firebase Functions that use the AWS SDK S3 client configured for Wasabi.

Dependencies in `functions/package.json`:

```json
{
  "@aws-sdk/client-s3": "...",
  "@aws-sdk/s3-request-presigner": "..."
}
```

Environment/secrets:

```txt
WASABI_REGION=
WASABI_ENDPOINT=
WASABI_BUCKET=
WASABI_ACCESS_KEY_ID=
WASABI_SECRET_ACCESS_KEY=
WASABI_KEY_PREFIX=prod
```

Functions:

### 6.1 `createMediaUpload`

Purpose:

- Sign a single-object upload for photos, CSVs, thumbnails, or small test files.

Input:

```ts
{
  kind: 'session-photo' | 'biometric-csv' | 'video-thumbnail';
  userId: string;
  routineLogId?: string;
  videoId?: string;
  contentType: string;
  sizeBytes: number;
}
```

Checks:

- Auth user matches `userId`.
- Content type and size match policy.
- Referenced `routineLogId` / `videoId` belongs to user where applicable.

Output:

```ts
{
  provider: 'wasabi';
  bucket: string;
  key: string;
  uploadUrl: string;
  expiresAt: number;
  requiredHeaders: Record<string, string>;
}
```

### 6.2 `createDiveVideoMultipartUpload`

Purpose:

- Start a multipart upload for the raw recorder blob.

Input:

```ts
{
  videoId: string;
  userId: string;
  contentType: 'video/mp4' | 'video/webm' | string;
  sizeBytes: number;
  partSizeBytes: number;
}
```

Checks:

- Auth user owns the `diveVideos/{videoId}` document.
- Content type starts with `video/`.
- Size is below configured limit, currently 500 MB unless changed.

Output:

```ts
{
  provider: 'wasabi';
  bucket: string;
  key: string;
  uploadId: string;
  partSizeBytes: number;
}
```

### 6.3 `signDiveVideoPart`

Purpose:

- Sign one or more `UploadPart` URLs for an existing multipart upload.

Input:

```ts
{
  videoId: string;
  key: string;
  uploadId: string;
  partNumbers: number[];
}
```

Output:

```ts
{
  parts: Array<{ partNumber: number; uploadUrl: string; expiresAt: number }>
}
```

### 6.4 `completeDiveVideoMultipartUpload`

Purpose:

- Complete the Wasabi multipart upload after all parts succeed.

Input:

```ts
{
  videoId: string;
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}
```

Side effects:

- Complete multipart upload in Wasabi.
- Update `diveVideos/{videoId}` with:
  - `uploadStatus: 'uploaded'`
  - `storageProvider: 'wasabi'`
  - `storagePathClean: key`
  - `cleanObject`
  - `updatedAt`

### 6.5 `abortDiveVideoMultipartUpload`

Purpose:

- Abort a failed/stale multipart upload.

Use cases:

- User deletes a pending upload.
- Upload is permanently failed.
- Manual cleanup.

### 6.6 `getMediaReadUrl`

Purpose:

- Generate a signed read URL for a photo, CSV, thumbnail, or video.

Input:

```ts
{
  kind: 'session-photo' | 'biometric-csv' | 'dive-video-clean' | 'dive-video-thumb' | 'dive-video-burned';
  routineLogId?: string;
  videoId?: string;
  key?: string;
}
```

Checks:

- For routine log media: owner can read; public logs can be read by
  authenticated users if existing app behavior allows that media to show in the
  community feed.
- For dive video media: owner or athlete recipient can read, mirroring
  Firestore `diveVideos` rules.

Output:

```ts
{
  url: string;
  expiresAt: number;
}
```

### 6.7 `deleteMediaObject`

Purpose:

- Delete an object from Wasabi after auth checks.

Use cases:

- Delete session photo.
- Delete biometric CSV.
- Delete dive video from session detail.
- Retention reaper deletion.

---

## 7. Frontend Changes

### 7.1 Replace `src/lib/storage.ts`

Keep the public API initially:

- `uploadSessionPhoto(...)`
- `deleteSessionPhoto(...)`
- `uploadBiometricCsv(...)`
- `deleteBiometricCsv(...)`
- `isValidYouTubeUrl(...)`
- `getYouTubeEmbedUrl(...)`

Internally:

- Request signed Wasabi upload from function.
- Upload via `XMLHttpRequest` so progress still works.
- Return an object ref or signed URL depending on caller needs.

During transition, `uploadSessionPhoto()` can return a signed read URL for
immediate display while the caller stores both:

- `photoUrl` temporary signed URL or legacy URL
- `photoObject` durable object reference

Longer term, readers should use `photoObject` and call `getMediaReadUrl()`.

### 7.2 Update Photo Readers

Update places that directly use `log.photoUrl`:

- `SessionCard.svelte`
- session detail page
- `shareCard.ts`
- any dashboard/community feed image renderers

Reader behavior:

1. If `photoObject.provider === 'wasabi'`, request signed URL and render that.
2. Else fallback to `photoUrl` for legacy Firebase Storage images.

### 7.3 Update Dive Video Service

Refactor `src/lib/services/diveVideos.ts`:

- Stop importing `firebase/storage` directly.
- Keep Firestore doc creation/listing logic.
- Move object upload/read/delete operations into media storage helpers.
- `getDiveVideoDownloadUrl(storagePath)` becomes provider-aware:
  - Wasabi: call function for signed read URL.
  - Firebase legacy: call Firebase `getDownloadURL()`.

### 7.4 Update Upload Queue

Extend `PendingUpload` in `src/lib/capture/uploadQueue.ts`:

```ts
wasabiUpload?: {
  key: string;
  uploadId: string;
  partSizeBytes: number;
  uploadedParts: Array<{ partNumber: number; etag: string; sizeBytes: number }>;
};
```

Drain behavior:

1. Create/reuse `diveVideos` doc.
2. Create/reuse Wasabi multipart upload.
3. Slice blob into parts.
4. Upload missing parts.
5. Persist uploaded part ETags after each successful part.
6. Complete multipart upload.
7. Mark Firestore doc uploaded.
8. Remove IndexedDB queue item.
9. Run retention reaper.

### 7.5 Upload Diagnostics

Keep the diagnostics panel, but rename Firebase-specific messages:

- `storage:start` -> `object-storage:start`
- `Firebase Storage upload completed` -> `Wasabi upload completed`
- Include `provider`, `key`, `uploadId`, `partNumber`, and retry details.

This is important because the recorder has already needed detailed diagnostics.

---

## 8. Cloud Function Retention Reaper

Update `functions/src/retentionReaper.ts`:

- If `storageProvider === 'wasabi'`, delete Wasabi object keys via S3 `DeleteObject`.
- If missing or `firebase-storage`, keep existing Firebase Admin Storage delete.
- Continue deleting Firestore doc after object deletion.
- Keep audit docs, but include `provider` per deleted object.

This lets old Firebase videos and new Wasabi videos coexist during migration.

---

## 9. Migration Strategy

Use a staged migration. Avoid a flag day.

### Phase A: Wasabi Setup Validation

- Create bucket.
- Create app-specific Wasabi sub-user/access key.
- Apply least-privilege IAM policy.
- Verify private bucket returns Access Denied when opened anonymously.
- Upload/download/delete a test object using a local script.
- Verify browser signed `PUT` and signed `GET`.

### Phase B: Add Provider-Aware Schema

- Add `MediaObjectRef` and provider fields to TypeScript types.
- Readers continue to support existing Firebase URLs/paths.
- No behavior change yet.

### Phase C: Add Signing Functions

- Add Wasabi client and signing functions in `functions/`.
- Add emulator/local test path where possible.
- Add one local script to smoke-test signing against real Wasabi.

### Phase D: Move New Photos First

- Change new session photo uploads to Wasabi.
- Keep old Firebase photos readable.
- Exercise dashboard/session/share-card image display.

Why photos first:

- Small objects.
- Simpler upload path.
- Lower risk than recorder videos.

### Phase E: Move New Video Thumbnails

- Change generated thumbnails to Wasabi.
- Ensure `thumbnailObject` and/or `thumbnailPath` is written.
- Validate feed/session video previews still load.

### Phase F: Move New Dive Videos

- Implement multipart video upload queue.
- Keep existing Firebase Storage videos readable.
- New videos write `storageProvider: 'wasabi'`.
- Run heavy mobile testing:
  - iPhone Safari / installed PWA
  - Android Chrome
  - flaky wifi / offline then retry
  - app background/foreground during upload
  - upload failure and manual retry

### Phase G: Update Retention Reaper

- Make retention reaper provider-aware.
- Deploy in dry-run mode first.
- Verify audit docs list the correct Wasabi keys.
- Disable dry-run after validation.

### Phase H: Backfill Existing Media

Create a migration script:

```txt
Firebase Storage object -> local stream/buffer -> Wasabi PutObject -> Firestore update
```

Backfill order:

1. Dive video thumbnails
2. Session photos
3. Dive video clean files
4. Burned exports if any
5. Biometric CSVs if we choose to include CSVs in this migration

Script requirements:

- Dry-run mode.
- Resume mode.
- Per-object audit log.
- Do not delete Firebase Storage originals initially.
- Validate Wasabi `HeadObject` size/content type after copy.
- Only flip Firestore provider fields after validation.

### Phase I: Cutover and Cleanup

- After all readers are provider-aware and old objects are copied:
  - Stop writing new Firebase Storage objects.
  - Keep legacy fallback for at least one release cycle.
  - Export inventory of Firebase Storage objects.
  - Only delete Firebase Storage originals after a separate explicit approval.

---

## 10. IAM Policy Shape

Use a Wasabi sub-user or application key scoped to the media bucket.

Required actions:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`
- `s3:AbortMultipartUpload`
- `s3:CreateMultipartUpload` equivalent via S3 API permissions
- `s3:UploadPart` equivalent via S3 API permissions
- `s3:ListBucketMultipartUploads` if needed for cleanup tooling
- `s3:ListBucket` only if migration/cleanup scripts require it

Restrict resources to:

```txt
arn:aws:s3:::BUCKET_NAME
arn:aws:s3:::BUCKET_NAME/prod/*
```

If Wasabi's IAM policy syntax differs for multipart-specific actions, verify in
the Wasabi console/docs before applying. Keep the app key unable to manage users
or other buckets.

---

## 11. Local Development

Add `.env.example` entries:

```txt
WASABI_REGION=
WASABI_ENDPOINT=
WASABI_BUCKET=
WASABI_KEY_PREFIX=dev
```

Secrets should not go in `.env.example`:

```txt
WASABI_ACCESS_KEY_ID=
WASABI_SECRET_ACCESS_KEY=
```

For Firebase Functions deployment, use Firebase Functions secrets if available:

```txt
firebase functions:secrets:set WASABI_ACCESS_KEY_ID
firebase functions:secrets:set WASABI_SECRET_ACCESS_KEY
```

Non-secret config can be environment params or normal deployment config.

---

## 12. Testing Plan

### Unit Tests

- Object key generation:
  - no raw user filenames
  - stable extensions by content type
  - dev/prod prefix included
- Media policy validation:
  - reject wrong MIME types
  - reject oversized photos/videos
  - reject path traversal / user-supplied keys
- Provider selection:
  - Wasabi object refs use signed URLs
  - Firebase legacy refs still use `getDownloadURL`

### Function Tests / Integration Smoke Tests

- Signed photo upload succeeds.
- Signed photo upload rejects bad content type.
- Signed read URL works for owner.
- Signed read URL rejects unrelated user.
- Multipart upload:
  - start
  - sign parts
  - upload parts
  - complete
  - read back object size
  - abort failure path

### Manual QA

- Log a session with photo.
- Edit a session and replace/remove photo.
- View photo in dashboard card.
- View photo in session detail.
- Generate share card from Wasabi-backed photo.
- Record a short DYN video and upload on strong wifi.
- Record a video, go offline before upload, return online, verify retry.
- Kill/reopen installed PWA while upload is pending.
- Verify Profile > Pending video uploads still reports useful state.
- Verify retention reaper does not delete pinned videos.
- Verify old Firebase Storage videos still play.
- Verify old Firebase Storage photos still render.

---

## 13. Rollback Plan

Keep Firebase Storage write code behind a provider flag until Wasabi is proven.

Suggested feature flags:

```ts
mediaWriteProvider: 'firebase-storage' | 'wasabi'
videoWriteProvider: 'firebase-storage' | 'wasabi'
```

Rollback options:

1. Flip new writes back to Firebase Storage.
2. Keep Wasabi reader support for any objects already written.
3. Leave migrated Firestore object refs untouched.
4. Resume Wasabi rollout after fixing issue.

Never delete Firebase originals during initial rollout.

---

## 14. Risks and Mitigations

### Risk: Wasabi Credentials Leak

Mitigation:

- No credentials in browser.
- Functions-only signing.
- App-specific sub-user / least privilege key.
- Rotate key after initial setup tests if it was ever pasted into an unsafe
  place.

### Risk: Signed URLs Expire During Long Video Playback

Mitigation:

- Use longer read URL expiry for videos, e.g. 60 minutes.
- If playback fails with an auth/expiry-like error, request a fresh signed URL
  and retry once.

### Risk: Multipart Upload State Gets Stuck

Mitigation:

- Persist `uploadId` and uploaded ETags in IndexedDB.
- Add manual retry/reset in Profile.
- Add abort function.
- Rely on Wasabi's incomplete multipart cleanup as a final safety net.

### Risk: CORS Differences

Mitigation:

- Wasabi docs describe broad CORS response headers when an `Origin` header is
  present, but we should still run real browser tests for `PUT`, `GET`,
  `HEAD`, and multipart `PUT`.
- Use required signed headers consistently; do not sign headers the browser
  will not send.

### Risk: Existing Firebase URLs Remain in Firestore

Mitigation:

- Provider-aware readers.
- Backfill script writes durable object refs.
- Keep legacy fallback until migration is audited.

### Risk: Community Feed Privacy Regression

Mitigation:

- Do not make bucket public.
- Read signing function must explicitly mirror app visibility rules.
- Videos remain gated by `diveVideos.ownerId/athleteId`, not by object key
  obscurity.

---

## 15. Implementation TODO

### Planning / Setup

- [x] Confirm Wasabi bucket name, region, endpoint, and environment split.
- [x] Confirm Firebase Functions deployment status and Blaze availability.
- [x] Create Wasabi sub-user/access key for Overdive media.
- [x] Store Wasabi credentials as Functions secrets / local env only.
- [x] Create private Wasabi bucket.
- [x] Verify anonymous bucket access returns Access Denied.
- [ ] Write local Wasabi smoke-test script for put/get/delete.

### Schema and Shared Types

- [x] Add `MediaStorageProvider` and `MediaObjectRef` types.
- [x] Add `photoObject` and `biometricCsvObject` to `RoutineLog`.
- [x] Add `storageProvider`, `cleanObject`, `thumbnailObject`, `burnedObject`
      to `DiveVideo`.
- [x] Add pure object key generation helpers.
- [x] Add media policy validation helpers.
- [ ] Add unit tests for key generation and validation.

### Backend Functions

- [x] Add AWS SDK S3 dependencies to `functions/package.json`.
- [x] Add Wasabi S3 client factory.
- [x] Add auth helper to verify Firebase user in HTTP/callable functions.
- [x] Add `createMediaUpload`.
- [x] Add `createDiveVideoMultipartUpload`.
- [x] Add `signDiveVideoPart`.
- [x] Add `completeDiveVideoMultipartUpload`.
- [x] Add `abortDiveVideoMultipartUpload`.
- [x] Add `getMediaReadUrl`.
- [x] Add `deleteMediaObject`.
- [ ] Add function integration smoke tests or scripts.

### Photos / CSVs

- [x] Refactor `src/lib/storage.ts` behind provider-aware helpers.
- [x] Move new session photo uploads to Wasabi.
- [x] Store `photoObject` on routine logs.
- [x] Keep `photoUrl` fallback for existing Firebase Storage media.
- [x] Update photo delete path for Wasabi.
- [x] Move biometric CSV upload/delete if included in this migration.
      Not included: CSVs intentionally remain on Firebase Storage for now.
- [x] Update dashboard/session/share-card readers for signed photo URLs.

### Dive Videos

- [x] Refactor `src/lib/services/diveVideos.ts` to remove direct Firebase
      Storage dependency from the new Wasabi path.
- [x] Add provider-aware `getDiveVideoDownloadUrl`.
- [x] Add multipart upload state to `PendingUpload`.
- [x] Implement multipart upload drain in `uploadProcessor`.
- [x] Persist uploaded part ETags after each part.
- [x] Complete multipart upload and mark Firestore uploaded.
- [ ] Abort multipart upload on user delete/reset where appropriate.
- [x] Update diagnostics copy and details for Wasabi.
- [x] Upload thumbnails to Wasabi.
- [x] Verify video player works with signed URLs.
      Code path implemented; live Wasabi verification still belongs in QA.

### Retention / Deletion

- [x] Update client-side `reapOwnedDiveVideos` to call provider-aware delete.
- [x] Update Cloud Function retention reaper for Firebase + Wasabi deletes.
- [ ] Deploy reaper in dry-run mode.
- [ ] Validate audit docs.
- [ ] Disable dry-run after manual approval.

### Migration

- [ ] Write dry-run media inventory script.
- [ ] Write Firebase Storage -> Wasabi backfill script.
- [ ] Validate copied object size/content type.
- [ ] Update Firestore with Wasabi object refs after validation.
- [ ] Produce migration audit report.
- [ ] Keep Firebase originals until explicit deletion approval.

### QA / Rollout

- [ ] Test photos on desktop and mobile.
- [ ] Test video recording/upload on iPhone Safari.
- [ ] Test video recording/upload on installed iPhone PWA.
- [ ] Test video recording/upload on Android Chrome.
- [ ] Test offline/online retry.
- [ ] Test expired signed URL refresh.
- [ ] Test old Firebase Storage media fallback.
- [ ] Turn on Wasabi writes for photos.
- [ ] Turn on Wasabi writes for videos.
- [ ] Monitor upload diagnostics and retention audit logs.

---

## 16. Open Questions

1. What Wasabi region and endpoint should production use?

2. Do you want one bucket with `dev/` and `prod/` prefixes, or separate dev and
   prod buckets?

3. Are Firebase Functions already deployed and available on the production
   project, or do we need to include first deployment setup in this project?

4. Should biometric CSVs move to Wasabi as part of this project, or should this
   migration be limited to user-visible photos and dive videos?

5. Should we keep the current 5 MB photo limit and 500 MB video limit?

6. Do you want videos to remain capped at 20 non-pinned videos per user after
   moving to Wasabi, or should the 1 TB plan allow a higher default?

7. How long should signed video playback URLs live? Recommendation: 60 minutes.

8. Should we build the full multipart uploader immediately, or start with a
   simpler signed single-object upload for videos and accept whole-file retry
   during the first Wasabi test period?

9. Should old Firebase Storage media be backfilled immediately after new writes
   are stable, or left in place until storage cost/usage makes migration urgent?

10. Is there any media that should become publicly cacheable/CDN-backed later,
    such as public feed photos, or should all user media remain private signed
    URL only?
