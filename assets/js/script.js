/* RESPONSIVE NAVIGATION MENU */

(function responsiveNavigationMenu() {
  const toggleButton = document.getElementsByClassName("toggle-button")[0];
  const navbarLinks = document.getElementsByClassName("navbar-links")[0];
  const toggleButtonActive =
    document.getElementsByClassName("button-toggle")[0];

  toggleButton.addEventListener("click", () => {
    navbarLinks.classList.toggle("active");
    toggleButtonActive.classList.toggle("active");
  });
})();

(function dinamicModalidades() {
  const ToggleButton = document.getElementsByClassName("modalidades-button")[0];
  const modalidadesConteudo = document.getElementsByClassName("modalidades-conteudo")[0];

  ToggleButton.addEventListener("click", () => {
    modalidadesConteudo.classList.toggle("active-modalidades");
  });
})();
