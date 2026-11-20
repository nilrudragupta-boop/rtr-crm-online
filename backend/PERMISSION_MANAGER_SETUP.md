# Permission Manager setup

The browser does not contain Apps Script credentials or the permission signing key. Admin sessions re-verify the Admin password; Developer sessions use a one-time email code. The backend then issues a short-lived permission-manager session.

## Configure the remote permission key

The backend signs each Licenses-sheet read/write request with HMAC-SHA256. Apps Script verifies the signature using a matching Script Property. The key is never included in frontend files, browser requests, or source code.

1. Generate a long random value (at least 32 characters) locally. Do not send it in chat or add it to source files.
2. Add it to the backend host's environment variables as `REMOTE_PERMISSION_HMAC_SECRET`, then redeploy the backend.
3. In Apps Script, open **Project Settings → Script Properties**, create a property named `REMOTE_PERMISSION_HMAC_SECRET`, and paste the same value. Save.
4. Replace the Apps Script project content with the updated `Renewal OTP Google Apps Script.txt` and deploy a new web app version with the same execution identity and spreadsheet access.

This signed-request design does not make an Apps Script callback to the backend, so the permission bridge does not require `UrlFetchApp` or the `script.external_request` scope. The existing `forceAuth` helper only opens the spreadsheet; it does not make an external request.

Keep `GOOGLE_SCRIPT_URL` pointed at the deployed Apps Script web app (the existing default remains if it is unset). The updated script supports a signed account-list request for `Licenses` and `RemoteUsers`, so accounts can be managed while offline. It reads the Role column by header when available and falls back to the established layout. Permission JSON is still stored in Column F of the matching `Licenses` row. Dashboard assignments can also be saved to `Dash_Permissions` by User ID; a `User ID` header is added in an unused column when needed. The script rejects unsigned, expired, or replayed requests.

## Account behavior

- The selector is populated from the sheet account list, including Admin and User rows whether or not the account is currently logged in. Developer can manage all listed accounts; an Admin remains limited to accounts sharing that Admin's tenant contacts.
- Admin and User permission flags are written to the matching account's `Licenses` row in Column F, so the existing license check returns them at next sign-in. User permissions also retain the backend permission record and audit trail.
- Dashboard file assignments are written to `Dash_Permissions` and keyed by User ID so one user can be assigned a dashboard without changing another user's assignment.
- Malformed existing JSON is reported and loads as all buttons off; saving a reviewed selection replaces the malformed value. Runtime permission loading fails closed for malformed values.
