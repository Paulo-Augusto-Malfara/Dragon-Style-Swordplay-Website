/* RESPONSIVE NAVIGATION MENU */

(function responsiveNavigationMenu() {
  const toggleButton = document.getElementsByClassName("toggle-button")[0];
  const navbarLinks = document.getElementsByClassName("menu-main")[0];
  const toggleButtonActive =
    document.getElementsByClassName("button-toggle")[0];

  toggleButton.addEventListener("click", () => {
    navbarLinks.classList.toggle("active");
    toggleButtonActive.classList.toggle("active");
  });
})();

(function dinamicModalidades() {
  document.addEventListener("click", (e) => {
    const el = e.target;
    const modalidadesConteudo = document.getElementsByClassName(
      "modalidades-conteudo"
    )[document.activeElement.classList.value - 1];
    const modalidadesH2 =
      document.getElementsByClassName("h2-bottom-border")[
        document.activeElement.classList.value - 1
      ];
    if (el.classList.contains("modalidades-button")) {
      modalidadesConteudo.classList.toggle("active-modalidades");
      modalidadesH2.classList.toggle("active-modalidades");
    }
    console.log(document.activeElement.classList.value);
  });
})();
