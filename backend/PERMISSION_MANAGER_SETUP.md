# Permission Manager secure write setup

The browser does not contain the Apps Script URL signing secret. Admin sessions re-verify the Admin password; Developer sessions request and verify a fresh Developer email OTP on the backend. Both receive a short-lived permission-manager session and call protected backend routes. The backend signs License-sheet requests before forwarding them to Apps Script.

## Backend environment

Configure these server environment variables before deploying:

- `PERMISSION_MANAGER_SESSION_SECRET`: a random secret of at least 32 characters, used to sign 30-minute manager sessions.
- `REMOTE_PERMISSION_HMAC_SECRET`: a separate random secret of at least 32 characters, shared with the Apps Script property below.
- `GOOGLE_SCRIPT_URL`: the deployed Apps Script web app URL. The existing default is retained if this value is not configured.
- `EMAIL_USER`, `EMAIL_APP_PASSWORD`, and optionally `DEVELOPER_EMAIL`: the backend mail settings used to send a fresh Developer OTP when opening the manager from a Developer session.

Do not put either secret in frontend files, query strings, or browser storage. The manager stores only the short-lived session token in `sessionStorage`; it does not store the password.

## Apps Script

1. Add the updated `Renewal OTP Google Apps Script.txt` content to the Apps Script project.
2. In **Project Settings → Script Properties**, add `REMOTE_PERMISSION_HMAC_SECRET` with the same value as the backend environment variable of that name.
3. Deploy a new web app version using the same deployment identity and spreadsheet access as the current license script.
4. Set the backend `GOOGLE_SCRIPT_URL` to the deployment URL if it changed.

The script rejects unsigned, expired, or replayed permission requests. It updates Column F only after finding exactly one `Licenses` row with the target username. If existing JSON is malformed, the manager opens with all buttons off and identifies the bad value; saving the reviewed checkbox selection replaces it. Runtime permission loading also fails closed for malformed values.

## Account behavior

- The licensed Admin’s flags are written directly to that Admin’s `Licenses` row.
- Sub-user permissions continue to save to the existing backend permission store. If a matching username row also exists in `Licenses`, the manager additionally updates that row’s Column F. When there is no matching row, the backend save still succeeds and the manager reports that the sheet cell was not updated.
- Backend permission records and sheet writes are limited to the signed-in Admin’s tenant. A Developer session can manage the accounts available to Developer.
