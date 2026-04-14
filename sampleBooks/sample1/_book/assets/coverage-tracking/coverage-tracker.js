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

      // Default behavior:
      // - missing 3rd column or empty 3rd column -> covered
      // - "covered" -> covered
      // - "not-covered" -> not covered
      var isCovered = parts.length < 3 || state === "" || state === "covered";
      if (state === "not-covered") {
        isCovered = false;
      }
      byUrl[url][htmlId] = isCovered;
    });
    return byUrl;
  }

  function coverageCsvPathForSection(section, basePath) {
    if (section.coverageCsv) {
      return section.coverageCsv;
    }
    return basePath + "coverage-data/" + section.id + ".csv";
  }

  function loadCoverageState(config, basePath) {
    var state = { bySection: {}, csvPathBySection: {} };
    var tasks = (config.sections || []).map(function (section) {
      var csvPath = coverageCsvPathForSection(section, basePath);
      state.csvPathBySection[section.id] = csvPath;
      return fetchText(csvPath)
        .then(function (text) {
          state.bySection[section.id] = parseCoverageCsv(text);
        })
        .catch(function (err) {
          console.warn("Coverage CSV missing or unreadable for section " + section.id, err);
          state.bySection[section.id] = {};
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
    return Array.from(document.querySelectorAll("#quarto-content h1[id], #quarto-content h2[id], #quarto-content h3[id], #quarto-content h4[id], #quarto-content h5[id], #quarto-content h6[id]")).map(
      function (node) {
        var text = (node.textContent || "").trim().replace(/\s+/g, " ");
        return { id: node.id, label: text ? node.id + " - " + text : node.id };
      }
    );
  }

  function csvEscape(value) {
    if (value.indexOf(",") === -1 && value.indexOf('"') === -1 && value.indexOf("\n") === -1) {
      return value;
    }
    return '"' + value.replace(/"/g, '""') + '"';
  }

  function buildCoverageCsvForPage(url, sectionIds, checkedMap, compact) {
    var lines = ["URL,html-id,covered"];
    sectionIds.forEach(function (id) {
      var checked = !!checkedMap[id];
      if (compact && !checked) {
        return;
      }
      lines.push(csvEscape(url) + "," + csvEscape(id) + "," + (checked ? "covered" : "not-covered"));
    });
    return lines.join("\n");
  }

  function createProfessorEditorPanel(config, coverageState, initialSectionId) {
    var panel = createElement("div", { class: "ct-overlay", id: "ct-editor-overlay" });
    var content = createElement("div", { class: "ct-panel ct-editor-panel" });
    content.appendChild(createElement("h2", null, "Edit page coverage CSV"));
    content.appendChild(
      createElement(
        "p",
        null,
        "Select a class section, mark coverage for this page, then copy or download the CSV output."
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
    var list = createElement("div", { class: "ct-prof-checklist ct-editor-checklist" });

    var compactRow = createElement("label", { class: "ct-prof-check-item" });
    var compactCheckbox = createElement("input", { type: "checkbox", id: "ct-editor-compact" });
    compactRow.appendChild(compactCheckbox);
    compactRow.appendChild(createElement("span", null, "Compact output (omit not-covered rows)"));

    var toolbar = createElement("div", { class: "ct-editor-toolbar" });
    var selectAllBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Select all on page");
    var clearAllBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Clear all on page");
    var buildBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Build CSV");
    toolbar.appendChild(selectAllBtn);
    toolbar.appendChild(clearAllBtn);
    toolbar.appendChild(buildBtn);

    var output = createElement("textarea", {
      id: "ct-editor-output",
      rows: "10",
      class: "ct-editor-output",
      placeholder: "CSV output will appear here..."
    });
    var actions = createElement("div", { class: "ct-editor-toolbar" });
    var copyBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Copy CSV");
    var downloadBtn = createElement("button", { type: "button", class: "ct-btn-secondary" }, "Download CSV");
    var closeBtn = createElement("button", { type: "button" }, "Close");
    actions.appendChild(copyBtn);
    actions.appendChild(downloadBtn);
    actions.appendChild(closeBtn);

    function renderCheckboxes() {
      list.innerHTML = "";
      var selectedSectionId = sectionSelect.value;
      var pageCoverage = coverageStateForCurrentPage(selectedSectionId, coverageState);
      allRows.forEach(function (row, index) {
        var item = createElement("label", { class: "ct-prof-check-item", for: "ct-editor-row-" + index });
        var checkbox = createElement("input", {
          type: "checkbox",
          id: "ct-editor-row-" + index,
          "data-html-id": row.id
        });
        checkbox.checked = pageCoverage[row.id] === true;
        item.appendChild(checkbox);
        item.appendChild(createElement("span", null, row.label));
        list.appendChild(item);
      });
    }

    function setAllCheckboxes(value) {
      list.querySelectorAll("input[type='checkbox']").forEach(function (el) {
        el.checked = value;
      });
    }

    function buildCsv() {
      var selectedSectionId = sectionSelect.value;
      var checkedMap = {};
      var sectionIds = [];
      list.querySelectorAll("input[type='checkbox']").forEach(function (el) {
        var id = el.getAttribute("data-html-id");
        sectionIds.push(id);
        checkedMap[id] = el.checked;
      });
      output.value = buildCoverageCsvForPage(url, sectionIds, checkedMap, compactCheckbox.checked);
      localStorage.setItem(STORAGE_KEY_PROF_EDITOR_SECTION, selectedSectionId);
    }

    selectAllBtn.addEventListener("click", function () {
      setAllCheckboxes(true);
      buildCsv();
    });
    clearAllBtn.addEventListener("click", function () {
      setAllCheckboxes(false);
      buildCsv();
    });
    buildBtn.addEventListener("click", buildCsv);
    compactCheckbox.addEventListener("change", buildCsv);
    sectionSelect.addEventListener("change", function () {
      renderCheckboxes();
      buildCsv();
    });

    copyBtn.addEventListener("click", function () {
      if (!output.value) {
        buildCsv();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(output.value);
      } else {
        output.select();
        document.execCommand("copy");
      }
    });

    downloadBtn.addEventListener("click", function () {
      if (!output.value) {
        buildCsv();
      }
      var selectedSectionId = sectionSelect.value;
      var blob = new Blob([output.value + "\n"], { type: "text/csv;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = selectedSectionId + "-page-coverage.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    });

    closeBtn.addEventListener("click", function () {
      panel.remove();
    });

    content.appendChild(sectionLabel);
    content.appendChild(sectionSelect);
    content.appendChild(compactRow);
    content.appendChild(toolbar);
    content.appendChild(list);
    content.appendChild(output);
    content.appendChild(actions);
    panel.appendChild(content);

    renderCheckboxes();
    buildCsv();
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
        var initial = localStorage.getItem(STORAGE_KEY_PROF_EDITOR_SECTION) || selected[0] || config.sections[0].id;
        var panel = createProfessorEditorPanel(config, coverageState, initial);
        document.body.appendChild(panel);
      }

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
