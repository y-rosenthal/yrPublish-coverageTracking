(function () {
  "use strict";

  var STORAGE_KEY_STUDENT = "ct_selected_section";
  var STORAGE_KEY_PROF = "ct_selected_sections";
  var STORAGE_KEY_PROF_EDITOR_SECTION = "ct_prof_editor_section";

  function getStudentStorage() {
    return window.sessionStorage;
  }

  function getPathCandidates() {
    var pathname = window.location.pathname || "";
    var clean = pathname.replace(/\/+$/, "") || "/";
    var base = clean.split("/").pop() || "index.html";
    var baseWithSlash = "/" + base;
    var indexAsRoot = clean.endsWith("/index.html") ? clean.replace(/\/index\.html$/, "/") : clean;
    return [clean, indexAsRoot, baseWithSlash, "/index.html"].filter(function (v, i, arr) {
      return v && arr.indexOf(v) === i;
    });
  }

  function getCanonicalPageUrl() {
    var pathname = window.location.pathname || "/";
    if (pathname.endsWith("/")) {
      return pathname + "index.html";
    }
    if (pathname === "/") {
      return "/index.html";
    }
    return pathname;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function isProfessorMode() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has("prof")) {
      return false;
    }
    var value = params.get("prof");
    return value === "" || value === "true";
  }

  function shouldResetStudentSelection() {
    return getQueryParam("resetSection") === "true";
  }

  function professorQueryValue() {
    var params = new URLSearchParams(window.location.search);
    return params.has("prof") ? params.get("prof") : null;
  }

  function createElement(tag, attrs, text) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        el.setAttribute(key, attrs[key]);
      });
    }
    if (typeof text === "string") {
      el.textContent = text;
    }
    return el;
  }

  function fetchJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) {
        throw new Error("Failed loading " + path + ": " + res.status);
      }
      return res.json();
    });
  }

  function fetchText(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) {
        throw new Error("Failed loading " + path + ": " + res.status);
      }
      return res.text();
    });
  }

  function getTrackerBasePath() {
    var script =
      document.currentScript ||
      document.querySelector("script[src*='coverage-tracking/coverage-tracker.js']") ||
      document.querySelector("script[src$='coverage-tracker.js']");
    if (!script) {
      return "assets/coverage-tracking/";
    }
    var src = script.getAttribute("src") || "";
    return src.replace(/coverage-tracker\.js(\?.*)?$/, "");
  }

  function showTrackerLoadError(message) {
    if (document.getElementById("ct-load-error")) {
      return;
    }
    var panel = createElement("div", { id: "ct-load-error", class: "ct-overlay" });
    var content = createElement("div", { class: "ct-panel", role: "alert" });
    content.appendChild(createElement("h2", null, "Coverage tracker failed to load"));
    content.appendChild(
      createElement("p", null, message || "Could not load coverage files. Refresh the page or check asset paths.")
    );
    panel.appendChild(content);
    document.body.appendChild(panel);
  }

  function parseCoverageCsv(csvText) {
    var byUrl = {};
    var rawByUrl = {};
    csvText.split(/\r?\n/).forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        return;
      }

      var parts = rawLine.split(",");
      if (parts.length < 2) {
        return;
      }

      var url = (parts[0] || "").trim();
      var htmlId = (parts[1] || "").trim();
      var state = (parts[2] || "").trim().toLowerCase();

      if (!url || !htmlId) {
        return;
      }

      if (url.toLowerCase() === "url" && htmlId.toLowerCase() === "html-id") {
        return;
      }

      if (!byUrl[url]) {
        byUrl[url] = {};
      }
      if (!rawByUrl[url]) {
        rawByUrl[url] = {};
      }

      // Default behavior:
      // - missing 3rd column or empty 3rd column -> covered
      // - "covered" -> covered
      // - "not-covered" -> not covered
      var isCovered = parts.length < 3 || state === "" || state === "covered";
      if (state === "not-covered") {
        isCovered = false;
      }
      byUrl[url][htmlId] = isCovered;
      rawByUrl[url][htmlId] = rawLine.trim();
    });
    return { byUrl: byUrl, rawByUrl: rawByUrl };
  }

  function setPageCoverageForSection(coverageState, sectionId, pageUrl, htmlId, covered, hasExplicitRow, rawLine) {
    if (!coverageState.bySection[sectionId]) {
      coverageState.bySection[sectionId] = {};
    }
    if (!coverageState.rawBySection[sectionId]) {
      coverageState.rawBySection[sectionId] = {};
    }
    var pageMap = coverageState.bySection[sectionId];
    var rawPageMap = coverageState.rawBySection[sectionId];
    if (!pageMap[pageUrl]) {
      pageMap[pageUrl] = {};
    }
    if (!rawPageMap[pageUrl]) {
      rawPageMap[pageUrl] = {};
    }
    if (hasExplicitRow === false) {
      delete pageMap[pageUrl][htmlId];
      delete rawPageMap[pageUrl][htmlId];
      return;
    }
    pageMap[pageUrl][htmlId] = covered;
    rawPageMap[pageUrl][htmlId] = rawLine || csvEscape(pageUrl) + "," + csvEscape(htmlId) + "," + (covered ? "covered" : "not-covered");
  }

  /**
   * Trackable anchors: Quarto book HTML often puts the id on a wrapping <section>,
   * and chapter titles on <h1><span id="...">. We collect both so idsOnPage matches CSV and highlights.
   */
  function queryHeadingNodesWithIds() {
    var out = [];
    document.querySelectorAll("#quarto-content .quarto-title-block h1 span[id]").forEach(function (span) {
      out.push(span);
    });
    document.querySelectorAll("#quarto-content section[id]").forEach(function (sec) {
      if (
        sec.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6")
      ) {
        out.push(sec);
      }
    });
    return out;
  }

  function headingLabelText(node) {
    if (!node) {
      return "";
    }
    var clone = node.cloneNode(true);
    clone.querySelectorAll(".ct-badge-row, .ct-inline-row").forEach(function (el) {
      el.remove();
    });
    return (clone.textContent || "").trim().replace(/\s+/g, " ");
  }

  function targetHeadingForAnchorEl(anchorEl) {
    if (anchorEl.tagName === "SECTION") {
      return anchorEl.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
    }
    return anchorEl.closest("h1, h2, h3, h4, h5, h6") || anchorEl.parentElement;
  }

  /**
   * Maps canonical page URL path to the filename stem after yr-coverage--.
   * Example: /chapter1.html -> chapter1.html ; /part-a/chapter.html -> part-a--chapter.html
   */
  function pageUrlToFileSlug(pageUrl) {
    var p = (pageUrl || "/").replace(/^\/+/, "");
    return p.replace(/\//g, "--");
  }

  function coverageDataDirForSection(section, basePath) {
    if (section.coverageDataDir) {
      var d = section.coverageDataDir;
      if (!d.endsWith("/")) {
        d += "/";
      }
      return d;
    }
    return basePath + "coverage-data/" + section.id + "/";
  }

  /** Per-page CSV: .../coverage-data/<SECTION-ID>/yr-coverage--<page-slug>.csv */
  function coverageCsvUrlForPage(section, basePath, pageUrl) {
    var slug = pageUrlToFileSlug(pageUrl);
    return coverageDataDirForSection(section, basePath) + "yr-coverage--" + slug + ".csv";
  }

  function loadCoverageState(config, basePath) {
    var pageUrl = getCanonicalPageUrl();
    var state = { bySection: {}, rawBySection: {}, pageUrl: pageUrl };
    var tasks = (config.sections || []).map(function (section) {
      var csvUrl = coverageCsvUrlForPage(section, basePath, pageUrl);
      return fetchText(csvUrl)
        .then(function (text) {
          var parsed = parseCoverageCsv(text);
          state.bySection[section.id] = parsed.byUrl;
          state.rawBySection[section.id] = parsed.rawByUrl;
        })
        .catch(function (err) {
          console.warn("Coverage CSV missing or unreadable: " + csvUrl, err);
          state.bySection[section.id] = {};
          state.rawBySection[section.id] = {};
        });
    });
    return Promise.all(tasks).then(function () {
      return state;
    });
  }

  function clearCoverageStyles() {
    document.querySelectorAll(".ct-covered, .ct-covered-all, .ct-covered-some").forEach(function (el) {
      el.classList.remove("ct-covered", "ct-covered-all", "ct-covered-some");
      el.removeAttribute("data-ct-covered-by");
    });
    document.querySelectorAll(".ct-badge-row").forEach(function (el) {
      el.remove();
    });
  }

  function resolveCoverageSetForSection(sectionId, coverageState) {
    var pageMap = (coverageState.bySection && coverageState.bySection[sectionId]) || {};
    var candidates = getPathCandidates();
    var covered = new Set();
    candidates.forEach(function (pathKey) {
      var byId = pageMap[pathKey];
      if (!byId) {
        return;
      }
      Object.keys(byId).forEach(function (id) {
        if (byId[id]) {
          covered.add(id);
        } else {
          covered.delete(id);
        }
      });
    });
    return covered;
  }

  function coverageStateForCurrentPage(sectionId, coverageState) {
    var pageMap = (coverageState.bySection && coverageState.bySection[sectionId]) || {};
    var candidates = getPathCandidates();
    var merged = {};
    candidates.forEach(function (pathKey) {
      var byId = pageMap[pathKey];
      if (!byId) {
        return;
      }
      Object.keys(byId).forEach(function (id) {
        merged[id] = byId[id];
      });
    });
    return merged;
  }

  function coverageRawStateForCurrentPage(sectionId, coverageState) {
    var pageMap = (coverageState.rawBySection && coverageState.rawBySection[sectionId]) || {};
    var candidates = getPathCandidates();
    var merged = {};
    candidates.forEach(function (pathKey) {
      var byId = pageMap[pathKey];
      if (!byId) {
        return;
      }
      Object.keys(byId).forEach(function (id) {
        merged[id] = byId[id];
      });
    });
    return merged;
  }

  function applyStudentCoverage(sectionId, coverageState) {
    clearCoverageStyles();
    if (!sectionId) {
      return;
    }
    var covered = resolveCoverageSetForSection(sectionId, coverageState);
    covered.forEach(function (id) {
      var node = document.getElementById(id);
      if (node) {
        node.classList.add("ct-covered");
      }
    });
  }

  function sectionColorMap(config) {
    var map = {};
    (config.sections || []).forEach(function (s) {
      map[s.id] = s.color || "#666";
    });
    return map;
  }

  function getSectionLabel(config, sectionId) {
    var found = (config.sections || []).find(function (s) {
      return s.id === sectionId;
    });
    return found ? found.label || found.id : "";
  }

  function applyProfessorCoverage(sectionIds, config, coverageState) {
    clearCoverageStyles();
    if (!sectionIds.length) {
      return;
    }

    var selectedSets = {};
    sectionIds.forEach(function (id) {
      selectedSets[id] = resolveCoverageSetForSection(id, coverageState);
    });
    var colors = sectionColorMap(config);

    var coverageIndex = {};
    sectionIds.forEach(function (id) {
      selectedSets[id].forEach(function (sid) {
        if (!coverageIndex[sid]) {
          coverageIndex[sid] = [];
        }
        coverageIndex[sid].push(id);
      });
    });

    Object.keys(coverageIndex).forEach(function (sid) {
      var node = document.getElementById(sid);
      if (!node) {
        return;
      }

      var coveredBy = coverageIndex[sid];
      node.setAttribute("data-ct-covered-by", coveredBy.join(","));
      if (coveredBy.length === sectionIds.length) {
        node.classList.add("ct-covered-all");
      } else {
        node.classList.add("ct-covered-some");
      }

      var badgeRow = createElement("span", { class: "ct-badge-row", "aria-hidden": "true" });
      coveredBy.forEach(function (sectionId) {
        var badge = createElement("span", { class: "ct-badge" });
        badge.style.backgroundColor = colors[sectionId] || "#666";
        badge.title = sectionId;
        badgeRow.appendChild(badge);
      });
      node.appendChild(badgeRow);
    });
  }

  function createStudentOverlay(config, onApply) {
    var overlay = createElement("div", { class: "ct-overlay", id: "ct-overlay" });
    var panel = createElement("div", { class: "ct-panel", role: "dialog", "aria-modal": "true" });
    var title = createElement("h2", null, "Choose your class section");
    var body = createElement("p", null, "Pick your section to view coverage highlights.");
    var label = createElement("label", { for: "ct-student-select" }, "Class section");
    var select = createElement("select", { id: "ct-student-select" });
    var placeholder = createElement("option", { value: "" }, "-- Select a section --");
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    (config.sections || []).forEach(function (s) {
      select.appendChild(createElement("option", { value: s.id }, s.label || s.id));
    });

    var btn = createElement("button", { type: "button", id: "ct-student-apply" }, "Apply section");
    btn.disabled = true;
    select.addEventListener("change", function () {
      btn.disabled = !select.value;
    });
    btn.addEventListener("click", function () {
      if (!select.value) {
        return;
      }
      onApply(select.value);
      overlay.remove();
      document.body.classList.remove("ct-needs-selection");
    });

    panel.appendChild(title);
    panel.appendChild(body);
    panel.appendChild(label);
    panel.appendChild(select);
    panel.appendChild(btn);
    overlay.appendChild(panel);
    return overlay;
  }

  function createProfessorChooserPanel(config, selected, onApply) {
    var panel = createElement("div", { class: "ct-overlay", id: "ct-overlay" });
    var content = createElement("div", { class: "ct-panel" });
    content.appendChild(createElement("h2", null, "Professor mode"));
    content.appendChild(createElement("p", null, "Select zero or more sections to compare coverage."));
    content.appendChild(createElement("label", null, "Sections"));
    var checklist = createElement("div", { class: "ct-prof-checklist", id: "ct-prof-checklist" });

    (config.sections || []).forEach(function (s, index) {
      var row = createElement("label", { class: "ct-prof-check-item", for: "ct-prof-item-" + index });
      var checkbox = createElement("input", {
        type: "checkbox",
        id: "ct-prof-item-" + index,
        value: s.id
      });
      checkbox.checked = selected.indexOf(s.id) > -1;
      row.appendChild(checkbox);
      row.appendChild(createElement("span", null, s.label || s.id));
      checklist.appendChild(row);
    });

    function closePanel() {
      document.removeEventListener("keydown", onKeyDown);
      panel.remove();
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    }

    var btn = createElement("button", { type: "button" }, "Apply selection");
    btn.addEventListener("click", function () {
      var picked = Array.from(checklist.querySelectorAll("input[type='checkbox']:checked")).map(function (el) {
        return el.value;
      });
      onApply(picked);
      closePanel();
    });

    content.appendChild(checklist);
    content.appendChild(btn);
    panel.appendChild(content);
    document.addEventListener("keydown", onKeyDown);
    return panel;
  }

  function getPageSectionRows() {
    return queryHeadingNodesWithIds().map(function (node) {
      var heading = targetHeadingForAnchorEl(node);
      var text = headingLabelText(heading);
      return { id: node.id, label: text ? node.id + " - " + text : node.id };
    });
  }

  function clearInlineProfessorControls() {
    document.querySelectorAll(".ct-inline-row").forEach(function (el) {
      el.remove();
    });
  }

  function syncInlineCheckboxesFromState(coverageState, selectedSectionIds) {
    if (!selectedSectionIds || !selectedSectionIds.length) {
      return;
    }
    document.querySelectorAll(".ct-inline-checkbox").forEach(function (el) {
      var sid = el.getAttribute("data-section-id");
      var hid = el.getAttribute("data-html-id");
      var cov = coverageStateForCurrentPage(sid, coverageState);
      el.checked = cov[hid] === true;
    });
  }

  function mountInlineProfessorControls(config, selectedSectionIds, coverageState) {
    clearInlineProfessorControls();
    if (!selectedSectionIds.length) {
      return;
    }
    var colors = sectionColorMap(config);
    queryHeadingNodesWithIds().forEach(function (anchorEl) {
      var heading = targetHeadingForAnchorEl(anchorEl);
      if (!heading) {
        return;
      }
      var row = createElement("span", { class: "ct-inline-row" });
      selectedSectionIds.forEach(function (sectionId) {
        var cov = coverageStateForCurrentPage(sectionId, coverageState);
        var cb = createElement("input", {
          type: "checkbox",
          class: "ct-inline-checkbox",
          "data-section-id": sectionId,
          "data-html-id": anchorEl.id
        });
        cb.setAttribute(
          "aria-label",
          (getSectionLabel(config, sectionId) || sectionId) + " coverage for " + anchorEl.id
        );
        cb.checked = cov[anchorEl.id] === true;
        cb.style.accentColor = colors[sectionId] || "#666";
        var lab = createElement("label", { class: "ct-inline-cb-wrap" });
        lab.appendChild(cb);
        row.appendChild(lab);
      });
      heading.appendChild(row);
    });
  }

  function csvEscape(value) {
    if (value.indexOf(",") === -1 && value.indexOf('"') === -1 && value.indexOf("\n") === -1) {
      return value;
    }
    return '"' + value.replace(/"/g, '""') + '"';
  }

  function createProfessorEditorPanel(config, coverageState, initialSectionId, callbacks) {
    var panel = createElement("div", { class: "ct-overlay ct-floating-overlay", id: "ct-editor-overlay" });
    var content = createElement("div", { class: "ct-panel ct-editor-panel" });
    var titleBar = createElement("div", { class: "ct-editor-titlebar" });
    titleBar.appendChild(createElement("h2", null, "Edit page coverage CSV"));
    var closeXBtn = createElement("button", { type: "button", class: "ct-editor-close-x", "aria-label": "Close editor" }, "×");
    titleBar.appendChild(closeXBtn);
    content.appendChild(titleBar);
    content.appendChild(
      createElement(
        "p",
        null,
        "One row is shown per HTML id on this page. Each row has a tri-state checkbox: covered, explicit not-covered, or implicit not-covered (grey/italic and omitted from CSV output)."
      )
    );

    var url = getCanonicalPageUrl();
    content.appendChild(createElement("p", { class: "ct-small-note" }, "Current page URL: " + url));

    var sectionLabel = createElement("label", { for: "ct-editor-section" }, "Class section");
    var sectionSelect = createElement("select", { id: "ct-editor-section" });
    (config.sections || []).forEach(function (s) {
      var option = createElement("option", { value: s.id }, s.label || s.id);
      if (s.id === initialSectionId) {
        option.selected = true;
      }
      sectionSelect.appendChild(option);
    });

    var allRows = getPageSectionRows();
    var sectionColors = sectionColorMap(config);
    var editor = createElement("div", { class: "ct-editor-codewrap" });
    var gutter = createElement("div", { class: "ct-editor-gutter", "aria-hidden": "true" });
    var gutterInner = createElement("div", { class: "ct-editor-gutter-inner" });
    gutter.appendChild(gutterInner);
    var surface = createElement("div", { class: "ct-editor-surface" });
    var mirror = createElement("div", { class: "ct-editor-mirror", "aria-hidden": "true" });
    var textarea = createElement("textarea", {
      class: "ct-editor-textarea",
      spellcheck: "false",
      wrap: "off",
      rows: String(Math.max(8, Math.min(18, allRows.length + 1)))
    });
    surface.appendChild(mirror);
    surface.appendChild(textarea);
    editor.appendChild(gutter);
    editor.appendChild(surface);

    var rows = [];
    var previousEditorLines = [];
    var rowsById = {};
    var historyBySection = {};
    var restoringHistory = false;

    var toolbar = createElement("div", { class: "ct-editor-toolbar" });
    var setAllCoveredBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Set all covered");
    var setAllExplicitNotBtn = createElement(
      "button",
      { type: "button", class: "ct-btn-secondary" },
      "Set all explicit not-covered"
    );
    var setAllImplicitNotBtn = createElement(
      "button",
      { type: "button", class: "ct-btn-secondary" },
      "Set all implicit not-covered"
    );
    toolbar.appendChild(setAllCoveredBtn);
    toolbar.appendChild(setAllExplicitNotBtn);
    toolbar.appendChild(setAllImplicitNotBtn);
    var toolbar2 = createElement("div", { class: "ct-editor-toolbar" });
    var makeAllNotCoveredExplicitBtn = createElement(
      "button",
      { type: "button", class: "ct-btn-secondary" },
      "Make all not-covereds explicit"
    );
    var makeAllNotCoveredImplicitBtn = createElement(
      "button",
      { type: "button", class: "ct-btn-secondary" },
      "Make all not-covereds implicit"
    );
    toolbar2.appendChild(makeAllNotCoveredExplicitBtn);
    toolbar2.appendChild(makeAllNotCoveredImplicitBtn);
    var actions = createElement("div", { class: "ct-editor-toolbar" });
    var undoBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Undo");
    var redoBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Redo");
    var copyBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Copy CSV");
    var downloadBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Download CSV");
    actions.appendChild(undoBtn);
    actions.appendChild(redoBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(downloadBtn);

    function defaultLineForState(state, htmlId) {
      if (state === "covered") {
        return csvEscape(url) + "," + csvEscape(htmlId) + ",covered";
      }
      return csvEscape(url) + "," + csvEscape(htmlId) + ",not-covered";
    }

    function parseCsvLineState(rawLine) {
      var parts = (rawLine || "").split(",");
      if (parts.length < 2) {
        return { covered: false };
      }
      var state = (parts[2] || "").trim().toLowerCase();
      var covered = parts.length < 3 || state === "" || state === "covered";
      if (state === "not-covered") {
        covered = false;
      }
      return { covered: covered };
    }

    function currentSectionHistory() {
      var sectionId = sectionSelect.value;
      if (!historyBySection[sectionId]) {
        historyBySection[sectionId] = { stack: [], index: -1 };
      }
      return historyBySection[sectionId];
    }

    function snapshotRows() {
      return rows.map(function (row) {
        return { id: row.id, state: row.state, text: row.text };
      });
    }

    function snapshotsEqual(a, b) {
      if (!a || !b || a.length !== b.length) {
        return false;
      }
      for (var i = 0; i < a.length; i += 1) {
        if (a[i].id !== b[i].id || a[i].state !== b[i].state || a[i].text !== b[i].text) {
          return false;
        }
      }
      return true;
    }

    function updateUndoRedoButtons() {
      var h = currentSectionHistory();
      undoBtn.disabled = h.index <= 0;
      redoBtn.disabled = h.index < 0 || h.index >= h.stack.length - 1;
    }

    function pushHistorySnapshot() {
      if (restoringHistory) {
        return;
      }
      var h = currentSectionHistory();
      var snap = snapshotRows();
      if (h.index >= 0 && snapshotsEqual(h.stack[h.index], snap)) {
        updateUndoRedoButtons();
        return;
      }
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snap);
      h.index = h.stack.length - 1;
      updateUndoRedoButtons();
    }

    function ensureInitialHistorySnapshot() {
      var h = currentSectionHistory();
      if (h.index >= 0) {
        updateUndoRedoButtons();
        return;
      }
      h.stack.push(snapshotRows());
      h.index = 0;
      updateUndoRedoButtons();
    }

    function applyHistorySnapshot(snapshot) {
      restoringHistory = true;
      rows.forEach(function (row, idx) {
        var from = snapshot[idx];
        if (!from || from.id !== row.id) {
          return;
        }
        row.text = from.text;
        applyRowVisualState(row, from.state, false);
      });
      syncTextareaFromRows();
      refreshFromRows();
      restoringHistory = false;
    }

    function undoHistory() {
      var h = currentSectionHistory();
      if (h.index <= 0) {
        return;
      }
      h.index -= 1;
      applyHistorySnapshot(h.stack[h.index]);
      updateUndoRedoButtons();
    }

    function redoHistory() {
      var h = currentSectionHistory();
      if (h.index < 0 || h.index >= h.stack.length - 1) {
        return;
      }
      h.index += 1;
      applyHistorySnapshot(h.stack[h.index]);
      updateUndoRedoButtons();
    }

    function applyRowVisualState(row, state, updateText) {
      row.state = state;
      row.checkbox.checked = state === "covered";
      row.checkbox.indeterminate = state === "implicit";
      row.checkbox.classList.toggle("ct-inline-checkbox-implicit", state === "implicit");
      row.checkbox.setAttribute(
        "aria-label",
        row.label + " status: " + (state === "covered" ? "covered" : state === "explicit-not-covered" ? "explicit not covered" : "implicit not covered")
      );
      if (updateText) {
        row.text = defaultLineForState(state, row.id);
      }
    }

    function cycleRowState(row) {
      if (row.state === "implicit") {
        applyRowVisualState(row, "covered", true);
      } else if (row.state === "covered") {
        applyRowVisualState(row, "explicit-not-covered", true);
      } else {
        applyRowVisualState(row, "implicit", true);
      }
    }

    function renderMirror() {
      mirror.innerHTML = "";
      rows.forEach(function (row) {
        var line = createElement("div", { class: "ct-editor-mirror-line" });
        line.classList.toggle("ct-editor-mirror-line-implicit", row.state === "implicit");
        line.textContent = row.text;
        mirror.appendChild(line);
      });
    }

    function renderGutter() {
      gutterInner.innerHTML = "";
      rows.forEach(function (row, index) {
        var wrap = createElement("div", { class: "ct-editor-gutter-line" });
        row.checkbox.id = "ct-editor-row-" + index;
        wrap.appendChild(row.checkbox);
        gutterInner.appendChild(wrap);
      });
    }

    function syncTextareaFromRows() {
      previousEditorLines = rows.map(function (row) {
        return row.text;
      });
      textarea.value = previousEditorLines.join("\n");
      renderMirror();
      renderGutter();
    }

    function syncSurfaceScroll() {
      mirror.style.transform = "translate(" + -textarea.scrollLeft + "px," + -textarea.scrollTop + "px)";
      gutterInner.style.transform = "translateY(" + -textarea.scrollTop + "px)";
    }

    function lineIndexAtCursor() {
      var pos = textarea.selectionStart || 0;
      var value = textarea.value || "";
      var before = value.slice(0, pos);
      var lines = before.split("\n").length - 1;
      if (lines < 0) {
        return 0;
      }
      if (lines > rows.length - 1) {
        return rows.length - 1;
      }
      return lines;
    }

    function updateRowsFromTextarea() {
      var editedIdx = lineIndexAtCursor();
      var incoming = textarea.value.split(/\r?\n/);
      var lines = incoming.slice();
      var normalized = false;

      function commonPrefixLength(a, b) {
        var i = 0;
        var max = Math.min(a.length, b.length);
        while (i < max && a[i] === b[i]) {
          i += 1;
        }
        return i;
      }

      function commonSuffixLength(a, b, prefix) {
        var i = 0;
        while (a.length - 1 - i >= prefix && b.length - 1 - i >= prefix && a[a.length - 1 - i] === b[b.length - 1 - i]) {
          i += 1;
        }
        return i;
      }

      if (lines.length !== rows.length) {
        var prev = previousEditorLines.slice();
        var prefix = commonPrefixLength(lines, prev);
        var suffix = commonSuffixLength(lines, prev, prefix);

        if (lines.length < rows.length) {
          // Preserve row identity: deleted rows become blank slots at change boundary.
          var missing = rows.length - lines.length;
          var head = lines.slice(0, prefix);
          var middle = lines.slice(prefix, lines.length - suffix);
          var tail = lines.slice(lines.length - suffix);
          lines = head.concat(new Array(missing).fill(""), middle, tail);
          normalized = true;
        } else if (lines.length > rows.length) {
          // Prevent creating new row identities; absorb extra lines near edit site.
          var extra = lines.length - rows.length;
          var dropFrom = Math.max(prefix, Math.min(editedIdx, lines.length - extra));
          lines.splice(dropFrom, extra);
          normalized = true;
        }
      }

      while (lines.length < rows.length) {
        lines.push("");
        normalized = true;
      }
      if (lines.length > rows.length) {
        lines = lines.slice(0, rows.length);
        normalized = true;
      }
      if (normalized) {
        textarea.value = lines.join("\n");
      }

      rows.forEach(function (row, index) {
        var next = lines[index];
        var defaultImplicit = defaultLineForState("implicit", row.id);
        if ((next || "").trim() === "") {
          applyRowVisualState(row, "implicit", false);
          row.text = defaultImplicit;
          return;
        }
        if (row.state === "implicit" && (index === editedIdx || next !== defaultImplicit)) {
          applyRowVisualState(row, "explicit-not-covered", false);
        }
        row.text = next;
        if (row.state !== "implicit") {
          var parsed = parseCsvLineState(row.text);
          applyRowVisualState(row, parsed.covered ? "covered" : "explicit-not-covered", false);
        }
      });
      previousEditorLines = lines.slice();
      renderMirror();
      renderGutter();
    }

    function persistRowsToCoverage(sectionId) {
      rows.forEach(function (row) {
        var id = row.id;
        if (row.state === "implicit") {
          setPageCoverageForSection(coverageState, sectionId, url, id, false, false);
          return;
        }
        var raw = (row.text || "").trim();
        var parsed = parseCsvLineState(raw);
        setPageCoverageForSection(coverageState, sectionId, url, id, parsed.covered, true, raw || defaultLineForState(row.state, id));
      });
    }

    function buildCsvForExport() {
      var lines = ["URL,html-id,covered"];
      rows.forEach(function (row) {
        if (row.state === "implicit") {
          return;
        }
        lines.push((row.text || "").trim() || defaultLineForState(row.state, row.id));
      });
      return lines.join("\n");
    }

    function refreshFromRows() {
      var selectedSectionId = sectionSelect.value;
      persistRowsToCoverage(selectedSectionId);
      callbacks.applyHighlights();
      syncInlineCheckboxesFromState(coverageState, callbacks.getSelectedProfSections());
      localStorage.setItem(STORAGE_KEY_PROF_EDITOR_SECTION, selectedSectionId);
    }

    function renderRows() {
      rows = [];
      rowsById = {};
      var selectedSectionId = sectionSelect.value;
      var selectedSectionColor = sectionColors[selectedSectionId] || "#2f6feb";
      var pageCoverage = coverageStateForCurrentPage(selectedSectionId, coverageState);
      var pageRaw = coverageRawStateForCurrentPage(selectedSectionId, coverageState);

      allRows.forEach(function (row) {
        var exists = Object.prototype.hasOwnProperty.call(pageCoverage, row.id);
        var state = exists ? (pageCoverage[row.id] ? "covered" : "explicit-not-covered") : "implicit";
        var checkbox = createElement("input", {
          type: "checkbox",
          class: "ct-editor-gutter-checkbox",
          "data-html-id": row.id
        });
        checkbox.style.accentColor = selectedSectionColor;

        var rowModel = {
          id: row.id,
          label: row.label,
          checkbox: checkbox,
          text: exists ? pageRaw[row.id] || defaultLineForState(state, row.id) : defaultLineForState(state, row.id),
          state: "implicit"
        };
        rowsById[row.id] = rowModel;
        rows.push(rowModel);
        applyRowVisualState(rowModel, state, false);

        checkbox.addEventListener("click", function (evt) {
          evt.stopPropagation();
          cycleRowState(rowModel);
          syncTextareaFromRows();
          refreshFromRows();
          pushHistorySnapshot();
        });
      });
      syncTextareaFromRows();
      syncSurfaceScroll();
      ensureInitialHistorySnapshot();
    }

    function onExternalCoverageChange() {
      renderRows();
      refreshFromRows();
    }
    document.addEventListener("ct-coverage-changed", onExternalCoverageChange);

    setAllCoveredBtn.addEventListener("click", function () {
      rows.forEach(function (row) {
        applyRowVisualState(row, "covered", true);
      });
      syncTextareaFromRows();
      refreshFromRows();
      pushHistorySnapshot();
    });
    setAllExplicitNotBtn.addEventListener("click", function () {
      rows.forEach(function (row) {
        applyRowVisualState(row, "explicit-not-covered", true);
      });
      syncTextareaFromRows();
      refreshFromRows();
      pushHistorySnapshot();
    });
    setAllImplicitNotBtn.addEventListener("click", function () {
      rows.forEach(function (row) {
        applyRowVisualState(row, "implicit", true);
      });
      syncTextareaFromRows();
      refreshFromRows();
      pushHistorySnapshot();
    });
    makeAllNotCoveredExplicitBtn.addEventListener("click", function () {
      rows.forEach(function (row) {
        if (row.state === "implicit" || row.state === "explicit-not-covered") {
          applyRowVisualState(row, "explicit-not-covered", true);
        }
      });
      syncTextareaFromRows();
      refreshFromRows();
      pushHistorySnapshot();
    });
    makeAllNotCoveredImplicitBtn.addEventListener("click", function () {
      rows.forEach(function (row) {
        if (row.state === "implicit" || row.state === "explicit-not-covered") {
          applyRowVisualState(row, "implicit", true);
        }
      });
      syncTextareaFromRows();
      refreshFromRows();
      pushHistorySnapshot();
    });
    sectionSelect.addEventListener("change", function () {
      renderRows();
      refreshFromRows();
    });
    function handleUndoRedoHotkey(evt) {
      var isMod = evt.ctrlKey || evt.metaKey;
      if (isMod && !evt.altKey && !evt.shiftKey && (evt.key === "z" || evt.key === "Z")) {
        evt.preventDefault();
        undoHistory();
        return;
      }
      if (isMod && !evt.altKey && !evt.shiftKey && (evt.key === "y" || evt.key === "Y")) {
        evt.preventDefault();
        redoHistory();
        return;
      }
      if (isMod && !evt.altKey && evt.shiftKey && (evt.key === "z" || evt.key === "Z")) {
        evt.preventDefault();
        redoHistory();
        return;
      }
    }
    textarea.addEventListener("keydown", function (evt) {
      handleUndoRedoHotkey(evt);
      if (evt.key === "Enter") {
        evt.preventDefault();
      }
    });
    document.addEventListener("keydown", handleUndoRedoHotkey);
    textarea.addEventListener("input", function () {
      updateRowsFromTextarea();
      refreshFromRows();
      pushHistorySnapshot();
    });
    textarea.addEventListener("scroll", syncSurfaceScroll);
    undoBtn.addEventListener("click", undoHistory);
    redoBtn.addEventListener("click", redoHistory);

    copyBtn.addEventListener("click", function () {
      var csvText = buildCsvForExport();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(csvText);
      } else {
        var temp = createElement("textarea", { style: "position:fixed;left:-9999px;top:-9999px;" });
        temp.value = csvText;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        temp.remove();
      }
    });

    downloadBtn.addEventListener("click", function () {
      var blob = new Blob([buildCsvForExport() + "\n"], { type: "text/csv;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "yr-coverage--" + pageUrlToFileSlug(url) + ".csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    });

    var drag = { active: false, startX: 0, startY: 0, left: 0, top: 0 };
    function onDragMove(evt) {
      if (!drag.active) {
        return;
      }
      var nextLeft = drag.left + (evt.clientX - drag.startX);
      var nextTop = drag.top + (evt.clientY - drag.startY);
      var maxLeft = Math.max(8, window.innerWidth - content.offsetWidth - 8);
      var maxTop = Math.max(8, window.innerHeight - content.offsetHeight - 8);
      content.style.left = Math.min(maxLeft, Math.max(8, nextLeft)) + "px";
      content.style.top = Math.min(maxTop, Math.max(8, nextTop)) + "px";
    }
    function onDragUp() {
      if (!drag.active) {
        return;
      }
      drag.active = false;
      document.body.classList.remove("ct-editor-dragging");
    }
    function onTitleBarDown(evt) {
      drag.active = true;
      drag.startX = evt.clientX;
      drag.startY = evt.clientY;
      drag.left = parseInt(content.style.left || "120", 10);
      drag.top = parseInt(content.style.top || "90", 10);
      document.body.classList.add("ct-editor-dragging");
      evt.preventDefault();
    }

    function closeEditorPanel() {
      persistRowsToCoverage(sectionSelect.value);
      callbacks.applyHighlights();
      syncInlineCheckboxesFromState(coverageState, callbacks.getSelectedProfSections());
      document.removeEventListener("ct-coverage-changed", onExternalCoverageChange);
      document.removeEventListener("keydown", handleUndoRedoHotkey);
      titleBar.removeEventListener("mousedown", onTitleBarDown);
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragUp);
      document.body.classList.remove("ct-editor-dragging");
      panel.remove();
    }
    closeXBtn.addEventListener("click", closeEditorPanel);

    content.appendChild(sectionLabel);
    content.appendChild(sectionSelect);
    content.appendChild(toolbar);
    content.appendChild(toolbar2);
    content.appendChild(editor);
    content.appendChild(actions);
    panel.appendChild(content);

    // Drag by title bar; keep within viewport bounds.
    content.style.position = "fixed";
    content.style.left = "120px";
    content.style.top = "90px";
    titleBar.addEventListener("mousedown", onTitleBarDown);
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragUp);

    renderRows();
    refreshFromRows();
    return panel;
  }

  function createStudentControls(onChangeSection, buttonText) {
    var item = createElement("li", { class: "sidebar-item ct-sidebar-item" });
    var container = createElement("div", { class: "sidebar-item-container" });
    var link = createElement("a", { href: "#", class: "sidebar-item-text sidebar-link ct-change-section-link" }, "");
    link.appendChild(createElement("span", { class: "menu-text" }, buttonText || "change class section"));
    link.addEventListener("click", function (evt) {
      evt.preventDefault();
      onChangeSection();
    });
    container.appendChild(link);
    item.appendChild(container);
    return item;
  }

  function createProfessorControlItem(labelText, color, onClick) {
    var item = createElement("li", { class: "sidebar-item ct-prof-sidebar-item" });
    var container = createElement("div", { class: "sidebar-item-container" });
    var link = createElement("a", { href: "#", class: "sidebar-item-text sidebar-link ct-prof-section-link" }, "");
    var text = createElement("span", { class: "menu-text" }, labelText);
    if (color) {
      text.style.backgroundColor = color;
      text.style.color = "#fff";
    }
    link.appendChild(text);
    link.addEventListener("click", function (evt) {
      evt.preventDefault();
      onClick();
    });
    container.appendChild(link);
    item.appendChild(container);
    return item;
  }

  function getSidebarMenuList() {
    return (
      document.querySelector("#quarto-sidebar .sidebar-menu-container > ul") ||
      document.querySelector("#quarto-sidebar ul.list-unstyled.mt-1") ||
      document.querySelector("#quarto-sidebar ul.list-unstyled")
    );
  }

  function clearProfessorControls() {
    document.querySelectorAll(".ct-prof-sidebar-item").forEach(function (el) {
      el.remove();
    });
  }

  function clearStudentControls() {
    document.querySelectorAll(".ct-sidebar-item").forEach(function (el) {
      el.remove();
    });
  }

  function preserveProfessorParamInLinks() {
    if (!isProfessorMode()) {
      return;
    }
    var profValue = professorQueryValue();
    document.querySelectorAll("a[href]").forEach(function (link) {
      var rawHref = link.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) {
        return;
      }
      if (rawHref.startsWith("mailto:") || rawHref.startsWith("tel:") || rawHref.startsWith("javascript:")) {
        return;
      }

      var url;
      try {
        url = new URL(rawHref, window.location.href);
      } catch (_err) {
        return;
      }
      if (url.origin !== window.location.origin || url.searchParams.has("prof")) {
        return;
      }
      url.searchParams.set("prof", profValue === null ? "" : profValue);
      link.setAttribute("href", url.pathname + (url.search || "") + (url.hash || ""));
    });
  }

  function mountProfessorControls(config, selectedSectionIds, openChooser, openEditor) {
    clearProfessorControls();
    var sidebarMenu = getSidebarMenuList();
    if (!sidebarMenu) {
      return;
    }

    if (!selectedSectionIds.length) {
      sidebarMenu.prepend(createProfessorControlItem("Choose section(s)", "", openChooser));
    } else {
      var colors = sectionColorMap(config);
      selectedSectionIds
        .slice()
        .reverse()
        .forEach(function (sectionId) {
          var label = getSectionLabel(config, sectionId) || sectionId;
          sidebarMenu.prepend(createProfessorControlItem(label, colors[sectionId] || "", openChooser));
        });
    }
    sidebarMenu.prepend(createProfessorControlItem("Edit page coverage CSV", "", openEditor));
  }

  function mountStudentControls(controlElement) {
    if (document.querySelector(".ct-sidebar-item")) {
      return;
    }
    var sidebarMenu = getSidebarMenuList();
    if (sidebarMenu) {
      sidebarMenu.prepend(controlElement);
      return;
    }
    document.body.appendChild(controlElement);
  }

  function mountStudentChangeControl(config, selectedSectionId) {
    var label = getSectionLabel(config, selectedSectionId);
    var controls = createStudentControls(function () {
      getStudentStorage().removeItem(STORAGE_KEY_STUDENT);
      window.location.reload();
    }, label || "change class section");
    mountStudentControls(controls);
  }

  function init(config, coverageState) {
    if (isProfessorMode()) {
      preserveProfessorParamInLinks();
      clearStudentControls();

      var selected = [];
      var stored = localStorage.getItem(STORAGE_KEY_PROF);
      if (stored) {
        try {
          selected = JSON.parse(stored);
        } catch (_err) {
          selected = [];
        }
      }

      function openChooser() {
        var existing = document.getElementById("ct-overlay");
        if (existing) {
          existing.remove();
        }
        var panel = createProfessorChooserPanel(config, selected, function (ids) {
          selected = ids;
          localStorage.setItem(STORAGE_KEY_PROF, JSON.stringify(ids));
          mountInlineProfessorControls(config, ids, coverageState);
          applyProfessorCoverage(ids, config, coverageState);
          mountProfessorControls(config, ids, openChooser, openEditor);
        });
        document.body.appendChild(panel);
      }

      function openEditor() {
        var existing = document.getElementById("ct-editor-overlay");
        if (existing) {
          existing.remove();
        }
        var sections = config.sections || [];
        if (!sections.length) {
          showTrackerLoadError("Professor editor unavailable: no sections are defined in coverage-config.json.");
          return;
        }
        var initial = localStorage.getItem(STORAGE_KEY_PROF_EDITOR_SECTION) || selected[0] || sections[0].id;
        var panel = createProfessorEditorPanel(config, coverageState, initial, {
          applyHighlights: function () {
            applyProfessorCoverage(selected, config, coverageState);
          },
          getSelectedProfSections: function () {
            return selected;
          }
        });
        document.body.appendChild(panel);
      }

      function onInlineCheckboxChange(evt) {
        var el = evt.target;
        if (!el.classList.contains("ct-inline-checkbox")) {
          return;
        }
        var sectionId = el.getAttribute("data-section-id");
        var htmlId = el.getAttribute("data-html-id");
        var pageUrl = getCanonicalPageUrl();
        setPageCoverageForSection(coverageState, sectionId, pageUrl, htmlId, el.checked);
        applyProfessorCoverage(selected, config, coverageState);
        document.dispatchEvent(new CustomEvent("ct-coverage-changed"));
      }
      document.body.addEventListener("change", onInlineCheckboxChange);

      mountInlineProfessorControls(config, selected, coverageState);
      applyProfessorCoverage(selected, config, coverageState);
      mountProfessorControls(config, selected, openChooser, openEditor);
      return;
    }

    clearProfessorControls();
    if (shouldResetStudentSelection()) {
      getStudentStorage().removeItem(STORAGE_KEY_STUDENT);
      localStorage.removeItem(STORAGE_KEY_STUDENT);
    }

    var studentSection = getStudentStorage().getItem(STORAGE_KEY_STUDENT) || "";
    if (!studentSection) {
      document.body.classList.add("ct-needs-selection");
      var overlay = createStudentOverlay(config, function (sectionId) {
        getStudentStorage().setItem(STORAGE_KEY_STUDENT, sectionId);
        applyStudentCoverage(sectionId, coverageState);
        mountStudentChangeControl(config, sectionId);
      });
      document.body.appendChild(overlay);
    } else {
      applyStudentCoverage(studentSection, coverageState);
      mountStudentChangeControl(config, studentSection);
    }
  }

  function boot() {
    var basePath = getTrackerBasePath();
    fetchJson(basePath + "coverage-config.json")
      .then(function (config) {
        return loadCoverageState(config, basePath).then(function (coverageState) {
          return { config: config, coverageState: coverageState };
        });
      })
      .then(function (loaded) {
        init(loaded.config, loaded.coverageState);
      })
      .catch(function (err) {
        console.error("Coverage tracker initialization failed", err);
        showTrackerLoadError("Could not load coverage files from " + basePath);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
