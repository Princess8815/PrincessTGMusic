  const menuToggle = document.querySelector(".menu-toggle");
  const dropdownMenu = document.querySelector(".dropdown-menu");

  if (menuToggle && dropdownMenu) menuToggle.addEventListener("click", () => {
    dropdownMenu.classList.toggle("show");

    const isOpen = dropdownMenu.classList.contains("show");
    menuToggle.setAttribute("aria-expanded", isOpen);
  });

  document.addEventListener("click", (event) => {
    if (menuToggle && dropdownMenu && !event.target.closest(".menu-wrapper")) {
      dropdownMenu.classList.remove("show");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });