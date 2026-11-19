# Permission Manager secure write setup

The browser does not contain the Apps Script URL signing secret. Admin sessions re-verify the Admin password; Developer sessions receive a fresh email OTP through the existing Apps Script mail action. The backend keeps and verifies that one-time code, then issues a short-lived permission-manager session. License-sheet permission reads and writes use a separate server-to-script signature.

## Backend environment

Configure these server environment variables before deploying:

- `REMOTE_PERMISSION_HMAC_SECRET`: a random secret of at least 32 characters, shared with the Apps Script property below. This is required for License-sheet permission reads and writes, not for Developer OTP delivery.
- `GOOGLE_SCRIPT_URL`: the deployed Apps Script web app URL. The existing default is retained if this value is not configured.

The backend signs 30-minute manager sessions using `PERMISSION_MANAGER_SESSION_SECRET` if set, otherwise its existing `NANCY_AUTH_SECRET`, or a server-side derivation from `MONGO_URI`. No new session secret is needed for Developer OTP delivery. Do not put server secrets in frontend files, query strings, or browser storage. The manager stores only the short-lived session token in `sessionStorage`; it does not store the password.

## Apps Script

1. Add the updated `Renewal OTP Google Apps Script.txt` content to the Apps Script project.
2. In **Project Settings → Script Properties**, add `REMOTE_PERMISSION_HMAC_SECRET` with the same value as the backend environment variable of that name.
3. Deploy a new web app version using the same deployment identity and spreadsheet access as the current license script.
4. Set the backend `GOOGLE_SCRIPT_URL` to the deployment URL if it changed.

The script rejects unsigned, expired, or replayed License-sheet permission requests. Developer OTPs use the existing `send_dev_login_otp` Apps Script method; the backend generates and verifies the code without exposing it to the browser. The script updates Column F only after finding exactly one `Licenses` row with the target username. If existing JSON is malformed, the manager opens with all buttons off and identifies the bad value; saving the reviewed checkbox selection replaces it. Runtime permission loading also fails closed for malformed values.

## Account behavior

- The licensed Admin’s flags are written directly to that Admin’s `Licenses` row.
- Sub-user permissions continue to save to the existing backend permission store. If a matching username row also exists in `Licenses`, the manager additionally updates that row’s Column F. When there is no matching row, the backend save still succeeds and the manager reports that the sheet cell was not updated.
- Backend permission records and sheet writes are limited to the signed-in Admin’s tenant. A Developer session can manage the accounts available to Developer.
