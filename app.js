/* TileLink — loads config.yaml, renders the tile grid. Zero dependencies. */
(function () {
  "use strict";

  var CDN_SVG = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/";
  var CDN_PNG = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/";

  var grid = document.getElementById("grid");
  var emptyEl = document.getElementById("empty");
  var noresultsEl = document.getElementById("noresults");
  var clearBtn = document.getElementById("clear-search");
  var errorEl = document.getElementById("error");
  var searchEl = document.getElementById("search");
  var countEl = document.getElementById("count");
  var chipsEl = document.getElementById("chips");
  var allLinks = [];
  var activeCategory = null; // null = All
  function otherCat() { return t("other"); }

  // ---------- Admin (admin team: writes via token) ----------
  var adminBtn = document.getElementById("admin-toggle");
  var adminToken = null;
  try { adminToken = sessionStorage.getItem("tilelink-admin"); } catch (e) {}
  function setAdmin(on, token) {
    adminToken = on ? token : null;
    try {
      if (on) sessionStorage.setItem("tilelink-admin", token);
      else sessionStorage.removeItem("tilelink-admin");
    } catch (e) {}
    document.body.classList.toggle("admin", on);
    adminBtn.textContent = on ? "\uD83D\uDD13" : "\uD83D\uDD12";
    adminBtn.classList.toggle("unlocked", on);
    adminBtn.title = on ? t("adminUnlockedTitle") : t("adminLockedTitle");
    renderTilesFiltered();
  }
  function api(path, opts) {
    opts = opts || {};
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers.Authorization = "Bearer " + adminToken;
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
        return data;
      });
    });
  }

  // ---------- FR/EN language (per-browser preference) ----------
  var I18N = {
    fr: {
      langBtn: "EN", langTitle: "Switch to English",
      brandBtnTitle: "Personnalisation (logo, titre)",
      userBtnTitle: "Préférences d'affichage",
      adminLockedTitle: "Mode admin (ajout/suppression)",
      adminUnlockedTitle: "Mode admin actif (cliquer pour verrouiller)",
      themeTitle: "Basculer clair / sombre",
      searchPh: "Rechercher…  ( / )",
      addBtn: "＋ Ajouter",
      all: "Tout", other: "Autres",
      emptyHtml: "Aucun lien configuré. Éditez <code>config.yaml</code> pour ajouter une tuile.",
      noResults: "Aucun résultat. ", clearSearch: "Effacer la recherche",
      unlockTitle: "Mode admin",
      unlockText: "Mot de passe de l'équipe admin pour afficher l'édition (✎) et la suppression (×).",
      passLabel: "Mot de passe", passPh: "Mot de passe admin", passLabelAdd: "Mot de passe admin",
      cancel: "Annuler", unlock: "Déverrouiller", save: "Enregistrer", saving: "Enregistrement…", close: "Fermer",
      passRequired: "Mot de passe requis.", badPass: "Mot de passe incorrect.",
      newTile: "Nouvelle tuile", editTile: "Modifier la tuile",
      nameLabel: "Nom *", namePh: "Ex : Mon App Recette",
      urlLabel: "URL *", urlPh: "https://…",
      iconLabel: "Icône (slug dashboard-icons ou URL)", iconPh: "Ex : portainer ou https://…/logo.svg",
      uploadLabel: "… ou image à uploader",
      uploadHintHtml: "Redimensionnée automatiquement en 256×256 PNG dans <code>icons/</code>.",
      catLabel: "Catégorie", catPh: "Ex : Conteneurs",
      envLabel: "Env",
      passRequiredAdd: "Mot de passe admin requis.",
      nameUrlRequired: "Nom et URL (http(s)://…) requis.",
      badFormat: "Format accepté : PNG, JPG ou WebP.",
      badImage: "Image illisible.", badImageWhy: "Image illisible : ",
      confirmDelete: "Supprimer « {name} » ?", deleteFailed: "Suppression impossible : ",
      userTitle: "Affichage", userText: "Préférence enregistrée dans ce navigateur uniquement.",
      sizeLarge: "Grandes tuiles", sizeCompact: "Petites tuiles",
      sizeHintHtml: "En taille réduite, les noms longs passent sur 2 lignes (ex. AdGuard<br />Home).",
      brandModalTitle: "Personnalisation",
      brandTextHtml: "Visible par toutes les équipes. Champ vide = valeur de <code>config.yaml</code>.",
      bTitleLabel: "Titre", bTitlePh: "Ex : Portail Équipe Réseau",
      bSubLabel: "Sous-titre", bSubPh: "Ex : Production & Recette",
      bLogoLabel: "Logo (URL d'image)", bLogoPh: "Ex : https://…/logo.png",
      bUploadLabel: "… ou image à uploader",
      bUploadHintHtml: "Redimensionnée en 128×128 dans <code>icons/</code>.",
      errNotFound: "config.yaml introuvable (HTTP {s})",
      errInvalid: "config.yaml invalide : {e}",
      errPrefix: "Erreur : "
    },
    en: {
      langBtn: "FR", langTitle: "Passer en français",
      brandBtnTitle: "Branding (logo, title)",
      userBtnTitle: "Display preferences",
      adminLockedTitle: "Admin mode (add/remove)",
      adminUnlockedTitle: "Admin mode on (click to lock)",
      themeTitle: "Toggle light / dark",
      searchPh: "Search…  ( / )",
      addBtn: "＋ Add",
      all: "All", other: "Others",
      emptyHtml: "No links configured. Edit <code>config.yaml</code> to add a tile.",
      noResults: "No results. ", clearSearch: "Clear search",
      unlockTitle: "Admin mode",
      unlockText: "Admin team password to show edit (✎) and delete (×).",
      passLabel: "Password", passPh: "Admin password", passLabelAdd: "Admin password",
      cancel: "Cancel", unlock: "Unlock", save: "Save", saving: "Saving…", close: "Close",
      passRequired: "Password required.", badPass: "Incorrect password.",
      newTile: "New tile", editTile: "Edit tile",
      nameLabel: "Name *", namePh: "E.g. My Staging App",
      urlLabel: "URL *", urlPh: "https://…",
      iconLabel: "Icon (dashboard-icons slug or URL)", iconPh: "E.g. portainer or https://…/logo.svg",
      uploadLabel: "… or upload an image",
      uploadHintHtml: "Auto-resized to 256×256 PNG into <code>icons/</code>.",
      catLabel: "Category", catPh: "E.g. Containers",
      envLabel: "Env",
      passRequiredAdd: "Admin password required.",
      nameUrlRequired: "Name and URL (http(s)://…) required.",
      badFormat: "Accepted format: PNG, JPG or WebP.",
      badImage: "Unreadable image.", badImageWhy: "Unreadable image: ",
      confirmDelete: "Delete “{name}”?", deleteFailed: "Delete failed: ",
      userTitle: "Display", userText: "Preference stored in this browser only.",
      sizeLarge: "Large tiles", sizeCompact: "Small tiles",
      sizeHintHtml: "When small, long names wrap on 2 lines (e.g. AdGuard<br />Home).",
      brandModalTitle: "Branding",
      brandTextHtml: "Visible to all teams. Empty field = <code>config.yaml</code> value.",
      bTitleLabel: "Title", bTitlePh: "E.g. Network Team Portal",
      bSubLabel: "Subtitle", bSubPh: "E.g. Production & Staging",
      bLogoLabel: "Logo (image URL)", bLogoPh: "E.g. https://…/logo.png",
      bUploadLabel: "… or upload an image",
      bUploadHintHtml: "Resized to 128×128 into <code>icons/</code>.",
      errNotFound: "config.yaml not found (HTTP {s})",
      errInvalid: "Invalid config.yaml: {e}",
      errPrefix: "Error: "
    }
  };
  // SVG flags (language button: shows the target language)
  var FLAG_FR = '<svg viewBox="0 0 3 2" width="22" height="15" aria-hidden="true"><rect width="1" height="2" x="0" fill="#0055A4"/><rect width="1" height="2" x="1" fill="#ffffff"/><rect width="1" height="2" x="2" fill="#EF4135"/></svg>';
  var FLAG_GB = '<svg viewBox="0 0 60 30" width="22" height="15" aria-hidden="true"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="2"/><path d="M30,0 V30 M0,15 H60" stroke="#ffffff" stroke-width="10"/><path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"/></svg>';
  var lang = "fr";
  try {
    lang = localStorage.getItem("tilelink-lang") ||
      ((navigator.language || "").toLowerCase().indexOf("en") === 0 ? "en" : "fr");
  } catch (e) {}
  if (!I18N[lang]) lang = "fr";
  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key] : (I18N.fr[key] || key);
    if (vars) {
      Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    }
    return s;
  }
  // Replace a <label> text (text node before the input)
  function setLabelText(inputEl, text) {
    var lab = inputEl.closest("label");
    if (lab && lab.firstChild) lab.firstChild.textContent = text;
  }
  var titleEl = document.getElementById("site-title");
  var subtitleEl = document.getElementById("site-subtitle");
  var footerEl = document.getElementById("footer-text");
  var brandLogo = document.getElementById("brand-logo");
  var defaultBrandHTML = brandLogo.innerHTML;
  var toggleBtn = document.getElementById("theme-toggle");

  // ---------- Theme ----------
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    toggleBtn.textContent = t === "dark" ? "\u263E" : "\u2600";
    try { localStorage.setItem("tilelink-theme", t); } catch (e) {}
  }
  var saved = null;
  try { saved = localStorage.getItem("tilelink-theme"); } catch (e) {}
  toggleBtn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(cur === "dark" ? "light" : "dark");
  });

  // ---------- Tile size (user setting, per browser) ----------
  var userModal = document.getElementById("user-modal");
  function setTileSize(s) {
    if (s !== "compact") s = "large";
    document.documentElement.setAttribute("data-tilesize", s);
    try { localStorage.setItem("tilelink-tilesize", s); } catch (e) {}
    var radios = userModal.querySelectorAll('input[name="tilesize"]');
    radios.forEach(function (r) { r.checked = (r.value === s); });
  }
  var savedSize = "large";
  try { savedSize = localStorage.getItem("tilelink-tilesize") || "large"; } catch (e) {}
  setTileSize(savedSize);
  document.getElementById("user-toggle").addEventListener("click", function () {
    userModal.hidden = false;
  });
  document.getElementById("user-close").addEventListener("click", function () {
    userModal.hidden = true;
  });
  userModal.addEventListener("click", function (e) { if (e.target === userModal) userModal.hidden = true; });
  userModal.querySelectorAll('input[name="tilesize"]').forEach(function (r) {
    r.addEventListener("change", function () { setTileSize(r.value); });
  });

  // ---------- Branding (admin setting: logo, title, subtitle) ----------
  var brandBtn = document.getElementById("brand-btn");
  var brandModal = document.getElementById("brand-modal");
  var bTitle = document.getElementById("b-title");
  var bSubtitle = document.getElementById("b-subtitle");
  var bLogo = document.getElementById("b-logo");
  var bLogoFile = document.getElementById("b-logofile");
  var bPreview = document.getElementById("brand-preview");
  var brandError = document.getElementById("brand-error");
  var currentSettings = {};
  var pendingLogoDataUrl = null;

  function applyBranding(cfg) {
    var title = (currentSettings.title || cfg.title || "TileLink");
    var subtitle = (currentSettings.subtitle !== undefined && currentSettings.subtitle !== "")
      ? currentSettings.subtitle : (cfg.subtitle || "");
    titleEl.textContent = title;
    document.title = title;
    footerEl.textContent = title + " \u00A9 " + new Date().getFullYear();
    subtitleEl.textContent = subtitle;
    var logo = (currentSettings.logo || "").trim();
    brandLogo.innerHTML = "";
    if (logo) {
      var img = document.createElement("img");
      img.src = logo;
      img.alt = "";
      img.onerror = function () { brandLogo.innerHTML = defaultBrandHTML; };
      brandLogo.appendChild(img);
    } else {
      brandLogo.innerHTML = defaultBrandHTML;
    }
  }
  function setBrandPreview(src) {
    bPreview.innerHTML = "";
    if (src) {
      var img = document.createElement("img");
      img.src = src;
      img.alt = "";
      bPreview.appendChild(img);
    } else {
      var fb = document.createElement("span");
      fb.className = "tile-fallback";
      fb.textContent = "◈";
      bPreview.appendChild(fb);
    }
  }
  brandBtn.addEventListener("click", function () {
    if (!adminToken) return;
    bTitle.value = currentSettings.title || "";
    bSubtitle.value = currentSettings.subtitle || "";
    bLogo.value = currentSettings.logo || "";
    bLogoFile.value = "";
    pendingLogoDataUrl = null;
    setBrandPreview(bLogo.value);
    brandError.hidden = true;
    brandModal.hidden = false;
    bTitle.focus();
  });
  document.getElementById("brand-cancel").addEventListener("click", function () {
    brandModal.hidden = true;
  });
  brandModal.addEventListener("click", function (e) { if (e.target === brandModal) brandModal.hidden = true; });
  bLogo.addEventListener("input", function () {
    if (pendingLogoDataUrl) return;
    setBrandPreview(bLogo.value.trim());
  });
  bLogoFile.addEventListener("change", function () {
    pendingLogoDataUrl = null;
    var file = bLogoFile.files && bLogoFile.files[0];
    if (!file) { setBrandPreview(bLogo.value.trim()); return; }
    if (!/image\/(png|jpeg|webp)/.test(file.type)) {
      brandError.hidden = false;
      brandError.textContent = t("badFormat");
      bLogoFile.value = "";
      return;
    }
    var img = new Image();
    img.onload = function () {
      try {
        var S = 128;
        var cv = document.createElement("canvas");
        cv.width = S; cv.height = S;
        var ctx = cv.getContext("2d");
        var scale = Math.min(S / img.width, S / img.height);
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(img, Math.round((S - w) / 2), Math.round((S - h) / 2), w, h);
        pendingLogoDataUrl = cv.toDataURL("image/png");
        setBrandPreview(pendingLogoDataUrl);
        URL.revokeObjectURL(img.src);
      } catch (err) {
        brandError.hidden = false;
        brandError.textContent = t("badImageWhy") + err.message;
      }
    };
    img.onerror = function () {
      brandError.hidden = false;
      brandError.textContent = t("badImage");
    };
    img.src = URL.createObjectURL(file);
  });
  document.getElementById("brand-save").addEventListener("click", function () {
    if (!adminToken) return;
    brandError.hidden = true;
    var headers = { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken };
    function putSettings(body) {
      return fetch("/api/settings", { method: "PUT", headers: headers, body: JSON.stringify(body) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
            return data;
          });
        });
    }
    var saveBtn = document.getElementById("brand-save");
    saveBtn.disabled = true;
    saveBtn.textContent = t("saving");
    var logoValue = bLogo.value.trim();
    var upload = pendingLogoDataUrl
      ? putSettingsLogo(pendingLogoDataUrl)
      : Promise.resolve(logoValue);
    function putSettingsLogo(dataUrl) {
      return fetch("/api/upload", { method: "POST", headers: headers, body: JSON.stringify({ filename: "logo", dataUrl: dataUrl }) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
            return data.path;
          });
        });
    }
    upload
      .then(function (logoPath) {
        return putSettings({ title: bTitle.value.trim(), subtitle: bSubtitle.value.trim(), logo: logoPath || "" });
      })
      .then(function (data) {
        currentSettings = data.settings || {};
        applyBranding(window.__tilelinkCfg || { title: "TileLink", subtitle: "" });
        brandModal.hidden = true;
      })
      .catch(function (err) {
        brandError.hidden = false;
        brandError.textContent = err.message;
      })
      .finally(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = t("save");
      });
  });

  // ---------- Mini YAML parser (subset supported by config.yaml) ----------
  // Supports: title:, subtitle:, theme:, links: then "- name:/url:/icon:/category:/env:" (+ "..." or '...')
  function stripQuotes(s) {
    s = s.trim();
    if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
      return s.slice(1, -1);
    }
    return s;
  }
  var LINK_KEYS = /^(name|url|icon|category|env)\s*:\s*(.*)$/;
  function parseConfig(text) {
    var cfg = { title: "TileLink", subtitle: "", theme: null, links: [] };
    var lines = text.split(/\r?\n/);
    var current = null;
    var inLinks = false;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var trimmed = raw.trim();
      if (!trimmed || trimmed[0] === "#") continue;
      var indent = raw.length - raw.trimStart().length;

      if (indent === 0) {
        inLinks = /^links\s*:/.test(trimmed);
        var m = trimmed.match(/^(title|subtitle|theme)\s*:\s*(.*)$/);
        if (m) cfg[m[1]] = stripQuotes(m[2]);
        continue;
      }
      if (!inLinks) continue;
      // New "- ..." item
      var dash = trimmed.match(/^-\s*(.*)$/);
      if (dash) {
        if (current) cfg.links.push(current);
        current = {};
        var rest = dash[1].trim();
        if (rest) {
          var kv = rest.match(LINK_KEYS);
          if (kv) current[kv[1]] = stripQuotes(kv[2]).trim();
        }
        continue;
      }
      if (current) {
        var kv2 = trimmed.match(LINK_KEYS);
        if (kv2) current[kv2[1]] = stripQuotes(kv2[2]).trim();
      }
    }
    if (current) cfg.links.push(current);
    // Drop incomplete items
    cfg.links = cfg.links.filter(function (l) { return l && l.name && l.url; });
    return cfg;
  }

  // ---------- Icons ----------
  function isDirectUrl(icon) {
    return /^(https?:\/\/|\/|\.\/|icons\/)/i.test(icon);
  }
  function initials(name) {
    var words = (name || "?").trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return (name || "?").trim().slice(0, 2).toUpperCase();
  }
  function iconCandidates(icon) {
    if (!icon) return [];
    if (isDirectUrl(icon)) return [icon];
    var slug = icon.trim().toLowerCase().replace(/\s+/g, "-");
    return [CDN_SVG + slug + ".svg", CDN_PNG + slug + ".png"];
  }
  function createIcon(name, icon) {
    var box = document.createElement("div");
    box.className = "tile-icon";
    var cands = iconCandidates(icon);
    if (!cands.length) {
      var fb = document.createElement("span");
      fb.className = "tile-fallback";
      fb.textContent = initials(name);
      box.appendChild(fb);
      return box;
    }
    var img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    var idx = 0;
    img.onerror = function () {
      idx++;
      if (idx < cands.length) {
        img.src = cands[idx];
      } else {
        img.remove();
        var fb2 = document.createElement("span");
        fb2.className = "tile-fallback";
        fb2.textContent = initials(name);
        box.appendChild(fb2);
      }
    };
    img.src = cands[0];
    box.appendChild(img);
    return box;
  }

  // ---------- Render + search + categories ----------
  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function catOf(l) { var c = ((l.category || "").trim()); return c || otherCat(); }
  function categories() {
    var seen = [], out = [];
    allLinks.forEach(function (l) {
      var c = catOf(l);
      if (seen.indexOf(c) === -1) { seen.push(c); out.push(c); }
    });
    return out;
  }
  function renderChips() {
    chipsEl.innerHTML = "";
    var cats = categories();
    if (cats.length <= 1) return; // pas de filtre utile
    var all = document.createElement("button");
    all.type = "button";
    all.className = "chip" + (activeCategory === null ? " active" : "");
    all.textContent = t("all");
    all.dataset.all = "1";
    all.setAttribute("aria-pressed", activeCategory === null ? "true" : "false");
    all.addEventListener("click", function () { activeCategory = null; applyFilters(); });
    chipsEl.appendChild(all);
    cats.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (activeCategory === c ? " active" : "");
      b.textContent = c;
      b.setAttribute("aria-pressed", activeCategory === c ? "true" : "false");
      b.addEventListener("click", function () {
        activeCategory = (activeCategory === c) ? null : c;
        applyFilters();
      });
      chipsEl.appendChild(b);
    });
  }
  function syncChips() {
    var btns = chipsEl.querySelectorAll(".chip");
    btns.forEach(function (b) {
      var isActive = (b.dataset.all === "1" && activeCategory === null) || b.textContent === activeCategory;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
  function envClass(env) {
    var e = norm(env);
    if (e === "prod" || e === "production") return "env-prod";
    if (e === "recette" || e === "staging" || e === "rec") return "env-recette";
    if (e === "dev" || e === "development") return "env-dev";
    return "";
  }
  function renderTiles(links) {
    grid.innerHTML = "";
    links.forEach(function (link) {
      var a = document.createElement("a");
      a.className = "tile";
      a.href = link.url;
      a.title = link.name;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      if (link._custom) {
        (function (id, name) {
          var edit = document.createElement("button");
          edit.type = "button";
          edit.className = "tile-edit custom";
          edit.textContent = "✎";
          edit.title = "Modifier cette tuile";
          edit.setAttribute("aria-label", "Modifier " + name);
          edit.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            openEdit({ id: id, name: link.name, url: link.url, icon: link.icon || "", category: link.category || "", env: link.env || "" });
          });
          a.appendChild(edit);
        })(link.id, link.name);
        var del = document.createElement("button");
        del.type = "button";
        del.className = "tile-del custom";
        del.textContent = "×";
        del.title = "Supprimer cette tuile";
        del.setAttribute("aria-label", "Supprimer " + link.name);
        (function (id, name) {
          del.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!confirm(t("confirmDelete", { name: name }))) return;
            api("/api/links/" + encodeURIComponent(id), { method: "DELETE" })
              .then(loadData)
              .catch(function (err) { alert(t("deleteFailed") + err.message); });
          });
        })(link.id, link.name);
        a.appendChild(del);
      }
      if (link.env) {
        var badge = document.createElement("span");
        badge.className = "tile-badge " + envClass(link.env);
        badge.textContent = link.env;
        a.appendChild(badge);
      }
      a.appendChild(createIcon(link.name, link.icon));
      var label = document.createElement("span");
      label.className = "tile-name";
      label.textContent = link.name;
      a.appendChild(label);
      grid.appendChild(a);
    });
    if (countEl) countEl.textContent = links.length + " / " + allLinks.length;
    noresultsEl.hidden = links.length > 0 || allLinks.length === 0;
  }
  function applyFilters() {
    var q = norm(searchEl.value.trim());
    var list = allLinks.filter(function (l) {
      if (activeCategory !== null && catOf(l) !== activeCategory) return false;
      if (!q) return true;
      return norm(l.name).indexOf(q) !== -1 || norm(l.url).indexOf(q) !== -1 || norm(catOf(l)).indexOf(q) !== -1;
    });
    syncChips();
    renderTiles(list);
  }
  searchEl.addEventListener("input", applyFilters);
  clearBtn.addEventListener("click", function () { searchEl.value = ""; activeCategory = null; applyFilters(); searchEl.focus(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== searchEl) { e.preventDefault(); searchEl.focus(); }
    if (e.key === "Escape" && document.activeElement === searchEl) { searchEl.value = ""; applyFilters(); }
  });

  function renderTilesFiltered() { applyFilters(); }
  function fillCatList() {
    var dl = document.getElementById("cat-list");
    if (!dl) return;
    dl.innerHTML = "";
    categories().forEach(function (c) {
      if (c === otherCat()) return;
      var o = document.createElement("option");
      o.value = c;
      dl.appendChild(o);
    });
  }

  // ---------- Load: config.yaml (hand-managed) + custom.json via API (UI) ----------
  function loadData() {
    return fetch("config.yaml", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error(t("errNotFound", { s: r.status }));
        return r.text();
      })
      .then(function (text) {
        var cfg;
        try {
          cfg = parseConfig(text);
        } catch (e) {
          throw new Error(t("errInvalid", { e: e.message }));
        }
        return api("/api/links").catch(function () { return { links: [] }; }).then(function (custom) {
          return api("/api/settings").catch(function () { return { settings: {} }; }).then(function (s) {
          currentSettings = s.settings || {};
          window.__tilelinkCfg = { title: cfg.title, subtitle: cfg.subtitle };
          errorEl.hidden = true;
          applyBranding(cfg);
          setTheme(saved || cfg.theme || document.documentElement.getAttribute("data-theme") || "dark");
          grid.innerHTML = "";
          if (!cfg.links.length && !(custom.links || []).length) {
            allLinks = [];
            emptyEl.hidden = false;
            noresultsEl.hidden = true;
            chipsEl.innerHTML = "";
            if (countEl) countEl.textContent = "";
            return;
          }
          emptyEl.hidden = true;
          allLinks = cfg.links.concat((custom.links || []).map(function (l) {
            l._custom = true;
            return l;
          }));
          activeCategory = null;
          searchEl.value = "";
          renderChips();
          fillCatList();
          renderTiles(allLinks);
          });
        });
      })
      .catch(function (err) {
        setTheme(saved || "dark");
        errorEl.hidden = false;
        errorEl.textContent = t("errPrefix") + err.message;
      });
  }

  // ---------- Add modal (admin team) ----------
  var modal = document.getElementById("modal");
  var fPass = document.getElementById("f-pass");
  var passWrap = document.getElementById("pass-wrap");
  var fName = document.getElementById("f-name");
  var fUrl = document.getElementById("f-url");
  var fIcon = document.getElementById("f-icon");
  var fFile = document.getElementById("f-file");
  var fCat = document.getElementById("f-cat");
  var fEnv = document.getElementById("f-env");
  var formError = document.getElementById("form-error");
  var preview = document.getElementById("icon-preview");
  var modalTitle = document.getElementById("modal-title");
  var pendingDataUrl = null; // 256px PNG ready to upload
  var editingId = null; // null = create, else edited tile id

  function resetForm() {
    fPass.value = ""; fName.value = ""; fUrl.value = ""; fIcon.value = "";
    fFile.value = ""; fCat.value = ""; fEnv.value = "";
    pendingDataUrl = null;
    editingId = null;
    setPreview(null, "?");
  }
  function openModal() {
    resetForm();
    modalTitle.textContent = t("newTile");
    formError.hidden = true;
    passWrap.hidden = !!adminToken;
    modal.hidden = false;
    (adminToken ? fName : fPass).focus();
  }
  function openEdit(link) {
    resetForm();
    editingId = link.id;
    modalTitle.textContent = t("editTile");
    fName.value = link.name;
    fUrl.value = link.url;
    fIcon.value = link.icon || "";
    fCat.value = link.category || "";
    fEnv.value = link.env || "";
    previewIconValue(fIcon.value, fName.value);
    formError.hidden = true;
    passWrap.hidden = !!adminToken;
    modal.hidden = false;
    fName.focus();
  }
  function closeModal() { modal.hidden = true; }
  document.getElementById("add-btn").addEventListener("click", openModal);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!modal.hidden) closeModal();
    else if (typeof unlockModal !== "undefined" && unlockModal && !unlockModal.hidden) closeUnlock();
    else if (typeof userModal !== "undefined" && userModal && !userModal.hidden) userModal.hidden = true;
    else if (typeof brandModal !== "undefined" && brandModal && !brandModal.hidden) brandModal.hidden = true;
  });

  function setPreview(imgSrc, fallbackName) {
    preview.innerHTML = "";
    if (imgSrc) {
      var img = document.createElement("img");
      img.src = imgSrc;
      img.alt = "";
      preview.appendChild(img);
    } else {
      var fb = document.createElement("span");
      fb.className = "tile-fallback";
      fb.textContent = initials(fallbackName || "?");
      preview.appendChild(fb);
    }
  }
  // Preview of an icon value (slug/URL) with SVG->PNG fallback like tiles
  function previewIconValue(v, name) {
    v = (v || "").trim();
    if (!v) { setPreview(null, name); return; }
    var cands = iconCandidates(v);
    if (!cands.length) { setPreview(null, name); return; }
    preview.innerHTML = "";
    var img = document.createElement("img");
    img.alt = "";
    var idx = 0;
    img.onerror = function () {
      idx++;
      if (idx < cands.length) img.src = cands[idx];
      else setPreview(null, name); // slug inexistant -> initiales
    };
    img.src = cands[0];
    preview.appendChild(img);
  }
  // Text icon (slug/URL) -> live preview
  fIcon.addEventListener("input", function () {
    if (pendingDataUrl) return;
    previewIconValue(fIcon.value, fName.value);
  });
  fName.addEventListener("input", function () {
    if (!fIcon.value.trim() && !pendingDataUrl) setPreview(null, fName.value);
  });
  // File -> resize to 256x256 PNG (contain on transparent background)
  fFile.addEventListener("change", function () {
    pendingDataUrl = null;
    var file = fFile.files && fFile.files[0];
    if (!file) { setPreview(fIcon.value.trim() ? iconCandidates(fIcon.value.trim())[0] : null, fName.value); return; }
    if (!/image\/(png|jpeg|webp)/.test(file.type)) {
      formError.hidden = false;
      formError.textContent = t("badFormat");
      fFile.value = "";
      return;
    }
    var img = new Image();
    img.onload = function () {
      try {
        var S = 256;
        var cv = document.createElement("canvas");
        cv.width = S; cv.height = S;
        var ctx = cv.getContext("2d");
        var scale = Math.min(S / img.width, S / img.height);
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(img, Math.round((S - w) / 2), Math.round((S - h) / 2), w, h);
        pendingDataUrl = cv.toDataURL("image/png");
        setPreview(pendingDataUrl, null);
        URL.revokeObjectURL(img.src);
      } catch (err) {
        formError.hidden = false;
        formError.textContent = t("badImageWhy") + err.message;
      }
    };
    img.onerror = function () {
      formError.hidden = false;
      formError.textContent = t("badImage");
    };
    img.src = URL.createObjectURL(file);
  });

  document.getElementById("modal-save").addEventListener("click", function () {
    var token = adminToken || fPass.value.trim();
    var name = fName.value.trim();
    var url = fUrl.value.trim();
    formError.hidden = true;
    if (!token) {
      formError.hidden = false;
      formError.textContent = t("passRequiredAdd");
      return;
    }
    if (!name || !/^https?:\/\/\S+/.test(url)) {
      formError.hidden = false;
      formError.textContent = t("nameUrlRequired");
      return;
    }
    var headers = { "Content-Type": "application/json", "Authorization": "Bearer " + token };
    function sendApi(method, path, body) {
      return fetch(path, { method: method, headers: headers, body: JSON.stringify(body) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) throw new Error((data && data.error) || ("HTTP " + r.status));
            return data;
          });
        });
    }
    var saveBtn = document.getElementById("modal-save");
    saveBtn.disabled = true;
    saveBtn.textContent = t("saving");
    var iconValue = fIcon.value.trim();
    var upload = pendingDataUrl
      ? sendApi("POST", "/api/upload", { filename: name, dataUrl: pendingDataUrl }).then(function (u) { return u.path; })
      : Promise.resolve(iconValue);
    upload
      .then(function (iconPath) {
        var payload = {
          name: name, url: url, icon: iconPath || "",
          category: fCat.value.trim(), env: fEnv.value,
        };
        // Create (POST) or update (PUT) depending on modal mode
        return editingId
          ? sendApi("PUT", "/api/links/" + encodeURIComponent(editingId), payload)
          : sendApi("POST", "/api/links", payload);
      })
      .then(function () {
        if (!adminToken) setAdminSilent(token);
        closeModal();
        resetForm();
        loadData();
      })
      .catch(function (err) {
        formError.hidden = false;
        formError.textContent = err.message;
      })
      .finally(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = t("save");
      });
  });
  function setAdminSilent(token) {
    adminToken = token;
    try { sessionStorage.setItem("tilelink-admin", token); } catch (e) {}
    document.body.classList.add("admin");
    adminBtn.textContent = "\uD83D\uDD13";
    adminBtn.classList.add("unlocked");
  }
  // ---------- Admin toggle: lock = lock/unlock only ----------
  // (adding goes through the "＋ Add" button)
  var unlockModal = document.getElementById("unlock");
  var uPass = document.getElementById("u-pass");
  var uError = document.getElementById("u-error");
  function openUnlock() {
    uError.hidden = true;
    uPass.value = "";
    unlockModal.hidden = false;
    uPass.focus();
  }
  function closeUnlock() { unlockModal.hidden = true; }
  function submitUnlock() {
    var token = uPass.value.trim();
    uError.hidden = true;
    if (!token) {
      uError.hidden = false;
      uError.textContent = t("passRequired");
      return;
    }
    api("/api/verify", { method: "POST", body: { token: token } })
      .then(function () {
        closeUnlock();
        setAdmin(true, token);
      })
      .catch(function () {
        uError.hidden = false;
        uError.textContent = t("badPass");
      });
  }
  document.getElementById("u-ok").addEventListener("click", submitUnlock);
  document.getElementById("u-cancel").addEventListener("click", closeUnlock);
  uPass.addEventListener("keydown", function (e) { if (e.key === "Enter") submitUnlock(); });
  unlockModal.addEventListener("click", function (e) { if (e.target === unlockModal) closeUnlock(); });
  adminBtn.addEventListener("click", function () {
    if (adminToken) setAdmin(false); // lock, hide ✎/×
    else openUnlock(); // unlock, show ✎/× again
  });

  // ---------- Language: apply all labels ----------
  var langBtn = document.getElementById("lang-toggle");
  function setHint(inputEl, html) {
    var lab = inputEl.closest("label");
    var h = lab && lab.querySelector(".hint");
    if (h) h.innerHTML = html;
  }
  function applyLang() {
    document.documentElement.lang = lang;
    try { localStorage.setItem("tilelink-lang", lang); } catch (e) {}
    langBtn.innerHTML = (lang === "fr") ? FLAG_GB : FLAG_FR;
    langBtn.title = t("langTitle");
    document.getElementById("brand-btn").title = t("brandBtnTitle");
    document.getElementById("user-toggle").title = t("userBtnTitle");
    adminBtn.title = adminToken ? t("adminUnlockedTitle") : t("adminLockedTitle");
    toggleBtn.title = t("themeTitle");
    searchEl.placeholder = t("searchPh");
    document.getElementById("add-btn").textContent = t("addBtn");
    emptyEl.innerHTML = t("emptyHtml");
    noresultsEl.firstChild.textContent = t("noResults");
    clearBtn.textContent = t("clearSearch");
    // Admin unlock
    document.getElementById("unlock-title").textContent = t("unlockTitle");
    unlockModal.querySelector(".unlock-text").textContent = t("unlockText");
    setLabelText(uPass, t("passLabel"));
    uPass.placeholder = t("passPh");
    document.getElementById("u-cancel").textContent = t("cancel");
    document.getElementById("u-ok").textContent = t("unlock");
    // Add/edit modal
    modalTitle.textContent = editingId ? t("editTile") : t("newTile");
    setLabelText(fPass, t("passLabelAdd"));
    fPass.placeholder = t("passPh");
    setLabelText(fName, t("nameLabel"));
    fName.placeholder = t("namePh");
    setLabelText(fUrl, t("urlLabel"));
    fUrl.placeholder = t("urlPh");
    setLabelText(fIcon, t("iconLabel"));
    fIcon.placeholder = t("iconPh");
    setLabelText(fFile, t("uploadLabel"));
    setHint(fFile, t("uploadHintHtml"));
    setLabelText(fCat, t("catLabel"));
    fCat.placeholder = t("catPh");
    setLabelText(fEnv, t("envLabel"));
    document.getElementById("modal-cancel").textContent = t("cancel");
    var addSave = document.getElementById("modal-save");
    if (!addSave.disabled) addSave.textContent = t("save");
    // Display preferences
    document.getElementById("user-title").textContent = t("userTitle");
    userModal.querySelector(".unlock-text").textContent = t("userText");
    var radios = userModal.querySelectorAll('input[name="tilesize"]');
    radios.forEach(function (r) {
      r.parentElement.lastChild.textContent = " " + (r.value === "compact" ? t("sizeCompact") : t("sizeLarge"));
    });
    userModal.querySelector(".hint").innerHTML = t("sizeHintHtml");
    document.getElementById("user-close").textContent = t("close");
    // Branding (admin)
    document.getElementById("brand-title").textContent = t("brandModalTitle");
    brandModal.querySelector(".unlock-text").innerHTML = t("brandTextHtml");
    setLabelText(bTitle, t("bTitleLabel"));
    bTitle.placeholder = t("bTitlePh");
    setLabelText(bSubtitle, t("bSubLabel"));
    bSubtitle.placeholder = t("bSubPh");
    setLabelText(bLogo, t("bLogoLabel"));
    bLogo.placeholder = t("bLogoPh");
    setLabelText(bLogoFile, t("bUploadLabel"));
    setHint(bLogoFile, t("bUploadHintHtml"));
    document.getElementById("brand-cancel").textContent = t("cancel");
    var brandSave = document.getElementById("brand-save");
    if (!brandSave.disabled) brandSave.textContent = t("save");
    // Lists ("All/Others" chips depend on language)
    renderChips();
    applyFilters();
  }
  langBtn.addEventListener("click", function () {
    lang = (lang === "fr") ? "en" : "fr";
    applyLang();
  });

  // ---------- Init ----------
  applyLang();
  if (adminToken) {
    api("/api/verify", { method: "POST", body: { token: adminToken } })
      .then(function () { setAdmin(true, adminToken); })
      .catch(function () { setAdmin(false); });
  }
  loadData();
})();
