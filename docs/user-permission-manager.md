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

Permission keys are `view`, `add`, `edit`, `delete`, `print`, `pdfDownload`, `excelDownload`, `import`, and `export`. Missing flags are treated as disabled by the permission editor and the mapped API guard.

The backend module guard covers mapped data APIs, including invoices, customers, suppliers, purchases, stock, expenses, follow-ups, CRM, production, banking, journal vouchers, and credit/debit notes. For POST upserts it checks whether the record already exists before choosing `edit` or `add`. Restore and reorder operations require `edit`.

## Render deployment

1. Keep the existing Render service and MongoDB connection configuration.
2. Confirm the service root points to `backend/` (or use the repository root with the backend start command adjusted to `node backend/server.js`).
3. Use Node.js 20 or newer. The backend package already declares this engine requirement.
4. Install with `npm install` in the backend directory and start with `npm start`.
5. Keep `MONGO_URI` configured as a Render secret. Do not place it in frontend files.
6. Deploy the updated project and verify the hosted page at `/user_permission_manager.html` while signed in as a configured privileged account.
7. Check that the Render instance can reach the configured MongoDB database before using Save Permissions.

No database migration is required for the permission collections; the existing Mongoose models create/use the collections and indexes when loaded.

## Verification record

- Passed: `node --check` on `backend/server.js`, `backend/middleware/permissionMiddleware.js`, `backend/routes/permissionRoutes.js`, `backend/models/permissions.js`, and `frontend/settings.js`.
- Not run: live MongoDB persistence, browser UI interactions, Render deployment, permission-isolation scenarios, and direct-API authorization tests. The workspace has no confirmed running CRM/MongoDB environment, and no production test accounts or records were created.

## Security limitation requiring resolution before production use

The existing CRM does not provide a server-verifiable user session. Its browser sends a username in a query parameter/header, and `/api/auth/login` only records a login event; it does not validate credentials or issue a signed session. A caller can therefore impersonate a configured privileged username. The permission checks in this integration cannot meet the brief's mandatory authentication requirement until a trusted server-side authentication mechanism is added and used by protected requests. The request also prohibits changing the existing authentication flow, so this implementation preserves that flow and must not be represented as a secure production authorization boundary.

Print, PDF, and Excel generation that runs entirely in the browser also cannot be enforced by the Express API. Existing UI controls honor the mapped print/Excel/delete flags, while invoice and purchase add/edit controls additionally honor their current legacy permission IDs. Modules that lack action-aware UI hooks need those controls wired individually before their front-end behavior matches every checkbox.
