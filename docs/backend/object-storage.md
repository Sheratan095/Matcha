# Object Storage

## What is it?

Object storage is a way of storing files (images, videos, documents, backups) as independent, self-contained units called **objects**. Unlike a traditional filesystem that organises files in folders and subfolders, object storage is flat: every object lives in a **bucket** and is identified by a unique **key** (essentially a filename).

Each object is made of three things:

| Part | Description |
|------|-------------|
| **Key** | The unique identifier, e.g. `avatars/user-123/photo.jpg` |
| **Data** | The raw file bytes |
| **Metadata** | Optional key-value pairs, e.g. `Content-Type: image/jpeg` |

---

## How does it work?

You interact with an object store through an HTTP API. The three core operations are:

### Upload (PUT)
You send the file bytes to the store with a chosen key. The store saves the object and makes it accessible at a URL.

```
PUT /profile-pictures/user-abc123/avatar.jpg
Content-Type: image/jpeg

<binary data>
```

### Download (GET)
You request an object by its key. The store returns the file bytes. If the bucket is public, this is just a regular URL you can embed in an `<img>` tag.

```
GET /profile-pictures/user-abc123/avatar.jpg
→ <binary data>
```

### Delete (DELETE)
You remove an object by its key. The storage is reclaimed immediately.

```
DELETE /profile-pictures/user-abc123/avatar.jpg
```

---

## Buckets

A **bucket** is a top-level namespace — think of it as a drive or a root folder. You create a bucket once and then store as many objects as you want inside it. Buckets can be configured as:

- **Private** — only accessible with credentials (for sensitive files)
- **Public** — objects are readable by anyone with the URL (good for profile pictures)

---

## S3, MinIO and Garage

**Amazon S3** (Simple Storage Service) is the original and most widely used object storage service. Its HTTP API became the industry standard, and many servers now implement the same API ("S3-compatible").

Because our code only talks the S3 protocol (through `@aws-sdk/client-s3`), **any S3-compatible server works**. Switching between them only means changing environment variables.

| | AWS S3 | MinIO | Garage (**used here**) |
|---|---|---|---|
| Hosted by | AWS | You | You (Docker container) |
| Cost | Pay per GB + requests | Free | Free (AGPL) |
| Docker image | none | **no longer published**: `minio/minio` and `quay.io/minio/minio` now refuse pulls | `dxflrs/garage` |
| Public read for `<img>` | Bucket policy or CDN | Bucket policy | **Website endpoint** (port 3902) |
| Setup | Web console | One container | One container + one init script |

We originally planned MinIO, but its images are no longer distributed freely, so we use **Garage**. It is a lightweight S3 server written in Rust and actively maintained. It is designed to run as a multi-node cluster, but a single node is fine for development.

### Garage in two minutes

Garage exposes several ports, and we use two of them:

| Port | Name | Used by | Access |
|---|---|---|---|
| `3900` | **S3 API** | Profile service (upload / delete) | Requires access key + secret |
| `3902` | **Web endpoint** | Browser (`<img src>`) | Anonymous, **read-only**, only for buckets with website access enabled |
| `3901` | RPC | Garage internal / CLI | Protected by `GARAGE_RPC_SECRET`, not exposed |

Unlike MinIO, Garage is configured with its **CLI**, not the S3 API. Creating the bucket, creating the access key and enabling public read happen once, in `backend/infra/garage/init.sh`, not in the application code.

On the web endpoint the **bucket is chosen by the hostname**. `http://profile-pictures.web.garage.localhost:3902/<key>` serves `<key>` from the `profile-pictures` bucket (`root_domain = ".web.garage.localhost"` in `garage.toml`). Browsers resolve any `*.localhost` name to `127.0.0.1`, so no DNS setup is needed.

---

## How it fits in this project

Pictures are handled by the **profile service**. The files live in Garage and PostgreSQL only stores their URLs (`user_pictures.url`).

```
Upload
Browser ──POST /profile/pictures──▶ Gateway ──▶ Profile service
                                                  │ 1. check limit (max 5)
                                                  │ 2. sanitize image (sharp)
                                                  ├─ 3. PUT object (S3 API :3900) ──▶ Garage
                                                  └─ 4. INSERT url ─────────────────▶ PostgreSQL

Display
Browser ──GET /profile/:userId──▶ Gateway ──▶ Profile service ──▶ PostgreSQL (urls)
Browser ──<img src="http://profile-pictures.web.garage.localhost:3902/...">──▶ Garage (web :3902)
```

The images go straight from Garage to the browser, so the backend never serves image bytes.

### Upload pipeline

1. **Multer** (the NestJS file-upload middleware) receives the `multipart/form-data` request and keeps the file in memory. It rejects files larger than **5 MB** (`413`) and file types other than JPEG, PNG or WEBP (`400`).
2. The service rejects the upload if the user already has **5 pictures** (`MAX_USER_PICTURES` in shared-types).
3. **sharp** decodes and re-encodes the image (see [Stripping EXIF data](#stripping-exif-data)). If the bytes are not a real image, decoding fails and the request is rejected (`400`).
4. The clean image is uploaded to Garage with the key `<userId>/<random uuid>.webp`.
5. The public URL is saved in `user_pictures`. A user's **first picture becomes the profile picture** automatically.
6. If step 5 fails, the file is deleted from Garage so no orphan file is left behind.

Deleting a picture works the other way round: first the DB row is deleted (the `WHERE id = $1 AND user_id = $2` filter is also the ownership check), then the file is removed from Garage.

### Relevant code

| File | Role |
|---|---|
| `backend/apps/profile/src/storage/storage.service.ts` | S3 client: checks the bucket on startup; `upload`, `delete` |
| `backend/apps/profile/src/pictures/image.processor.ts` | `sanitizeImage()`: the sharp pipeline |
| `backend/apps/profile/src/app.service.ts` | `uploadPicture`, `deletePicture`, `setProfilePicture` |
| `backend/apps/profile/src/db/db.service.ts` | SQL for `user_pictures` |
| `backend/packages/config/src/env.ts` | `S3_*` environment variables |
| `backend/infra/garage/garage.toml` | Garage server configuration |
| `backend/infra/garage/init.sh` | One-time setup: layout, bucket, key, public read |

---

## Stripping EXIF data

### What is EXIF?

Phones and cameras embed **EXIF metadata** in every photo they take. It commonly includes:

- **GPS coordinates** of where the photo was taken, often precise to a few meters
- Date and time of capture
- Phone make, model, and sometimes a device serial number
- Software and editing history

### Why it matters here

Matcha is a dating app. If a user uploads a selfie taken at home and we serve the original file, **anyone who views the profile can download the image and read the user's home address from the GPS tags**. Tools like `exiftool` or any online "EXIF viewer" do this in seconds. The metadata is invisible in the picture itself, so users don't know it's there.

### How we remove it

`sanitizeImage()` doesn't strip tags one by one. It **decodes the image to raw pixels and encodes a brand-new file**:

```ts
sharp(input, { failOn: 'error' })
	.rotate()                          // apply EXIF orientation before it is lost
	.resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
	.webp({ quality: 85 })
	.toBuffer();
```

- sharp **never copies metadata** to the output unless `.withMetadata()` or `.keepMetadata()` is called. Only the pixels survive, so EXIF, XMP, IPTC and ICC profiles are all dropped.
- `.rotate()` with no argument reads the EXIF *orientation* tag and physically rotates the pixels **before** the tag is discarded. Without it, portrait photos from phones would appear sideways.
- Resizing to at most 1080 px on the longest side and converting to **WEBP** keeps storage and bandwidth low. Every stored picture has the same format.
- Decoding also **validates the file**. The `Content-Type` a client sends is just a claim; a renamed `.txt` or a malicious file disguised as an image fails to decode and is rejected.

---

## Installation and configuration

### 1. Environment variables

Add these to `backend/.env` (a template is in `backend/.env.example`). Generate your own secrets:

```bash
openssl rand -hex 32            # -> GARAGE_RPC_SECRET
echo "GK$(openssl rand -hex 12)" # -> S3_ACCESS_KEY (Garage requires the "GK" + 24 hex format)
openssl rand -hex 32            # -> S3_SECRET_KEY
```

```env
GARAGE_RPC_SECRET=<64 hex chars>
S3_ENDPOINT=http://localhost:3900
S3_REGION=garage
S3_ACCESS_KEY=GK<24 hex chars>
S3_SECRET_KEY=<64 hex chars>
S3_BUCKET=profile-pictures
S3_PUBLIC_URL=http://profile-pictures.web.garage.localhost:3902
```

| Variable | Default | Used by | Description |
|---|---|---|---|
| `GARAGE_RPC_SECRET` | none | Garage container | Secret shared by Garage nodes and the CLI. Passed by docker compose, never stored in `garage.toml`. |
| `S3_ENDPOINT` | `http://localhost:3900` | Profile service | S3 API URL the **backend** talks to. Docker compose overrides it to `http://garage:3900`. |
| `S3_REGION` | `garage` | Profile service | Must equal `s3_region` in `garage.toml`, or Garage rejects every request signature |
| `S3_ACCESS_KEY` | empty | Profile service + `init.sh` | Access key ID. `init.sh` imports this exact value into Garage. |
| `S3_SECRET_KEY` | empty | Profile service + `init.sh` | Secret access key |
| `S3_BUCKET` | `profile-pictures` | Profile service + `init.sh` | Bucket where pictures are stored |
| `S3_PUBLIC_URL` | `http://profile-pictures.web.garage.localhost:3902` | Profile service | Base URL the **browser** uses to load images. It already points at the bucket root, and it is saved in the DB URLs. |

> **Why two addresses?** `S3_ENDPOINT` is the authenticated API the backend writes to. `S3_PUBLIC_URL` is the anonymous read-only endpoint the browser loads images from. They are different ports with different permissions.

> **Changing `S3_PUBLIC_URL` later** does not update URLs already saved in the database. Pick it before storing real data.

### 2. Start Garage

**With make (recommended):** `make dev` already starts Garage and runs the init script (step 3) before launching the services. To start only the storage:

```bash
cd backend
make storage    # docker compose up -d garage + ./infra/garage/init.sh
```

> `make db-reset` runs `docker compose down -v`, which **also wipes the Garage volumes** (all uploaded pictures). That's intended, because the picture URLs lived in the database being reset. It recreates and re-initializes Garage automatically.

**Manually:**

```bash
cd backend
docker compose up -d garage
```

The container mounts `infra/garage/garage.toml` and keeps its state in two volumes, `garage_meta` (metadata) and `garage_data` (the actual files), so data survives restarts.

### 3. Initialize Garage (first time only)

A fresh Garage node can't store anything until it is configured. Run:

```bash
cd backend
./infra/garage/init.sh
```

The script reads `S3_BUCKET`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` from `.env` and runs these `garage` CLI commands inside the container:

| Step | Command | Why |
|---|---|---|
| 1 | `garage layout assign -z dc1 -c 1G <node>` + `garage layout apply` | Gives the node a storage role (1 GB). Without a layout every write fails. |
| 2 | `garage bucket create profile-pictures` | Creates the bucket |
| 3 | `garage key import <S3_ACCESS_KEY> <S3_SECRET_KEY>` | Registers the credentials the profile service already has in `.env` |
| 4 | `garage bucket allow --read --write --owner ... --key ...` | Lets that key use the bucket |
| 5 | `garage bucket website --allow profile-pictures` | Enables **anonymous read-only** access through the web endpoint (port 3902) |

It is **idempotent**, so running it again skips steps that are already done. It also waits up to 30 seconds for Garage to accept commands, so it's safe to run right after `docker compose up`.

To inspect Garage by hand:

```bash
docker compose exec garage /garage status
docker compose exec garage /garage bucket info profile-pictures
docker compose exec garage /garage key list
```

### 4. Start the profile service

On startup, `StorageService` checks that the bucket is reachable with the configured key. Expected log line:

```
[StorageService] Bucket "profile-pictures" reachable at http://localhost:3900
```

If Garage is down or not initialized, the service still starts and logs `Storage not ready, picture uploads will fail`. Profile reads keep working; only picture uploads and deletes fail. Fix Garage, then restart the profile service.

### 5. Check it works

- **Upload with Postman:** `POST http://localhost:3000/profile/pictures` with a logged-in session (access-token cookie). Body → **form-data**, key `file`, type **File**, and pick an image.
- **Open the returned `url`** in the browser. The image should load.
- **Check the public endpoint is read-only:** `curl -X PUT --data x http://profile-pictures.web.garage.localhost:3902/test` must fail, and `curl http://profile-pictures.web.garage.localhost:3902/` must return `404` (no bucket listing).
- **Confirm the metadata is gone:** download the image and run `exiftool <file>`. It should show no GPS, Make or Model tags.

### Switching to another S3 provider

Only the environment variables change. For AWS S3, for example:

```env
S3_ENDPOINT=https://s3.eu-south-1.amazonaws.com
S3_REGION=eu-south-1
S3_ACCESS_KEY=<IAM access key>
S3_SECRET_KEY=<IAM secret key>
S3_BUCKET=<globally unique bucket name>
S3_PUBLIC_URL=https://<bucket>.s3.eu-south-1.amazonaws.com   # or a CloudFront URL
```

The bucket and its public-read setting are then created in the AWS console instead of with `init.sh`. AWS blocks public access by default, so either allow public `s3:GetObject` with a bucket policy or put a CDN such as CloudFront in front.

---

## API reference

All endpoints act on the **authenticated user** (identified by the access token) and are reached through the gateway under `/profile`. Each one returns the user's full picture list after the change:

```json
{
  "pictures": [
    { "id": "5b0c…", "url": "http://profile-pictures.web.garage.localhost:3902/<userId>/<uuid>.webp", "isProfile": true },
    { "id": "9e1a…", "url": "http://profile-pictures.web.garage.localhost:3902/<userId>/<uuid>.webp", "isProfile": false }
  ]
}
```

| Method | Route | Body | Errors |
|---|---|---|---|
| `POST` | `/profile/pictures` | form-data, field `file` | `400` missing file, wrong type, invalid image, or 5 pictures already · `413` over 5 MB |
| `DELETE` | `/profile/pictures/:pictureId` | none | `400` id isn't a UUID · `404` not found or not yours |
| `PATCH` | `/profile/pictures/:pictureId/profile` | none | `400` id isn't a UUID · `404` not found or not yours |

Rules:

- Up to **5** pictures per user.
- The **first** uploaded picture automatically becomes the profile picture.
- **At most one** profile picture per user. This is enforced by the database with the partial unique index `one_profile_picture_per_user`. Setting a new one clears the old one in the same transaction.
- Deleting the profile picture doesn't promote another one automatically. The user has no profile picture until they set a new one.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Garage container exits immediately | `GARAGE_RPC_SECRET` is missing from `.env` or isn't 64 hex characters |
| `Storage not ready ... ECONNREFUSED` in the profile logs | Garage isn't running: run `make storage`, then restart the profile service. A `docker compose down -v` (for example from an older `db-reset`) removes the container. Also check `S3_ENDPOINT` (`localhost:3900` outside docker, `garage:3900` inside). |
| `Storage not ready ... NoSuchBucket` / `AccessDenied` / `InvalidAccessKeyId` | Garage isn't initialized, or `.env` changed after initialization. Run `./infra/garage/init.sh`. |
| `AuthorizationHeaderMalformed` / signature errors | `S3_REGION` doesn't match `s3_region` in `garage.toml` (`garage`) |
| `init.sh` fails at `key import` | `S3_ACCESS_KEY` doesn't have the `GK` + 24 hex format, or `S3_SECRET_KEY` isn't 64 hex characters |
| Image URL returns `404` | Website access isn't enabled on the bucket (re-run `init.sh`), or the file was deleted |
| Image URL doesn't resolve | The client doesn't resolve `*.localhost` names. Chrome, Firefox and curl do; Node's `fetch` and some other tools don't. Add `127.0.0.1 profile-pictures.web.garage.localhost` to `/etc/hosts`. |
| `docker pull minio/minio` → `pull access denied` | MinIO no longer publishes free images, which is why this project uses Garage |
| `400 Only JPEG, PNG and WEBP images are allowed` for a real photo | HEIC/HEIF photos (the iPhone default) aren't accepted. Export them as JPEG first; browsers usually convert them automatically when you pick a file. |
| `400 File is not a valid image` | The file's bytes don't match its declared type (renamed or corrupted file) |
