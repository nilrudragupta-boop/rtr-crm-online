# Permission Manager setup

The browser does not contain Apps Script credentials or a reusable sheet-write secret. Admin sessions re-verify the Admin password; Developer sessions use a one-time email code. The backend then issues a short-lived permission-manager session.

## Deployment

1. Deploy the updated backend. It no longer needs `REMOTE_PERMISSION_HMAC_SECRET` for Licenses permission reads or writes. Keep `GOOGLE_SCRIPT_URL` pointed at the deployed Apps Script web app (the existing default remains in use if it is not set).
2. Copy the updated `Renewal OTP Google Apps Script.txt` into the existing Apps Script project.
3. In the Apps Script editor, choose `authorizeRemotePermissionBridge` in the function selector and click **Run** while signed in as the account that owns the web app deployment. Review and approve Google's external request access prompt. This is a one-time Google authorization; it cannot be granted silently by backend code.
4. Deploy a new web app version. Set **Execute as** to the deployment owner (the account that approved the prompt) and retain the current access setting and spreadsheet access. The script calls `https://rtr-crm-online.onrender.com/api/permissions/remote-authorize` to exchange one-time grants.

If the Apps Script project has an `appsscript.json` manifest with an explicit `oauthScopes` list, add `https://www.googleapis.com/auth/script.external_request` to that list while preserving its existing scopes. Then repeat step 3 using the deployment owner and deploy a new web app version. The manager now reports these steps directly instead of a raw Google scope error.

The backend creates a random, 60-second grant for each manager read/write. The grant is never returned to the browser, can be exchanged once, and authorizes only the operation already validated by the backend. Apps Script additionally rejects expired/replayed operations and only updates Column F after finding exactly one matching username in `Licenses`. No shared HMAC secret or credential needs to be placed in frontend code, backend settings, or Script Properties for this sheet bridge.

Developer OTP delivery uses the existing `send_dev_login_otp` Apps Script action; the backend generates and verifies the code. The manager stores only its short-lived session token in `sessionStorage`, not the password.

## Account behavior

- Licensed Admin permissions are written directly to that Admin's `Licenses` row.
- Sub-user permissions are saved to the secure backend permission store. If that sub-user also has a matching username row in `Licenses`, the manager additionally writes the flags to Column F; without a matching row, the secure backend save still succeeds and the manager reports that no sheet row was updated.
- Backend permission records and sheet writes remain limited to the signed-in Admin's tenant. A Developer session can manage accounts available to Developer.
- Malformed existing JSON is reported and loads as all buttons off; saving a reviewed selection replaces the malformed value. Runtime permission loading fails closed for malformed values.
