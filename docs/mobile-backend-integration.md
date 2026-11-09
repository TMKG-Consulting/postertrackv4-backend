# Mobile app backend integration: field auditor reports

This document describes the current backend contract for field auditors using the mobile app to submit compliance and competitive reports. It is based on the Express routes, controller behavior, auth middleware, and Prisma schema in this repository.

## Connection and authentication

- Set `BASE_URL` to the deployed API origin, for example `https://api.example.com`. Routes below are relative to that origin; there is no `/api` prefix applied globally.
- Send JSON requests with `Content-Type: application/json`. Use `multipart/form-data` for report submissions.
- Authenticate with `POST /login` using `{ "email": "...", "password": "..." }`. A successful response is `{ "token": "..." }`.
- Send the returned token on every protected request in the **`auth-token`** header. The backend does not read `Authorization: Bearer ...`.
- Tokens contain the user's `id` and `role` and expire after 12 hours. On `401` or `403`, prompt for sign-in again.
- Mobile report operations should use a `FIELD_AUDITOR` account. The upload routes require a valid token but do not consistently enforce the role themselves.

## Recommended workflow

1. Sign in and retain the token securely.
2. Fetch assigned sites from `GET /get-assigned-sites`. Use `siteAssignmentId` as the compliance upload path parameter and `mainCampaignId` as the numeric campaign ID in the upload body. `campaignID` is the human-readable campaign code and is **not** the value expected in `campaignId`.
3. Fetch compliance reference entities from `GET /entities`.
4. For competitive reports, fetch the location, category, advertiser, brand, and board-type choices using the catalog endpoints below.
5. Submit supported images as multipart form data. EXIF GPS and capture-time metadata are optional; when GPS is absent, it is stored as `0, 0`, and when capture time is absent, it is stored and watermarked as `Not Found`. The server normalizes images it can decode to watermarked JPEGs.
6. Treat `201` as saved. Retain the returned IDs/URLs. Compliance duplicate submissions return `409`; competitive submissions currently have no duplicate protection or idempotency key.

## Required endpoints

### 1. Sign in

`POST /login`

JSON body:

```json
{
  "email": "auditor@example.com",
  "password": "..."
}
```

Success (`200`):

```json
{ "token": "<jwt>" }
```

The API lowercases the email before lookup. Typical errors: `400` missing credentials, `401` invalid password, `404` user not found.

### 2. Load assigned compliance sites

`GET /get-assigned-sites`

Header: `auth-token: <jwt>`

Success (`200`):

```json
{
  "message": "Assigned sites successfully retrieved.",
  "assignedSites": [
    {
      "siteAssignmentId": 456,
      "siteCode": "SITE-001",
      "address": "...",
      "state": "...",
      "brand": "...",
      "city": "...",
      "boardType": "...",
      "mediaOwner": "...",
      "mainCampaignId": 12,
      "campaignID": "ABC-JAN-26",
      "uploadedAt": "...",
      "advertiser": "...",
      "status": "pending",
      "disapprovalReason": null
    }
  ]
}
```

Assignments are filtered to the authenticated user's ID. A disapproved site returns `status: "disapproved"` and its `disapprovalReason`; the frontend should show the reason and allow the auditor to resubmit that site. An empty result currently returns `404` with `{ "message": "No site assignments found." }`, not an empty `assignedSites` array. `mainCampaignId` is the integer `Campaign.id`; `campaignID` is a display code.

Campaign site allocation matches both the uploaded site's city and state against the cities configured for active field auditors. Field auditor create/update requests must provide `citiesCovered` as city IDs (from `GET /states/:stateId/cities` or `GET /cities`). If multiple active auditors cover the same city, assignments are spread across those auditors. A site with no city/state match remains unassigned.

### 3. Load compliance form choices

`GET /entities`

Header: `auth-token: <jwt>`

Success (`200`): `{ "message": "Entities fetched successfully.", "data": { "structures": [], "posters": [], "illuminations": [], "routes": [], "sides": [] } }`.

Each item has an `id` and `name`. Send the selected IDs as `structureId`, `posterId`, `illuminationId`, `routeId`, and `sideId` when uploading a compliance report.

### 4. Upload a compliance report

`POST /compliance-report/:siteAssignmentId`

Headers:

- `auth-token: <jwt>`
- `Content-Type: multipart/form-data` (let the mobile HTTP client set the boundary)

Text form fields (all required unless marked optional):

| Field | Value |
| --- | --- |
| `siteCode` | Exact `siteCode` from the assigned site |
| `campaignId` | Numeric `mainCampaignId` from the assignment, not `campaignID` |
| `advertiser` | Advertiser name |
| `brand` | Brand name |
| `city` | City name |
| `state` | State name |
| `address` | Site location/address |
| `boardType` | Board format as a string |
| `mediaOwner` | Media owner name |
| `message` | Report message/description |
| `comment` | Auditor comment (required by current controller) |
| `structureId` | Selected entity ID |
| `posterId` | Selected entity ID |
| `illuminationId` | Selected entity ID |
| `routeId` | Selected entity ID |
| `sideId` | Selected entity ID |
| `bsv` | Optional; defaults to `"0%"` |
| `status` | Optional; defaults to `"pending"`. Mobile clients should omit this and let review workflows set status. |

Attach **1 to 5** supported image parts, each with the exact field name **`imageUrls`**. EXIF GPS and `DateTimeOriginal` capture time are optional. If either GPS coordinate is missing, the backend stores both latitude and longitude as `0`; if capture time is missing, it stores and watermarks the value as `Not Found`. The backend applies a watermark, converts images it can decode to JPEG, uploads them to Google Cloud Storage, and stores the resulting public URLs. Do not send a manually supplied `imageUrls` string instead of file parts.

The assignment must belong to the authenticated auditor, and the submitted `siteCode` must exactly match that assignment. A new upload for an existing `(siteCode, campaignId)` returns `409` unless its report is disapproved and belongs to this assignment. In that case, the existing report is updated with the new submission, while its status remains `disapproved` until a reviewer changes it.

Success (`201`) normally returns:

```json
{
  "message": "Compliance report successfully created.",
  "newComplianceReport": { "id": 789, "siteCode": "SITE-001", "imageUrls": ["https://..."] }
}
```

For aberration reports the response property is currently `complianceReport` instead of `newComplianceReport`; clients should accept either property. Reuploads return `reuploaded: true`; new uploads return `reuploaded: false`. After a reupload, refresh assigned sites and use the response's `reuploaded` flag to show confirmation; the stored status remains `disapproved` as requested. Other likely errors: `400` missing fields/image, `404` invalid/unowned assignment, `409` duplicate or non-disapproved prior report, `500` image processing/storage/database failure.

### 5. Upload a competitive report

`POST /competitive-report`

Headers:

- `auth-token: <jwt>`
- `Content-Type: multipart/form-data` (let the mobile HTTP client set the boundary)

Text form fields expected by the controller:

| Field | Value |
| --- | --- |
| `brand` | Brand name |
| `advertiser` | Advertiser name; used when the brand is new, and derived from an existing brand otherwise |
| `boardType` | Numeric board type ID from `GET /api/board` |
| `category` | Numeric category ID; may be a scalar or repeated field. Only the first selected category is associated to a newly created brand/report. |
| `region` | Numeric region ID |
| `state` | Numeric state ID |
| `city` | Numeric city ID |

Attach **1 to 5** supported image parts using the exact field name **`images`**. EXIF GPS and `DateTimeOriginal` capture time are optional. Missing GPS coordinates are stored as `0, 0`; missing capture time is stored and watermarked as `Not Found`. The server watermarks and converts images it can decode to JPEG, then returns a `201` JSON report row with image URLs and captured metadata.

The controller does not perform clear required-field validation up front. Send every field above and valid database IDs; missing/invalid values may surface as a generic `500`. If the brand already exists, the server replaces the submitted advertiser and category with the brand's stored advertiser/category. If the brand does not exist, it may create the advertiser, category associations, and brand as part of this upload. There is currently no deduplication/idempotency protection for competitive uploads.

## Catalog endpoints for competitive form choices

All require `auth-token` and return existing records; IDs from them are the IDs to send in competitive upload fields.

| Endpoint | Use | Response shape |
| --- | --- | --- |
| `GET /regions` | Load regions | Array of `{ id, name, ... }` |
| `GET /regions/:regionId/states` | States in a region | Array of state records |
| `GET /states/:stateId/cities` | Cities in a state | Array of city records |
| `GET /states` | All states, if needed | Array of state records |
| `GET /cities` | All cities, if needed | Array of city records |
| `GET /categories?page=1&limit=50` | Categories | `{ data, total, totalPages, currentPage }` |
| `GET /advertisers?page=1&limit=50&search=` | Advertisers | `{ data, total, totalPages, currentPage }` |
| `GET /brands?page=1&limit=50&search=` | Brands | `{ data, total, totalPages, currentPage }` |
| `GET /api/board` | Board types | Array of board type records |

`GET /api/advertiser/:advertiserId/brands` is also available when the UI needs brands for one advertiser; it returns `{ data, total, totalPages, currentPage }` and currently returns `404` when none exist.

## Optional report retrieval

These endpoints exist but are not needed to submit reports:

- `GET /check-upload/:siteAssignmentId` checks for a compliance upload. It returns `404` if none exists. The current handler does not verify that the assignment belongs to the token user, so do not treat it as an authorization boundary.
- `GET /competitive-upload/:auditorId?page=1&limit=10` returns competitive history for the requested auditor ID. The current handler does not ensure that the requested ID matches the authenticated auditor; use only if the app has a trusted reason to request that ID.
- `GET /competitive-report/:id` retrieves one competitive report.
- `GET /compliance-report/:id` retrieves one compliance report.

## Backend behavior and mobile implementation notes

- `auth-token` is a custom header. A generic Bearer token interceptor will not authenticate unless it also sets this header.
- Treat multipart numeric form values as strings; the backend parses them into integers.
- Preserve the original photo EXIF metadata. Resizing, recompressing, or stripping metadata before upload may make the server reject the photo.
- Upload responses include public Google Cloud Storage URLs. Cache only what the app needs and avoid re-uploading successful submissions.
- No offline sync protocol or idempotency key is implemented. For compliance, a retry after an uncertain network result can receive `409`; reconcile through a report lookup before retrying. Competitive retries can create duplicate reports.
- `GET /site-pending-approval` is currently broken for auditors: it reads `userId` from the JWT, while login tokens contain `id`, and it filters on `fieldAuditorId`, a field that does not exist on the `ComplianceReport` Prisma model (the relation is stored as `uploadedBy`).
- Compliance and competitive upload routes currently require authentication but do not add an explicit `FIELD_AUDITOR` role guard. Compliance additionally checks assignment ownership; competitive upload currently does not.

## Source routes

The primary route declarations are in `routes/userRoutes.js`, `routes/campaignRoutes.js`, `routes/complianceRoutes.js`, `routes/competitiveRoutes.js`, `routes/locationRoutes.js`, `routes/categoryRoutes.js`, `routes/advertiserRoutes.js`, `routes/brandRoutes.js`, and `routes/boardTypeRoutes.js`.
