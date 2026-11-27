
document.addEventListener("DOMContentLoaded", () => {
  const tabs = [
    ...document.querySelectorAll("[data-admin-tab]")
  ];

  const panels = new Map(
    tabs.map(tab => [
      tab.dataset.adminTab,
      document.getElementById(
        `admin-main-panel-${tab.dataset.adminTab}`
      )
    ])
  );

  const mailButton = document.getElementById(
    "admin-main-tab-mail"
  );

  const inbox = document.getElementById("admin-inbox");

  if (!tabs.length || !mailButton) return;

  // ========================================
  // SWITCH MAIN ADMIN TABS
  // ========================================

  function activate(name, updateHash = true) {
    if (!panels.has(name)) return;
    if(name==="games"&&document.getElementById("admin-main-tab-orange")?.getAttribute("aria-selected")==="true")document.dispatchEvent(new Event("ptg:orange-admin-open"));

    for (const tab of tabs) {
      const selected = tab.dataset.adminTab === name;

      tab.setAttribute(
        "aria-selected",
        String(selected)
      );

      tab.tabIndex = selected ? 0 : -1;

      panels.get(
        tab.dataset.adminTab
      ).hidden = !selected;
    }

    if (updateHash) {
      history.replaceState(
        null,
        "",
        `#admin-${name}`
      );
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      activate(tab.dataset.adminTab);
    });
  }

  // ========================================
  // KEYBOARD TAB NAVIGATION
  // ========================================

  document.getElementById(
    "admin-main-tabs"
  )?.addEventListener("keydown", event => {
    if (![
      "ArrowRight",
      "ArrowLeft",
      "Home",
      "End"
    ].includes(event.key)) {
      return;
    }

    const visibleTabs=tabs.filter(tab=>!tab.hidden);
    const index = visibleTabs.indexOf(document.activeElement);

    if (index < 0) return;

    event.preventDefault();

    let next = index;

    if (event.key === "ArrowRight") {
      next = (index + 1) % visibleTabs.length;
    }

    if (event.key === "ArrowLeft") {
      next = (index - 1 + visibleTabs.length) % visibleTabs.length;
    }

    if (event.key === "Home") next = 0;
    if (event.key === "End") next = visibleTabs.length - 1;

    visibleTabs[next].focus();
    activate(visibleTabs[next].dataset.adminTab);
  });


  // Nested Add / Edit / Delete tabs. Keep existing song panel IDs
  // so song editors, deletion and form validation are unchanged.
  const subGroups = new Map();
  for (const button of document.querySelectorAll("[data-admin-subtab]")) {
    const [group, action] = button.dataset.adminSubtab.split(":");
    if (!subGroups.has(group)) subGroups.set(group, []);
    subGroups.get(group).push({ button, action });
  }
  function activateSub(group, action) {
    for (const {button, action: item} of subGroups.get(group) || []) {
      const active = action === item;
      button.setAttribute("aria-selected", String(active));
      const target = group === "music"
        ? document.getElementById("admin-main-panel-" + item)
        : document.querySelector('[data-admin-subpanel="' + group + ":" + item + '"]');
      if (target) target.hidden = !active;
    }
  }
  for (const [group, entries] of subGroups) {
    for (const {button, action} of entries) {
      button.addEventListener("click", () => {
        if(button.hidden)return;
        activateSub(group, action);
        history.replaceState(null, "", "#admin-" + group + "-" + action);
      });
    }
    activateSub(group, entries.find(x=>x.button.getAttribute("aria-selected")==="true")?.action||entries[0].action);
  }
  // Old links such as #admin-edit still open the correct song editor.
  const rawHash = location.hash.replace(/^#admin-/, "");
  const aliases={"albums-store":"store-cds","starlight":"store-starlight","digital":"store-digital","orange":"games-orange","shiny":"games-shiny"};
  const requestedHash=aliases[rawHash]||rawHash;
  const legacyMusic = ["add", "edit", "delete"].includes(requestedHash)
    ? requestedHash : null;
  const nestedMatch = requestedHash.match(/^(music|albums|genres|store|games)-([a-z]+)$/);
  if (legacyMusic) activateSub("music", legacyMusic);
  if (nestedMatch) activateSub(nestedMatch[1], nestedMatch[2]);

  // ========================================
  // TURN MAIL GREEN FOR ANY UNREAD CATEGORY
  // ========================================

  function refreshMailIndicator() {
    if (!inbox) return;

    const unreadTabs = [
      ...inbox.querySelectorAll(
        ".admin-inbox-tab.has-unread"
      )
    ];

    const unreadTotal = unreadTabs.reduce(
      (sum, tab) => {
        const badge = tab.querySelector(
          ".inbox-unread-count"
        );

        return sum + (
          Number(badge?.textContent?.trim()) || 0
        );
      },
      0
    );

    mailButton.classList.toggle(
      "has-unread",
      unreadTabs.length > 0
    );

    let count = document.getElementById(
      "admin-main-mail-count"
    );

    if (!count) {
      count = document.createElement("span");
      count.id = "admin-main-mail-count";
      count.style.marginLeft = "7px";
      mailButton.append(count);
    }

    count.textContent = unreadTotal
      ? `(${unreadTotal})`
      : "";

    mailButton.setAttribute(
      "aria-label",
      unreadTotal
        ? `Mail: ${unreadTotal} unread messages`
        : "Mail"
    );
  }

  // Watches Firestore-driven inbox UI updates.
  if (inbox) {
    const observer = new MutationObserver(
      refreshMailIndicator
    );

    observer.observe(inbox, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });

    refreshMailIndicator();
  }

  // Open a folded editor if a required field
  // inside it fails form validation.
  document.addEventListener(
    "invalid",
    event => {
      const editor = event.target.closest?.(
        "details"
      );

      if (editor) editor.open = true;
    },
    true
  );

  // Restore an admin tab from the URL hash.
  const initial = requestedHash;

  activate(
    legacyMusic ? "music" : nestedMatch ? nestedMatch[1] : panels.has(initial) ? initial : "mail",
    false
  );
});
