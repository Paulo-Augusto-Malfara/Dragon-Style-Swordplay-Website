/* RESPONSIVE NAVIGATION MENU */

(function respondiveNavigationMenu() {
  const toggleButton = document.getElementsByClassName("toggle-button")[0];
  const navbarLinks = document.getElementsByClassName("navbar-links")[0];
  const toggleButtonActive =
    document.getElementsByClassName("button-toggle")[0];

  toggleButton.addEventListener("click", () => {
    navbarLinks.classList.toggle("active");
    toggleButtonActive.classList.toggle("active");
  });
})();
