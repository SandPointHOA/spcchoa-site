// Google Apps Script web app. Deploy as: Execute as = Me, Who has access = Anyone.
// Set Script Properties: SHEET_ID (the tracking spreadsheet id) and WEBHOOK_SECRET
// (must match Netlify's SHEET_WEBHOOK_SECRET). Create a tab named "Incidents".
function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad json" });
  }
  if (body.secret !== props.getProperty("WEBHOOK_SECRET")) {
    return json_({ ok: false, error: "forbidden" });
  }
  if (!Array.isArray(body.row)) {
    return json_({ ok: false, error: "row missing" });
  }
  try {
    var sheet = SpreadsheetApp
      .openById(props.getProperty("SHEET_ID"))
      .getSheetByName("Incidents");
    if (!sheet) {
      return json_({ ok: false, error: "Incidents tab not found (check SHEET_ID / tab name)" });
    }
    sheet.appendRow(body.row);
  } catch (err) {
    return json_({ ok: false, error: "append failed: " + err });
  }
  return json_({ ok: true });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
