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

/* FUNÇÃO QUE FUNCIONA SOMENTE NO 1º BOTÃO */

/* (function dinamicModalidades() {
  const toggleButton = document.getElementsByClassName("modalidades-button")[0];
  const modalidadesConteudo = document.getElementsByClassName(
    "modalidades-conteudo"
  )[0];
  const modalidadesH2 = document.getElementsByClassName("h2-bottom-border")[0];

  toggleButton.addEventListener("click", () => {
    modalidadesConteudo.classList.toggle("active-modalidades");
    modalidadesH2.classList.toggle("active-modalidades");
  });
})(); */

(function dinamicModalidadesTeste1() {
  document.addEventListener("DOMContentLoaded", () => {
    let myBtns = document.querySelectorAll(".modalidades-button");
    let modalidadesConteudo = document.querySelectorAll(
      ".modalidades-conteudo"
    );
    myBtns.forEach(function (btn) {
      btn.addEventListener("click", () => {
        modalidadesConteudo.forEach((b) =>
          b.classList.remove("active-modalidades")
        );
        btn.classList.add("active-modalidades");
      });
    });
  });
})();
