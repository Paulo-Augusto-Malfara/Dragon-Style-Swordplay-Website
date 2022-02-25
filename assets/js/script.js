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

(function dinamicModalidades() {
  //const toggleButton = document.querySelector(".modalidades-button");
  // toggleButton.addEventListener("click", () => {
  //   modalidadesConteudo.classList.toggle("active-modalidades");
  //   modalidadesH2.classList.toggle("active-modalidades");
  // });
  document.addEventListener("click", (e) => {
    const el = e.target;
    const modalidadesConteudo = document.getElementsByClassName("modalidades-conteudo")[document.activeElement.classList.value - 1];
    const modalidadesH2 = document.getElementsByClassName("h2-bottom-border")[document.activeElement.classList.value - 1];
    if (el.classList.contains("modalidades-button")) {
      modalidadesConteudo.classList.toggle("active-modalidades");
      modalidadesH2.classList.toggle("active-modalidades");
    }
    console.log (document.activeElement.classList.value);
  });
})();

// (function dinamicModalidadesTeste1() {
//   document.addEventListener("DOMContentLoaded", () => {
//     let myBtns = document.querySelectorAll(".modalidades-button");
//     let modalidadesConteudo = document.querySelectorAll(
//       ".modalidades-conteudo"
//     );
//     myBtns.forEach(function (btn) {
//       btn.addEventListener("click", () => {
//         modalidadesConteudo.forEach((b) =>
//           b.classList.remove("active-modalidades")
//         );
//         btn.classList.add("active-modalidades");
//       });
//     });
//   });
// })();
