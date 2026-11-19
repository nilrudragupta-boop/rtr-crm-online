# Permission Manager setup

The browser does not contain Apps Script credentials or the permission signing key. Admin sessions re-verify the Admin password; Developer sessions use a one-time email code. The backend then issues a short-lived permission-manager session.

## Configure the remote permission key

The backend signs each Licenses-sheet read/write request with HMAC-SHA256. Apps Script verifies the signature using a matching Script Property. The key is never included in frontend files, browser requests, or source code.

1. Generate a long random value (at least 32 characters) locally. Do not send it in chat or add it to source files.
2. Add it to the backend host's environment variables as `REMOTE_PERMISSION_HMAC_SECRET`, then redeploy the backend.
3. In Apps Script, open **Project Settings → Script Properties**, create a property named `REMOTE_PERMISSION_HMAC_SECRET`, and paste the same value. Save.
4. Replace the Apps Script project content with the updated `Renewal OTP Google Apps Script.txt` and deploy a new web app version with the same execution identity and spreadsheet access.

This signed-request design does not make an Apps Script callback to the backend, so the permission bridge does not require `UrlFetchApp` or the `script.external_request` scope. The existing `forceAuth` helper only opens the spreadsheet; it does not make an external request.

Keep `GOOGLE_SCRIPT_URL` pointed at the deployed Apps Script web app (the existing default remains if it is unset). The script rejects unsigned, expired, or replayed requests and updates Column F only after finding exactly one matching username in `Licenses`.

## Account behavior

- Licensed Admin permissions are written directly to that Admin's `Licenses` row.
- Sub-user permissions are saved to the secure backend permission store. If that sub-user also has a matching username row in `Licenses`, the manager additionally writes the flags to Column F; without a matching row, the secure backend save still succeeds and the manager reports that no sheet row was updated.
- Backend permission records and sheet writes remain limited to the signed-in Admin's tenant. A Developer session can manage accounts available to Developer.
- Malformed existing JSON is reported and loads as all buttons off; saving a reviewed selection replaces the malformed value. Runtime permission loading fails closed for malformed values.
