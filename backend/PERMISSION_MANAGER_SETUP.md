# Permission Manager setup

The browser does not contain Apps Script credentials or a reusable sheet-write secret. Admin sessions re-verify the Admin password; Developer sessions use a one-time email code. The backend then issues a short-lived permission-manager session.

## Deployment

1. Deploy the updated backend. It no longer needs `REMOTE_PERMISSION_HMAC_SECRET` for Licenses permission reads or writes. Keep `GOOGLE_SCRIPT_URL` pointed at the deployed Apps Script web app (the existing default remains in use if it is not set).
2. Copy the updated `Renewal OTP Google Apps Script.txt` into the existing Apps Script project.
3. Deploy a new web app version using the same deployment identity and spreadsheet access as the current license script. The script calls `https://rtr-crm-online.onrender.com/api/permissions/remote-authorize` to exchange one-time grants, so authorize the added `UrlFetchApp` access when Google prompts.

The backend creates a random, 60-second grant for each manager read/write. The grant is never returned to the browser, can be exchanged once, and authorizes only the operation already validated by the backend. Apps Script additionally rejects expired/replayed operations and only updates Column F after finding exactly one matching username in `Licenses`. No shared HMAC secret or credential needs to be placed in frontend code, backend settings, or Script Properties for this sheet bridge.

Developer OTP delivery uses the existing `send_dev_login_otp` Apps Script action; the backend generates and verifies the code. The manager stores only its short-lived session token in `sessionStorage`, not the password.

## Account behavior

- Licensed Admin permissions are written directly to that Admin's `Licenses` row.
- Sub-user permissions are saved to the secure backend permission store. If that sub-user also has a matching username row in `Licenses`, the manager additionally writes the flags to Column F; without a matching row, the secure backend save still succeeds and the manager reports that no sheet row was updated.
- Backend permission records and sheet writes remain limited to the signed-in Admin's tenant. A Developer session can manage accounts available to Developer.
- Malformed existing JSON is reported and loads as all buttons off; saving a reviewed selection replaces the malformed value. Runtime permission loading fails closed for malformed values.
