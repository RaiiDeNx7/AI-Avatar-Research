(function () {
  const SESSION_KEY = "avatarStudy.session.v1";
  const LOG_KEY = "avatarStudy.log.v1";
  const COUNTER_KEY = "avatarStudy.pidCounter.v2";
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const AVATAR_COLORS = ["#1f4b6e", "#1e6b45", "#8a4b12", "#6b2d5b", "#3d4a34", "#204e57"];
  const LOG_COLUMNS = ["time", "pid", "study", "round", "avatarId", "avatarLabel", "videoFile", "event"];

  const config = normalizeConfig(window.STUDY_CONFIG);
  const main = document.getElementById("app");
  let session = loadSession();
  let copyTimer = 0;
  let issuing = false;
  let startError = "";
  let surveyError = "";
  let surveyClaiming = false;
  let playback = {
    volume: session && typeof session.volume === "number" ? session.volume : 1,
    rate: session && typeof session.rate === "number" ? session.rate : 1,
  };

  function normalizeConfig(raw) {
    const source = raw || {};
    const fixed = source.fixed || {};
    const variety = source.variety || {};
    const survey = source.survey || {};
    const log = source.log || {};
    return {
      title: source.title || "AI Avatar Study",
      overviewTitle: source.overviewTitle || "About this study",
      paragraphs: Array.isArray(source.paragraphs) ? source.paragraphs : [],
      steps: Array.isArray(source.steps) ? source.steps : [],
      fixed: {
        buttonTitle: fixed.buttonTitle || "Fixed Study",
        buttonText: fixed.buttonText || "",
        avatarId: fixed.avatarId || "fixed",
        avatarLabel: fixed.avatarLabel || "Female Black woman",
        videos: Array.isArray(fixed.videos) ? fixed.videos : [],
      },
      variety: {
        buttonTitle: variety.buttonTitle || "Variety Study",
        buttonText: variety.buttonText || "",
        intro: variety.intro || "Choose one avatar for this video.",
        avatars: Array.isArray(variety.avatars) ? variety.avatars : [],
        rounds: Array.isArray(variety.rounds) ? variety.rounds : [],
      },
      survey: {
        formUrl: survey.formUrl || "",
        pidEntryId: survey.pidEntryId || "",
      },
      log: {
        scriptUrl: log.scriptUrl || "",
      },
    };
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function readCounter() {
    try {
      const data = JSON.parse(localStorage.getItem(COUNTER_KEY) || "null");
      if (data && Number.isInteger(data.next) && data.next >= 1) {
        data.active = data.active || "";
        data.submitted = Boolean(data.submitted);
        return data;
      }
    } catch (error) {}
    return { next: 1, active: "", submitted: false };
  }

  function saveCounter(counter) {
    try {
      localStorage.setItem(COUNTER_KEY, JSON.stringify(counter));
    } catch (error) {}
  }

  function markSubmitted(pid) {
    const counter = readCounter();
    if (!counter.active || counter.active !== pid || counter.submitted) return;
    counter.submitted = true;
    counter.next += 1;
    saveCounter(counter);
  }

  function formatPid(number) {
    const text = String(number);
    return text.length < 5 ? text.padStart(5, "0") : text;
  }

  function takeLocalPid() {
    const counter = readCounter();
    const pid = formatPid(counter.next);
    counter.active = pid;
    counter.next += 1;
    counter.submitted = true;
    saveCounter(counter);
    return pid;
  }

  function counterUrl() {
    const url = String(config.log.scriptUrl || "").trim();
    try {
      const parsed = new URL(url);
      const google = parsed.protocol === "https:" &&
        parsed.hostname === "script.google.com" &&
        /\/macros\/s\/[^/]+\/exec\/?$/.test(parsed.pathname);
      const localPreview = location.hostname === "127.0.0.1" &&
        parsed.hostname === "127.0.0.1" &&
        parsed.protocol === "http:" &&
        /\/exec\/?$/.test(parsed.pathname);
      if (!google && !localPreview) return "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch (error) {
      return "";
    }
  }

  function callCounter(params) {
    const base = counterUrl();
    if (!base) return Promise.reject(new Error("missing"));
    return new Promise(function (resolve, reject) {
      const callback = "avatarStudyCb" + Date.now() + Math.floor(Math.random() * 100000);
      const script = document.createElement("script");
      const timer = window.setTimeout(function () {
        cleanup();
        reject(new Error("timeout"));
      }, 15000);
      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[callback]; } catch (error) { window[callback] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[callback] = function (data) {
        cleanup();
        resolve(data || {});
      };
      const url = new URL(base);
      Object.keys(params).forEach(function (key) {
        url.searchParams.set(key, params[key]);
      });
      url.searchParams.set("callback", callback);
      script.src = url.toString();
      script.onerror = function () {
        cleanup();
        reject(new Error("network"));
      };
      document.head.appendChild(script);
    });
  }

  function loadSession() {
    try {
      const data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (!data || !/^\d{5,}$/.test(data.pid)) return null;
      if (data.study && data.study !== "fixed" && data.study !== "variety") return null;
      data.round = Number.isInteger(data.round) ? data.round : 0;
      data.selection = data.selection || null;
      data.watched = Boolean(data.watched);
      data.loggedStarted = Boolean(data.loggedStarted);
      data.loggedCompleted = Boolean(data.loggedCompleted);
      data.surveyLogged = Boolean(data.surveyLogged);
      data.surveyClaimed = Boolean(data.surveyClaimed);
      data.surveyDuplicate = Boolean(data.surveyDuplicate);
      data.phase = data.phase || "participation";
      return data;
    } catch (error) {
      return null;
    }
  }

  function saveSession() {
    if (!session) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function readLog() {
    try {
      const rows = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      return [];
    }
  }

  function appendLocal(row) {
    try {
      const rows = readLog();
      rows.push(row);
      localStorage.setItem(LOG_KEY, JSON.stringify(rows.length > 2000 ? rows.slice(-2000) : rows));
    } catch (error) {
      // The study can continue even if this browser refuses storage.
    }
  }

  function postToSheet(row) {
    const url = String(config.log.scriptUrl || "").trim();
    if (!/^https:\/\//i.test(url)) return;
    const body = new URLSearchParams();
    LOG_COLUMNS.forEach(function (key) {
      body.set(key, row[key] == null ? "" : String(row[key]));
    });
    fetch(url, { method: "POST", mode: "no-cors", body: body }).catch(function () {});
  }

  function logEvent(eventName, fields) {
    if (!session || !session.pid) return;
    const row = {
      time: new Date().toISOString(),
      pid: session.pid,
      study: fields.study || session.study || "",
      round: fields.round == null ? "" : String(fields.round),
      avatarId: fields.avatarId || "",
      avatarLabel: fields.avatarLabel || "",
      videoFile: fields.videoFile || "",
      event: eventName,
    };
    appendLocal(row);
    postToSheet(row);
  }

  function roundCount() {
    if (!session) return 0;
    if (session.study === "fixed") return config.fixed.videos.length;
    if (session.study === "variety") return config.variety.rounds.length;
    return 0;
  }

  function currentMeta() {
    if (!session || !session.study) return null;
    if (session.study === "fixed") {
      const video = config.fixed.videos[session.round] || {};
      return {
        study: "fixed",
        round: session.round + 1,
        avatarId: config.fixed.avatarId,
        avatarLabel: config.fixed.avatarLabel,
        videoFile: video.src || "",
      };
    }
    const selection = session.selection || {};
    return {
      study: "variety",
      round: session.round + 1,
      avatarId: selection.avatarId || "",
      avatarLabel: selection.avatarLabel || "",
      videoFile: selection.videoFile || "",
    };
  }

  function requestedView() {
    const hash = location.hash.replace(/^#/, "").toLowerCase();
    if (["home", "participation", "study", "survey", "admin"].indexOf(hash) !== -1) return hash;
    return "home";
  }

  function resolveView() {
    const view = requestedView();
    if (view === "admin") return "admin";
    if (!session) return view === "participation" ? "participation" : "home";
    if (view === "home" || view === "participation") return view;
    if (!session.study) return "participation";
    if (session.phase === "survey") return "survey";
    return "study";
  }

  function resumeView() {
    if (!session) return "home";
    if (!session.study) return "participation";
    if (session.phase === "survey") return "survey";
    return "study";
  }

  function go(view) {
    const next = "#" + view;
    if (location.hash === next) render();
    else location.hash = next;
  }

  function assignSession(pid) {
    playback = { volume: 1, rate: 1 };
    startError = "";
    session = {
      pid: pid,
      study: null,
      phase: "participation",
      round: 0,
      selection: null,
      watched: false,
      loggedStarted: false,
      loggedCompleted: false,
      surveyLogged: false,
      surveyClaimed: false,
      surveyDuplicate: false,
      volume: 1,
      rate: 1,
    };
    saveSession();
    go("participation");
  }

  function startNew() {
    if (issuing) return;
    if (!counterUrl()) {
      assignSession(takeLocalPid());
      return;
    }
    issuing = true;
    startError = "";
    render();
    callCounter({ action: "next" }).then(function (data) {
      issuing = false;
      const pid = data && data.ok ? String(data.pid || "") : "";
      if (!/^\d{5,}$/.test(pid)) {
        startError = "A new participant ID could not be issued. Try again.";
        render();
        return;
      }
      saveCounter({ next: Number(pid) + 1, active: pid, submitted: false });
      assignSession(pid);
    }, function () {
      issuing = false;
      startError = "A new participant ID could not be issued. Try again.";
      render();
    });
  }

  function chooseStudy(name) {
    if (!session || session.study) return;
    if (name !== "fixed" && name !== "variety") return;
    session.study = name;
    session.phase = name === "variety" ? "pick" : "watch";
    session.round = 0;
    session.selection = null;
    session.watched = false;
    session.loggedStarted = false;
    session.loggedCompleted = false;
    saveSession();
    go("study");
  }

  function chooseAvatar(avatarId) {
    if (!session || session.study !== "variety" || session.phase !== "pick") return;
    const avatar = config.variety.avatars.find(function (item) { return item.id === avatarId; });
    const round = config.variety.rounds[session.round];
    if (!avatar || !round || !round.clips) return;
    const videoFile = round.clips[avatar.id] || "";
    session.selection = {
      avatarId: avatar.id,
      avatarLabel: avatar.label,
      videoFile: videoFile,
    };
    session.phase = "watch";
    session.watched = false;
    session.loggedStarted = false;
    session.loggedCompleted = false;
    saveSession();
    logEvent("selected", currentMeta());
    render();
  }

  function chooseAgain() {
    if (!session || session.study !== "variety") return;
    if (session.loggedStarted || session.watched) return;
    session.phase = "pick";
    session.selection = null;
    saveSession();
    render();
  }

  function continueVideo() {
    if (!session) return;
    const total = roundCount();
    if (session.round < total - 1) {
      session.round += 1;
      session.phase = session.study === "variety" ? "pick" : "watch";
      session.selection = null;
      session.watched = false;
      session.loggedStarted = false;
      session.loggedCompleted = false;
      saveSession();
      render();
      return;
    }
    session.phase = "survey";
    saveSession();
    go("survey");
  }

  function toggleFullscreen() {
    const watch = document.querySelector(".watch");
    if (!watch) return;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    const request = watch.requestFullscreen || watch.webkitRequestFullscreen;
    if (request) {
      const pending = request.call(watch);
      if (pending && pending.catch) pending.catch(function () {});
    }
  }

  function togglePlay() {
    const video = document.getElementById("study-video");
    if (!video || video.error) return;
    if (video.paused) {
      const pending = video.play();
      if (pending && pending.catch) {
        pending.catch(function () {
          const status = document.getElementById("play-status");
          if (status) status.textContent = "The video could not be played.";
        });
      }
    } else {
      video.pause();
    }
  }

  function surveyHref() {
    const raw = String(config.survey.formUrl || "").trim();
    if (!raw || !session) return "";
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      const entry = String(config.survey.pidEntryId || "").trim();
      if (entry) {
        const key = entry.indexOf("entry.") === 0 ? entry : "entry." + entry;
        url.searchParams.set("usp", "pp_url");
        url.searchParams.set(key, session.pid);
      }
      return url.toString();
    } catch (error) {
      return "";
    }
  }

  function openSurvey() {
    if (!session || session.surveyLogged || session.surveyDuplicate) return;
    if (counterUrl() && !session.surveyClaimed) return;
    session.surveyLogged = true;
    saveSession();
    markSubmitted(session.pid);
    logEvent("survey_opened", {
      study: session.study,
      round: "",
      avatarId: "",
      avatarLabel: "",
      videoFile: "",
    });
  }

  function ensureSurveyClaim() {
    if (!session || session.phase !== "survey" || surveyClaiming) return;
    if (session.surveyClaimed || session.surveyDuplicate || surveyError) return;
    if (!counterUrl()) return;
    surveyClaiming = true;
    const pid = session.pid;
    callCounter({ action: "claim", pid: pid }).then(function (data) {
      surveyClaiming = false;
      if (!session || session.pid !== pid || session.phase !== "survey") return;
      if (data && data.ok) {
        session.surveyClaimed = true;
        surveyError = "";
      } else if (data && data.reason === "duplicate") {
        session.surveyDuplicate = true;
        session.surveyClaimed = false;
      } else if (data && data.reason === "unknown") {
        surveyError = "This participant ID was not issued by the shared counter, so the survey cannot be opened.";
      } else {
        surveyError = "This participant ID could not be checked. Refresh the page to try again.";
      }
      saveSession();
      render();
    }, function () {
      surveyClaiming = false;
      if (!session || session.pid !== pid) return;
      surveyError = "This participant ID could not be checked. Refresh the page to try again.";
      render();
    });
  }

  function copyPid() {
    if (!session) return;
    const text = session.pid;
    const done = function () {
      const button = document.getElementById("pid-button");
      const status = document.getElementById("pid-status");
      if (button) button.classList.add("is-copied");
      if (status) status.textContent = "PID copied.";
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(function () {
        if (button) button.classList.remove("is-copied");
        if (status) status.textContent = "";
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (error) {}
    area.remove();
  }

  function csvEscape(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function toCsv(rows) {
    const lines = [LOG_COLUMNS.join(",")];
    rows.forEach(function (row) {
      lines.push(LOG_COLUMNS.map(function (key) {
        if (key === "pid") return '="' + String(row[key] ?? "").replace(/"/g, '""') + '"';
        return csvEscape(row[key]);
      }).join(","));
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(readLog())], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "avatar-study-log.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function clearLog() {
    if (!window.confirm("Clear the watch log stored in this browser? The Google Sheet is not changed.")) return;
    localStorage.removeItem(LOG_KEY);
    render();
  }

  function updateChrome(view) {
    document.title = config.title;
    const brand = document.getElementById("brand");
    if (brand) brand.textContent = config.title;
    const navKey = view === "home" ? "home" : view === "admin" ? "" : "participation";
    document.querySelectorAll("[data-nav]").forEach(function (link) {
      if (link.dataset.nav === navKey) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const value = document.getElementById("pid-value");
    const button = document.getElementById("pid-button");
    if (!value || !button) return;
    if (session) {
      value.textContent = session.pid;
      button.setAttribute("aria-label", "Copy participant ID " + session.pid);
    } else {
      value.textContent = "—";
      button.setAttribute("aria-label", "Participant ID appears after you start");
    }
  }

  function stepsHtml(activeIndex) {
    const total = roundCount();
    let html = '<ol class="progress-steps">';
    for (let i = 0; i < total; i += 1) {
      const state = i < activeIndex ? "is-done" : i === activeIndex ? "is-current" : "";
      html += '<li class="' + state + '">Video ' + (i + 1) + "</li>";
    }
    html += "</ol>";
    return html;
  }

  function initials(label) {
    const parts = String(label || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function startButton(label, secondary) {
    const cls = secondary ? "button secondary" : "button";
    return '<button type="button" class="' + cls + '" data-action="start-new"' + (issuing ? " disabled" : "") + ">" +
      (issuing ? "Issuing ID…" : label) + "</button>";
  }

  function startNote() {
    if (startError) return '<p class="note">' + esc(startError) + "</p>";
    if (issuing) return '<p class="note">Issuing a participant ID from the shared counter.</p>';
    return "";
  }

  function gateHtml() {
    return (
      '<section class="panel">' +
      "<h1>Start a participant first</h1>" +
      '<p class="lede">A participant ID is created when a session starts. The ID stays in the top right for this browser tab.</p>' +
      startNote() +
      '<div class="actions">' + startButton("Start new participant", false) + "</div>" +
      "</section>"
    );
  }

  function homeHtml() {
    const paragraphs = config.paragraphs.map(function (text) {
      return "<p>" + esc(text) + "</p>";
    }).join("");
    const actions = session
      ? '<button type="button" class="button" data-action="continue">Continue session</button>' +
        startButton("Start new participant", true)
      : startButton("Start new participant", false);
    const sessionNote = session
      ? '<p class="note">A session is open for PID ' + esc(session.pid) + ". Continue only if you are that participant. Start a new participant before handing this browser to someone else.</p>"
      : "";
    return (
      "<section>" +
      '<div class="prose"><h1>' + esc(config.overviewTitle) + "</h1>" + paragraphs + "</div>" +
      sessionNote +
      startNote() +
      '<div class="actions">' + actions + "</div>" +
      "</section>"
    );
  }

  function participationHtml() {
    if (!session) return gateHtml();
    if (session.study) {
      const name = session.study === "fixed" ? config.fixed.buttonTitle : config.variety.buttonTitle;
      return (
        "<section>" +
        "<h1>Participation</h1>" +
        '<div class="panel">' +
        "<p>This participant is in the <strong>" + esc(name) + "</strong>. A path cannot be changed after it is chosen.</p>" +
        '<p class="note">To begin again with someone new, go to Home and press Start new participant.</p>' +
        '<div class="actions"><button type="button" class="button" data-action="continue">Resume</button></div>' +
        "</div></section>"
      );
    }
    return (
      "<section>" +
      "<h1>Participation</h1>" +
      '<p class="lede">Choose one path. This participant stays on that path.</p>' +
      '<div class="choice-grid">' +
      '<button type="button" class="choice" data-action="choose-study" data-study="fixed"><strong>' +
      esc(config.fixed.buttonTitle) + "</strong><span>" + esc(config.fixed.buttonText) + "</span></button>" +
      '<button type="button" class="choice" data-action="choose-study" data-study="variety"><strong>' +
      esc(config.variety.buttonTitle) + "</strong><span>" + esc(config.variety.buttonText) + "</span></button>" +
      "</div></section>"
    );
  }

  function studyHtml() {
    prepareStudyPhase();
    if (!roundCount()) {
      return '<section class="panel"><h1>Videos are not listed yet</h1><p>Add the video files and paths in config.js.</p></section>';
    }
    if (session.study === "variety" && session.phase === "pick") return pickerHtml();
    return playerHtml();
  }

  function prepareStudyPhase() {
    const total = roundCount();
    if (session.round < 0 || session.round >= total) session.round = 0;
    if (session.study === "fixed" && session.phase !== "survey") session.phase = "watch";
    if (session.study === "variety" && session.phase === "watch" && !session.selection) session.phase = "pick";
    saveSession();
  }

  function pickerHtml() {
    const cards = config.variety.avatars.map(function (avatar, index) {
      const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
      const portrait = avatar.portrait
        ? '<img class="portrait" alt="" src="' + esc(avatar.portrait) + '">'
        : "";
      return (
        '<button type="button" class="avatar-card" data-action="choose-avatar" data-avatar-id="' + esc(avatar.id) + '">' +
        '<span class="avatar-visual"><span class="monogram" style="background:' + color + '">' + esc(initials(avatar.label)) +
        "</span>" + portrait + "</span>" +
        '<span class="avatar-label">' + esc(avatar.label) + "</span></button>"
      );
    }).join("");
    return (
      "<section>" +
      '<p class="eyebrow">' + esc(config.variety.buttonTitle) + "</p>" +
      "<h1>Choose an avatar</h1>" +
      stepsHtml(session.round) +
      '<p class="lede">' + esc(config.variety.intro) + "</p>" +
      '<div class="avatar-grid">' + cards + "</div></section>"
    );
  }

  function playerHtml() {
    const meta = currentMeta();
    const total = roundCount();
    const last = session.round >= total - 1;
    const title = session.study === "fixed" ? config.fixed.buttonTitle : config.variety.buttonTitle;
    const who = meta.avatarLabel ? '<p class="lede">' + esc(meta.avatarLabel) + "</p>" : "";
    const again = session.study === "variety" && !session.loggedStarted && !session.watched
      ? '<button type="button" class="button secondary" data-action="choose-again">Choose a different avatar</button>'
      : "";
    const continueLabel = last ? "Continue to survey" : "Next video";
    const playLabel = session.watched ? "Play again" : "Play";
    const playClass = session.watched ? "button secondary" : "button";
    const continueClass = "button push";
    const status = "Press Play when you are ready. Click the bar to move through the video.";
    return (
      '<section class="watch">' +
      '<p class="eyebrow">' + esc(title) + "</p>" +
      "<h1>Video " + (session.round + 1) + " of " + total + "</h1>" +
      stepsHtml(session.round) +
      who +
      '<div class="player"><video id="study-video" playsinline disablepictureinpicture aria-label="Study video"></video></div>' +
      '<div class="track" id="progress" role="progressbar" aria-label="Watched progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="progress-fill"></div></div>' +
      '<div class="media-controls">' +
      '<label>Volume <input id="volume" type="range" min="0" max="100" step="1" value="' + Math.round(playback.volume * 100) + '" aria-valuemin="0" aria-valuemax="100"></label>' +
      '<label>Speed <select id="speed" aria-label="Playback speed">' +
      SPEEDS.map(function (speed) {
        return '<option value="' + speed + '"' + (speed === playback.rate ? " selected" : "") + ">" + speed + "×</option>";
      }).join("") +
      "</select></label></div>" +
      '<p id="play-status" class="status" aria-live="polite">' + esc(status) + "</p>" +
      '<div class="actions">' +
      '<button type="button" class="' + playClass + '" id="play-btn" data-action="play">' + playLabel + "</button>" +
      '<button type="button" class="button secondary" id="fullscreen-btn" data-action="fullscreen">Full screen</button>' +
      again +
      '<button type="button" class="' + continueClass + '" id="continue-btn" data-action="continue-video">' + continueLabel + "</button>" +
      "</div></section>"
    );
  }

  function surveyHtml() {
    const href = surveyHref();
    const prefilled = Boolean(String(config.survey.pidEntryId || "").trim() && href);
    let note;
    let control;
    if (session.surveyDuplicate) {
      note = "This participant ID has already opened the survey. It cannot be opened again.";
      control = '<button type="button" class="button" disabled>Survey already opened</button>';
    } else if (counterUrl() && !session.surveyClaimed) {
      note = surveyError || "Checking this participant ID before the survey opens.";
      control = '<button type="button" class="button" disabled>' + (surveyError ? "Survey unavailable" : "Checking ID") + "</button>";
    } else if (session.surveyLogged) {
      note = "The survey has been opened for this participant ID. Submit it once.";
      control = '<button type="button" class="button" disabled>Survey opened</button>';
    } else if (href) {
      note = prefilled
        ? "Your PID is filled in on the survey. Submit the form once, then come back here."
        : "Copy the PID above and type it into the Participant ID question. Submit the form once.";
      control = '<a class="button" data-action="open-survey" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">Open the survey</a>';
    } else {
      note = "The survey link has not been added yet.";
      control = '<button type="button" class="button" disabled>Survey link missing</button>';
    }
    return (
      "<section>" +
      "<h1>Survey</h1>" +
      stepsHtml(roundCount()) +
      '<p class="lede">You have watched all ' + roundCount() + " videos. Submit the survey once before the next person starts.</p>" +
      '<p class="pid-display">' + esc(session.pid) + "</p>" +
      '<div class="actions">' +
      '<button type="button" class="button secondary" data-action="copy-pid">Copy PID</button>' +
      control +
      "</div>" +
      '<p class="note">' + esc(note) + " The next person receives a new ID when they press Start new participant.</p>" +
      "</section>"
    );
  }

  function adminHtml() {
    const rows = readLog();
    const connected = Boolean(counterUrl());
    const sheetNote = connected
      ? "Events are sent to the Google Sheet. Participant IDs are issued there, and each ID can open the survey once."
      : "Participant IDs are counted in this browser, starting at 00001. The next number is issued after the survey is opened.";
    const body = rows.map(function (row) {
      return (
        '<tr data-log-row data-pid="' + esc(row.pid) + '">' +
        LOG_COLUMNS.map(function (key) {
          const cls = key === "pid" ? ' class="pid-cell"' : "";
          return "<td" + cls + ">" + esc(row[key]) + "</td>";
        }).join("") +
        "</tr>"
      );
    }).join("");
    const empty = rows.length ? "" : "<p>No videos have been logged in this browser yet.</p>";
    return (
      "<section>" +
      "<h1>Researcher log</h1>" +
      '<p class="lede">' + sheetNote + "</p>" +
      '<p class="note">' + rows.length + " event" + (rows.length === 1 ? "" : "s") + " on this browser." +
      (session ? " Current PID: " + esc(session.pid) + "." : "") + "</p>" +
      '<div class="log-tools">' +
      '<label>Filter by PID <input id="log-filter" type="search" autocomplete="off" spellcheck="false"></label>' +
      '<button type="button" class="button" data-action="download-csv">Download CSV</button>' +
      '<button type="button" class="button secondary" data-action="clear-log">Clear browser log</button>' +
      "</div>" +
      empty +
      '<div class="log-scroller" id="log-scroller"><table><thead><tr>' +
      LOG_COLUMNS.map(function (key) { return "<th>" + esc(key) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + body + "</tbody></table></div></section>"
    );
  }

  function viewHtml(view) {
    if (view === "home") return homeHtml();
    if (view === "participation") return participationHtml();
    if (view === "study") return studyHtml();
    if (view === "survey") return surveyHtml();
    return adminHtml();
  }

  function bindPlayer() {
    const video = document.getElementById("study-video");
    if (!video) return;
    const meta = currentMeta();
    const playBtn = document.getElementById("play-btn");
    const continueBtn = document.getElementById("continue-btn");
    const fill = document.getElementById("progress-fill");
    const bar = document.getElementById("progress");
    const status = document.getElementById("play-status");
    const volume = document.getElementById("volume");
    const speed = document.getElementById("speed");

    function applyPlayback() {
      video.volume = playback.volume;
      video.playbackRate = playback.rate;
    }

    function rememberPlayback() {
      if (!session) return;
      session.volume = playback.volume;
      session.rate = playback.rate;
      saveSession();
    }

    function showError(message) {
      if (status) {
        status.textContent = message;
        status.classList.add("is-error");
      }
      if (playBtn) playBtn.disabled = true;
    }

    function updateProgress() {
      if (!video.duration || !isFinite(video.duration)) return;
      const pct = Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100));
      if (fill) fill.style.width = pct + "%";
      if (bar) bar.setAttribute("aria-valuenow", String(Math.round(pct)));
    }

    video.addEventListener("play", function () {
      if (playBtn) playBtn.textContent = "Pause";
      if (status && !video.ended) {
        status.classList.remove("is-error");
        status.textContent = "Playing";
      }
      if (!session.loggedStarted) {
        session.loggedStarted = true;
        saveSession();
        logEvent("started", meta);
      }
    });

    video.addEventListener("pause", function () {
      if (video.ended) return;
      if (playBtn) playBtn.textContent = "Play";
      if (status) status.textContent = "Paused";
    });

    video.addEventListener("ended", function () {
      if (playBtn) {
        playBtn.textContent = "Play again";
        playBtn.classList.add("secondary");
      }
      if (status) {
        status.classList.remove("is-error");
        status.textContent = "Video complete.";
      }
      if (continueBtn) {
        continueBtn.disabled = false;
        continueBtn.classList.remove("secondary");
      }
      updateProgress();
      if (!session.watched) {
        session.watched = true;
        session.loggedCompleted = true;
        saveSession();
        logEvent("completed", meta);
      }
    });

    video.addEventListener("timeupdate", updateProgress);

    if (bar) {
      bar.addEventListener("click", function (event) {
        if (!video.duration || !isFinite(video.duration)) return;
        const rect = bar.getBoundingClientRect();
        const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
        video.currentTime = Math.max(0, Math.min(video.duration, ratio * video.duration));
      });
    }

    video.addEventListener("dblclick", function () { toggleFullscreen(); });
    video.addEventListener("loadedmetadata", applyPlayback);
    video.addEventListener("play", applyPlayback);
    if (!document.documentElement.dataset.fullscreenBound) {
      document.documentElement.dataset.fullscreenBound = "1";
      function onFullscreenChange() {
        const watch = document.querySelector(".watch");
        const button = document.getElementById("fullscreen-btn");
        const active = document.fullscreenElement || document.webkitFullscreenElement;
        if (watch) watch.classList.toggle("is-fullscreen", Boolean(active) && active === watch);
        if (button) button.textContent = active && watch && active === watch ? "Exit full screen" : "Full screen";
      }
      document.addEventListener("fullscreenchange", onFullscreenChange);
      document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    }

    if (volume) {
      volume.addEventListener("input", function () {
        playback.volume = Number(volume.value) / 100;
        video.volume = playback.volume;
        rememberPlayback();
      });
    }
    if (speed) {
      speed.addEventListener("change", function () {
        const nextRate = Number(speed.value);
        playback.rate = SPEEDS.indexOf(nextRate) === -1 ? 1 : nextRate;
        video.playbackRate = playback.rate;
        rememberPlayback();
      });
    }

    video.addEventListener("error", function () {
      showError("This video file is not available yet (" + (meta.videoFile || "missing path") + ").");
    });

    video.addEventListener("contextmenu", function (event) { event.preventDefault(); });
    video.addEventListener("keydown", function (event) {
      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].indexOf(event.key) !== -1) {
        event.preventDefault();
      }
    });

    applyPlayback();
    if (!meta.videoFile) showError("This video file is not available yet (missing path).");
    else video.src = new URL(meta.videoFile, window.location.href).href;
  }

  function bindAdmin() {
    const filter = document.getElementById("log-filter");
    const scroller = document.getElementById("log-scroller");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    if (!filter) return;
    filter.addEventListener("input", function () {
      const query = filter.value.trim().toUpperCase();
      document.querySelectorAll("[data-log-row]").forEach(function (row) {
        row.hidden = Boolean(query) && row.dataset.pid.indexOf(query) === -1;
      });
    });
  }

  function bindPortraits() {
    main.querySelectorAll(".portrait").forEach(function (image) {
      image.addEventListener("error", function () { image.remove(); });
    });
  }

  function render() {
    const view = resolveView();
    const hash = "#" + view;
    if (location.hash !== hash) history.replaceState(null, "", hash);
    updateChrome(view);
    main.innerHTML = viewHtml(view);
    bindPlayer();
    bindPortraits();
    if (view === "admin") bindAdmin();
    if (view === "survey") ensureSurveyClaim();
    const heading = main.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      if (document.activeElement && document.activeElement !== document.body && main.contains(document.activeElement)) {
        return;
      }
    }
  }

  function onClick(event) {
    const el = event.target.closest("[data-action]");
    if (!el || !main.contains(el)) return;
    const action = el.dataset.action;
    if (action === "start-new") startNew();
    else if (action === "continue") go(resumeView());
    else if (action === "choose-study") chooseStudy(el.dataset.study);
    else if (action === "choose-avatar") chooseAvatar(el.dataset.avatarId);
    else if (action === "play") togglePlay();
    else if (action === "fullscreen") toggleFullscreen();
    else if (action === "choose-again") chooseAgain();
    else if (action === "continue-video") continueVideo();
    else if (action === "open-survey") {
      if (!session || session.surveyLogged || session.surveyDuplicate || (counterUrl() && !session.surveyClaimed)) {
        event.preventDefault();
        return;
      }
      openSurvey();
    }
    else if (action === "copy-pid") copyPid();
    else if (action === "download-csv") downloadCsv();
    else if (action === "clear-log") clearLog();
  }

  function onKeydown(event) {
    if (event.code !== "Space") return;
    if (event.target.closest("button, a, input, textarea")) return;
    const video = document.getElementById("study-video");
    if (!video) return;
    event.preventDefault();
    togglePlay();
  }

  function init() {
    document.getElementById("pid-button").addEventListener("click", copyPid);
    main.addEventListener("click", onClick);
    window.addEventListener("hashchange", render);
    document.addEventListener("keydown", onKeydown);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
