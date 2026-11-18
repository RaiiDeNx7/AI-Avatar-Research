/**
 * Avatar study watch log.
 *
 * 1. Create a Google Sheet.
 * 2. Extensions → Apps Script, paste this file, and save.
 * 3. Deploy → New deployment → Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 4. Copy the web app URL (it ends in /exec) into config.js as log.scriptUrl.
 *
 * The script appends watch events and issues each PID once.
 * action=next returns the next PID. action=claim marks that PID's survey opened.
 * A second claim for the same PID is rejected.
 */
var HEADERS = ["time", "pid", "study", "round", "avatarId", "avatarLabel", "videoFile", "event"];
var PID_HEADERS = ["pid", "issuedAt", "surveyAt"];
var PID_PATTERN = /^[0-9]{5,}$/;
var EVENTS = { selected: true, started: true, completed: true, survey_opened: true };
var STUDIES = { fixed: true, variety: true };

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.action || "");
  if (!action) return ContentService.createTextOutput("Avatar study log is running.");
  var result;
  try {
    if (action === "next") result = issuePid_();
    else if (action === "claim") result = claimSurvey_(params.pid);
    else result = { ok: false, reason: "unknown-action" };
  } catch (error) {
    result = { ok: false, reason: "error" };
  }
  return scriptResult_(result, params.callback);
}

function doPost(e) {
  var data = clean_(readData_(e));
  if (!data) return json_({ ok: false });
  append_(data);
  return json_({ ok: true });
}

function readData_(e) {
  if (!e) return {};
  if (e.parameter && e.parameter.pid) return e.parameter;
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      return e.parameter || {};
    }
  }
  return e.parameter || {};
}

function clean_(data) {
  if (!data) return null;
  var pid = String(data.pid || "").trim();
  var eventName = String(data.event || "").trim();
  var study = String(data.study || "").trim();
  var round = String(data.round || "").trim();
  if (!PID_PATTERN.test(pid)) return null;
  if (!EVENTS[eventName]) return null;
  if (!STUDIES[study]) return null;
  if (eventName === "survey_opened") round = "";
  else if (!/^[1-9]$/.test(round)) return null;
  return {
    time: safeCell_(String(data.time || new Date().toISOString()).slice(0, 40)),
    pid: pid,
    study: study,
    round: round,
    avatarId: safeCell_(String(data.avatarId || "").slice(0, 80)),
    avatarLabel: safeCell_(String(data.avatarLabel || "").slice(0, 120)),
    videoFile: safeCell_(String(data.videoFile || "").slice(0, 300)),
    event: eventName,
  };
}

function safeCell_(value) {
  if (/^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

function append_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = sheet_();
    sheet.appendRow([
      data.time,
      data.pid,
      data.study,
      data.round,
      data.avatarId,
      data.avatarLabel,
      data.videoFile,
      data.event,
    ]);
    var row = sheet.getLastRow();
    sheet.getRange(row, 2).setNumberFormat("@").setValue(data.pid);
  } finally {
    lock.releaseLock();
  }
}

function sheet_() {
  var sheet = namedSheet_("Log", HEADERS);
  sheet.getRange("B:B").setNumberFormat("@");
  return sheet;
}

function pidsSheet_() {
  var sheet = namedSheet_("PIDs", PID_HEADERS);
  sheet.getRange("A:A").setNumberFormat("@");
  return sheet;
}

function namedSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function issuePid_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = pidsSheet_();
    var last = sheet.getLastRow();
    var max = 0;
    if (last >= 2) {
      var ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) {
        var parsed = parseInt(ids[i][0], 10);
        if (parsed > max) max = parsed;
      }
    }
    var next = max + 1;
    var pid = next < 100000 ? ("00000" + next).slice(-5) : String(next);
    sheet.appendRow([pid, new Date().toISOString(), ""]);
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat("@").setValue(pid);
    return { ok: true, pid: pid };
  } finally {
    lock.releaseLock();
  }
}

function claimSurvey_(pid) {
  pid = String(pid || "").trim();
  if (!PID_PATTERN.test(pid)) return { ok: false, reason: "unknown" };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = pidsSheet_();
    var last = sheet.getLastRow();
    if (last < 2) return { ok: false, reason: "unknown" };
    var values = sheet.getRange(2, 1, last - 1, 3).getDisplayValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]) !== pid) continue;
      if (String(values[i][2] || "")) return { ok: false, reason: "duplicate" };
      sheet.getRange(i + 2, 3).setValue(new Date().toISOString());
      return { ok: true, pid: pid };
    }
    return { ok: false, reason: "unknown" };
  } finally {
    lock.releaseLock();
  }
}

function scriptResult_(result, callback) {
  var body = JSON.stringify(result);
  var name = String(callback || "");
  if (/^[A-Za-z_$][A-Za-z0-9_$]{0,60}$/.test(name)) {
    return ContentService
      .createTextOutput(name + "(" + body + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
