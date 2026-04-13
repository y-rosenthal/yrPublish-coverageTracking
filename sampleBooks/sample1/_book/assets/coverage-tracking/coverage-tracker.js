(function () {
  "use strict";

  var STORAGE_KEY_STUDENT = "ct_selected_section";
  var STORAGE_KEY_PROF = "ct_selected_sections";

  function getStudentStorage() {
    // Session storage makes section choice tab/session scoped.
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

  function getTrackerBasePath() {
    var script =
      document.currentScript ||
      document.querySelector("script[src*='coverage-tracking/coverage-tracker.js']") ||
      document.querySelector("script[src$='coverage-tracker.js']");
    if (!script) {
      return "assets/coverage-tracking/";
    }
    var src = script.getAttribute("src") || "";
    // Keep this path relative so it works on localhost and GitHub Pages subpaths.
    return src.replace(/coverage-tracker\.js(\?.*)?$/, "");
  }

  function showTrackerLoadError(message) {
    var existing = document.getElementById("ct-load-error");
    if (existing) {
      return;
    }
    var panel = createElement("div", { id: "ct-load-error", class: "ct-overlay" });
    var content = createElement("div", { class: "ct-panel", role: "alert" });
    content.appendChild(createElement("h2", null, "Coverage tracker failed to load"));
    content.appendChild(
      createElement(
        "p",
        null,
        message || "Could not load coverage files. Refresh the page or check asset paths."
      )
    );
    panel.appendChild(content);
    document.body.appendChild(panel);
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

  function getSectionLabel(config, sectionId) {
    var found = (config.sections || []).find(function (s) {
      return s.id === sectionId;
    });
    if (!found) {
      return "";
    }
    return found.label || found.id;
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
    var label = createElement("label", null, "Sections");
    var checklist = createElement("div", { class: "ct-prof-checklist", id: "ct-prof-checklist" });

    (config.sections || []).forEach(function (s, index) {
      var row = createElement("label", { class: "ct-prof-check-item", for: "ct-prof-item-" + index });
      var checkbox = createElement("input", {
        type: "checkbox",
        id: "ct-prof-item-" + index,
        value: s.id
      });
      checkbox.checked = selected.indexOf(s.id) > -1;
      var text = createElement("span", null, s.label || s.id);
      row.appendChild(checkbox);
      row.appendChild(text);
      checklist.appendChild(row);
    });

    var btn = createElement("button", { type: "button" }, "Apply selection");
    btn.addEventListener("click", function () {
      var picked = Array.from(checklist.querySelectorAll("input[type='checkbox']:checked")).map(function (el) {
        return el.value;
      });
      onApply(picked);
      panel.remove();
    });

    content.appendChild(title);
    content.appendChild(body);
    content.appendChild(label);
    content.appendChild(checklist);
    content.appendChild(btn);
    panel.appendChild(content);
    return panel;
  }

  function createStudentControls(onChangeSection, buttonText) {
    var item = createElement("li", { class: "sidebar-item ct-sidebar-item" });
    var container = createElement("div", { class: "sidebar-item-container" });
    var link = createElement(
      "a",
      { href: "#", class: "sidebar-item-text sidebar-link ct-change-section-link" },
      ""
    );
    var text = createElement("span", { class: "menu-text" }, buttonText || "change class section");
    link.appendChild(text);
    link.addEventListener("click", function (evt) {
      evt.preventDefault();
      onChangeSection();
    });
    container.appendChild(link);
    item.appendChild(container);
    return item;
  }

  function createProfessorControlItem(labelText, color, onOpenChooser) {
    var item = createElement("li", { class: "sidebar-item ct-prof-sidebar-item" });
    var container = createElement("div", { class: "sidebar-item-container" });
    var link = createElement(
      "a",
      { href: "#", class: "sidebar-item-text sidebar-link ct-prof-section-link" },
      ""
    );
    var text = createElement("span", { class: "menu-text" }, labelText);
    if (color) {
      text.style.backgroundColor = color;
      text.style.color = "#fff";
    }
    link.appendChild(text);
    link.addEventListener("click", function (evt) {
      evt.preventDefault();
      onOpenChooser();
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

  function mountProfessorControls(config, selectedSectionIds, onOpenChooser) {
    clearProfessorControls();
    var sidebarMenu = getSidebarMenuList();
    if (!sidebarMenu) {
      return;
    }

    if (!selectedSectionIds.length) {
      var emptyItem = createProfessorControlItem("Choose section(s)", "", onOpenChooser);
      sidebarMenu.prepend(emptyItem);
      return;
    }

    var colors = sectionColorMap(config);
    // Preserve visual order with first selected section at top.
    selectedSectionIds
      .slice()
      .reverse()
      .forEach(function (sectionId) {
        var label = getSectionLabel(config, sectionId) || sectionId;
        var item = createProfessorControlItem(label, colors[sectionId] || "", onOpenChooser);
        sidebarMenu.prepend(item);
      });
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
    // Fallback for non-standard layouts.
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

  function init(config, data) {
    var profMode = isProfessorMode();
    if (profMode) {
      clearStudentControls();
      var stored = localStorage.getItem(STORAGE_KEY_PROF);
      var selected = [];
      if (stored) {
        try {
          selected = JSON.parse(stored);
        } catch (_err) {
          selected = [];
        }
      }
      function openProfessorChooser() {
        var existing = document.getElementById("ct-overlay");
        if (existing) {
          existing.remove();
        }
        var panel = createProfessorPanel(config, selected, function (ids) {
          selected = ids;
          localStorage.setItem(STORAGE_KEY_PROF, JSON.stringify(ids));
          applyProfessorCoverage(ids, config, data);
          mountProfessorControls(config, ids, openProfessorChooser);
        });
        document.body.appendChild(panel);
      }

      applyProfessorCoverage(selected, config, data);
      mountProfessorControls(config, selected, openProfessorChooser);
      openProfessorChooser();
      return;
    }

    clearProfessorControls();

    if (shouldResetStudentSelection()) {
      getStudentStorage().removeItem(STORAGE_KEY_STUDENT);
      // Clear prior versions that used localStorage for student selection.
      localStorage.removeItem(STORAGE_KEY_STUDENT);
    }

    var studentSection = getStudentStorage().getItem(STORAGE_KEY_STUDENT) || "";
    if (!studentSection) {
      document.body.classList.add("ct-needs-selection");
      var overlay = createStudentOverlay(config, "", function (sectionId) {
        getStudentStorage().setItem(STORAGE_KEY_STUDENT, sectionId);
        applyStudentCoverage(sectionId, data);
        mountStudentChangeControl(config, sectionId);
      });
      document.body.appendChild(overlay);
    } else {
      applyStudentCoverage(studentSection, data);
      mountStudentChangeControl(config, studentSection);
    }
  }

  function boot() {
    var basePath = getTrackerBasePath();
    Promise.all([
      fetchJson(basePath + "coverage-config.json"),
      fetchJson(basePath + "coverage-data.json")
    ])
      .then(function (loaded) {
        init(loaded[0], loaded[1]);
      })
      .catch(function (err) {
        console.error("Coverage tracker initialization failed", err);
        showTrackerLoadError("Could not load coverage config/data from " + basePath);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
