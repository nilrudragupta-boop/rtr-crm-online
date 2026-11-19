# Centralized User Permission Manager

## Existing project architecture

- Users and roles are stored in the `AdminCreds.adminUsers` array in MongoDB. The permission manager uses the existing `userId`, `id`, or username as the target identifier; it does not create user accounts.
- Permission state and immutable audit history use the existing `UserPermission` and `PermissionAudit` Mongoose models.
- The Express server serves `frontend/` as static files. The backend starts from `backend/server.js` and connects with the existing `MONGO_URI` environment variable.
- The manager UI is `frontend/user_permission_manager.html`. Its administration APIs are mounted under `/api/permissions`.
- The current sign-in/client identity is stored in browser local storage and is sent as a username header/query parameter. It is not a server-verifiable login session.

## Permission API

All endpoints are served by the existing Express app. Admin operations accept the current tenant selector `user` and actor `x-rtr-user`/`actor` values used by the existing app.

| Method and path | Purpose |
|---|---|
| `GET /api/permissions/sub-users?user=<tenant>` | List active non-privileged accounts from `AdminCreds.adminUsers`. |
| `GET /api/permissions/modules?user=<tenant>` | Return the canonical module registry and tenant custom pages. |
| `GET /api/permissions/user/:userId?user=<tenant>` | Load one account's saved permissions. |
| `POST /api/permissions/user/:userId?user=<tenant>` | Replace that account's permission map and append per-module audit records. Body: `{ permissions, actionPerformed, moduleLabels }`. |
| `GET /api/permissions/audit?user=<tenant>&subUserId=<id>` | Read up to 200 newest audit entries. Admin only. |
| `GET /api/permissions/my-permissions?user=<tenant>&actor=<username>` | Return the requesting account's effective permission map for the page guard. |
| `GET /api/permission-manager/session` | Check whether the current browser has a valid manager session. |
| `POST /api/permission-manager/request-otp` | Send a five-minute OTP to the configured Developer email. Limited to three requests per IP per minute. |
| `POST /api/permission-manager/verify-otp` | Verify `{ challengeId, otp }` and issue a ten-minute HttpOnly `SameSite=Strict` cookie. Five failed attempts invalidate a challenge. |
| `POST /api/permission-manager/logout` | Revoke the current manager session and clear its cookie. |

Permission keys are `view`, `add`, `edit`, `delete`, `print`, `pdfDownload`, `excelDownload`, `import`, and `export`. Missing flags are treated as disabled by the permission editor and the mapped API guard.

The backend module guard covers mapped data APIs, including invoices, customers, suppliers, purchases, stock, expenses, follow-ups, CRM, production, banking, journal vouchers, and credit/debit notes. For POST upserts it checks whether the record already exists before choosing `edit` or `add`. Restore and reorder operations require `edit`.

## Render deployment

1. Keep the existing Render service and MongoDB connection configuration.
2. Confirm the service root points to `backend/` (or use the repository root with the backend start command adjusted to `node backend/server.js`).
3. Use Node.js 20 or newer. The backend package already declares this engine requirement.
4. Install with `npm install` in the backend directory and start with `npm start`.
5. Keep `MONGO_URI` configured as a Render secret. Do not place it in frontend files.
6. Deploy the updated project and sign in as Developer to `settings.html`. Use the User Permission Manager button; the backend emails a six-digit OTP to `DEVELOPER_OTP_EMAIL` or the configured `AdminCreds.adminEmail`. The OTP expires in five minutes, and a successful verification issues a 10-minute HttpOnly session cookie. The manager HTML and its administration APIs return not found without that cookie.
7. Check that the Render instance can reach the configured MongoDB database before using Save Permissions.

Set `EMAIL_USER` and `EMAIL_APP_PASSWORD` for OTP delivery, and configure `DEVELOPER_OTP_EMAIL` or the existing `AdminCreds.adminEmail`. No database migration is required for the permission collections; the existing Mongoose models create/use the collections and indexes when loaded. The short-lived OTP challenge and access session are held in server memory and are invalidated when the server restarts.

## Verification record

- Passed: `node --check` on `backend/server.js`, `backend/middleware/permissionMiddleware.js`, `backend/routes/permissionRoutes.js`, `backend/models/permissions.js`, and `frontend/settings.js`.
- Not run: live MongoDB persistence, browser UI interactions, Render deployment, permission-isolation scenarios, and direct-API authorization tests. The workspace has no confirmed running CRM/MongoDB environment, and no production test accounts or records were created.

## Security limitation requiring resolution before production use

The manager HTML is served only by an Express route that checks the server-side session; direct static requests return 404. Manager admin APIs also require the same session cookie. The manager entry now uses a server-generated OTP and a random HttpOnly cookie session. Other CRM APIs still use browser-supplied usernames, and `/api/auth/login` only records a login event. This does not replace authentication for the rest of the CRM. The OTP challenge/session store is process-local, so deployments with multiple backend instances need shared session storage before scaling horizontally.

Print, PDF, and Excel generation that runs entirely in the browser also cannot be enforced by the Express API. Existing UI controls honor the mapped print/Excel/delete flags, while invoice and purchase add/edit controls additionally honor their current legacy permission IDs. Modules that lack action-aware UI hooks need those controls wired individually before their front-end behavior matches every checkbox.
