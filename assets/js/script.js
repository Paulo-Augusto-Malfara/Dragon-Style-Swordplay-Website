(function loadEssentials() {
  fetch("/assets/include/header.html")
    .then((response) => response.text())
    .then((data) => {
      document.getElementById("myHead").innerHTML = data;
      initResponsiveNavigation();
      initDinamicModalidades();
    });
})();

/* RESPONSIVE NAVIGATION MENU */
function initResponsiveNavigation() {
  const toggleButton = document.querySelector(".toggle-button");
  const navbarLinks = document.querySelector(".menu-main");

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      if (navbarLinks) navbarLinks.classList.toggle("active");
      toggleButton.classList.toggle("active");
    });
  }
}

/* DINAMIC MODALIDADES */
function initDinamicModalidades() {
    const modalidadesContainer = document.querySelector(".modalidades");
    if (!modalidadesContainer) return;

    modalidadesContainer.addEventListener("click", (event) => {
        const button = event.target.closest(".modalidades-button");
        if (!button) return;

        event.preventDefault();

        const modalidadesBox = button.closest(".modalidades-box");
        if (!modalidadesBox) return;

        const content = modalidadesBox.querySelector(".modalidades-conteudo");
        const border = modalidadesBox.querySelector(".h2-bottom-border");

        if (content) {
            content.classList.toggle("active-modalidades");
        }
        if (border) {
            border.classList.toggle("active-modalidades");
        }
    });
}
