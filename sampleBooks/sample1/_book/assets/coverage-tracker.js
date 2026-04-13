(function () {
  "use strict";

  var STORAGE_KEY_STUDENT = "ct_selected_section";
  var STORAGE_KEY_PROF = "ct_selected_sections";

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

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function isProfessorMode() {
    return getQueryParam("prof") === "true";
  }

  function shouldResetStudentSelection() {
    return getQueryParam("resetSection") === "true";
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

  function clearCoverageStyles() {
    document.querySelectorAll(".ct-covered, .ct-covered-all, .ct-covered-some").forEach(function (el) {
      el.classList.remove("ct-covered", "ct-covered-all", "ct-covered-some");
      el.removeAttribute("data-ct-covered-by");
    });
    document.querySelectorAll(".ct-badge-row").forEach(function (el) {
      el.remove();
    });
  }

  function resolveCoverageSetForSection(sectionId, data) {
    var coverageByPage = (data.coverage && data.coverage[sectionId]) || {};
    var candidates = getPathCandidates();
    var ids = [];

    candidates.forEach(function (pathKey) {
      var found = coverageByPage[pathKey];
      if (Array.isArray(found)) {
        ids = ids.concat(found);
      }
    });

    return new Set(ids);
  }

  function applyStudentCoverage(sectionId, data) {
    clearCoverageStyles();
    if (!sectionId) {
      return;
    }
    var covered = resolveCoverageSetForSection(sectionId, data);
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

  function applyProfessorCoverage(sectionIds, config, data) {
    clearCoverageStyles();
    if (!sectionIds.length) {
      return;
    }

    var selectedSets = {};
    sectionIds.forEach(function (id) {
      selectedSets[id] = resolveCoverageSetForSection(id, data);
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

  function createStudentOverlay(config, initialSection, onApply) {
    var overlay = createElement("div", { class: "ct-overlay", id: "ct-overlay" });
    var panel = createElement("div", { class: "ct-panel", role: "dialog", "aria-modal": "true" });
    var title = createElement("h2", null, "Choose your class section");
    var body = createElement("p", null, "Pick your section to view coverage highlights.");
    var label = createElement("label", { for: "ct-student-select" }, "Class section");
    var select = createElement("select", { id: "ct-student-select" });
    var placeholder = createElement("option", { value: "" }, "-- Select a section --");

    placeholder.disabled = true;
    placeholder.selected = !initialSection;
    select.appendChild(placeholder);

    (config.sections || []).forEach(function (s) {
      var opt = createElement("option", { value: s.id }, s.label || s.id);
      if (initialSection && s.id === initialSection) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    var btn = createElement("button", { type: "button", id: "ct-student-apply" }, "Apply section");
    btn.disabled = !initialSection;

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

  function createProfessorPanel(config, selected, onApply) {
    var panel = createElement("div", { class: "ct-overlay", id: "ct-overlay" });
    var content = createElement("div", { class: "ct-panel" });
    var title = createElement("h2", null, "Professor mode");
    var body = createElement("p", null, "Select one or more sections to compare coverage.");
    var label = createElement("label", { for: "ct-prof-select" }, "Sections");
    var select = createElement("select", { id: "ct-prof-select", multiple: "multiple", size: "6" });

    (config.sections || []).forEach(function (s) {
      var opt = createElement("option", { value: s.id }, s.label || s.id);
      if (selected.indexOf(s.id) > -1) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    var btn = createElement("button", { type: "button" }, "Apply selection");
    btn.addEventListener("click", function () {
      var picked = Array.from(select.selectedOptions).map(function (o) {
        return o.value;
      });
      onApply(picked);
    });

    content.appendChild(title);
    content.appendChild(body);
    content.appendChild(label);
    content.appendChild(select);
    content.appendChild(btn);
    panel.appendChild(content);
    return panel;
  }

  function createStudentControls(onChangeSection) {
    var controls = createElement("div", { class: "ct-student-controls" });
    var button = createElement("button", { type: "button", class: "ct-change-section-btn" }, "Change section");
    button.addEventListener("click", function () {
      onChangeSection();
    });
    controls.appendChild(button);
    return controls;
  }

  function init(config, data) {
    var profMode = isProfessorMode();
    if (profMode) {
      var stored = localStorage.getItem(STORAGE_KEY_PROF);
      var selected = [];
      if (stored) {
        try {
          selected = JSON.parse(stored);
        } catch (_err) {
          selected = [];
        }
      }
      applyProfessorCoverage(selected, config, data);
      var panel = createProfessorPanel(config, selected, function (ids) {
        localStorage.setItem(STORAGE_KEY_PROF, JSON.stringify(ids));
        applyProfessorCoverage(ids, config, data);
      });
      document.body.appendChild(panel);
      return;
    }

    if (shouldResetStudentSelection()) {
      localStorage.removeItem(STORAGE_KEY_STUDENT);
    }

    var studentSection = localStorage.getItem(STORAGE_KEY_STUDENT) || "";
    if (!studentSection) {
      document.body.classList.add("ct-needs-selection");
      var overlay = createStudentOverlay(config, "", function (sectionId) {
        localStorage.setItem(STORAGE_KEY_STUDENT, sectionId);
        applyStudentCoverage(sectionId, data);
      });
      document.body.appendChild(overlay);
    } else {
      applyStudentCoverage(studentSection, data);
      var controls = createStudentControls(function () {
        localStorage.removeItem(STORAGE_KEY_STUDENT);
        window.location.reload();
      });
      document.body.appendChild(controls);
    }
  }

  function boot() {
    Promise.all([
      fetchJson("assets/coverage-config.json"),
      fetchJson("assets/coverage-data.json")
    ])
      .then(function (loaded) {
        init(loaded[0], loaded[1]);
      })
      .catch(function (err) {
        console.error("Coverage tracker initialization failed", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
