(function loadEssentials(){
  document.getElementById("myHead").innerHTML = `
<section>
  <div class="header-top">
    <div class="header-logo">
      <a id="logo-anchor" 
        href="/index.html"><img id="logo-ds" 
        src="/assets/img/logo-ds-landscape.png" 
        alt="Logo do Dragon Style Swordplay e Eventos"/>
      </a>
      <div id="header-icons-div">
        <a
          target="_blank "
          href="https://www.facebook.com/groups/227828760657044">
          <ion-icon class="header-icon" name="logo-facebook"></ion-icon>
        </a>
        <ion-icon class="header-icon" name="logo-instagram"></ion-icon>
        <ion-icon class="header-icon" name="logo-discord"></ion-icon>
        <a target="_blank"
          href="https://chat.whatsapp.com/J5KIqI5LsuBLqEecV5Fv34">
          <ion-icon class="header-icon" name="logo-whatsapp"></ion-icon>
        </a>
      </div>
    </div>
  </div>
</section>

<section>
  <nav class="nav">
    <div class="container">
      <div>
        <a href="#" class="toggle-button button-toggle">MENU</a>
      </div>
      <ul class="menu-main">
        <li><button class="menu-a">Sobre Nós</button>
          <div class="menu-sub">
            <ul>
              <li><a href="/assets/html/sobre-nos/o-grupo.html">Quem Somos</a></li>
              <li><a href="">O que é Swordplay?</a></li>
              <li><a href="">Como Participar</a></li>
              <li><a href="/assets/html/sobre-nos/historia-do-ds.html">História do DS</a></li>
              <li><a href="">Organização</a></li>                    
            </ul>              
          </div>
        </li>

        <li><button class="menu-a">Equipamentos</button>
          <div class="menu-sub">
            <ul>
              <li><a href="/assets/html/equipamentos/introducao.html">Introdução</a></li>
              <li><a href="">Armas Curtas</a></li>
              <li><a href="">Armas Médias</a></li>
              <li><a href="">Armas Longas</a></li>
              <li><a href="">Longo Alcance</a></li>
              <li><a href="">Arremessos</a></li>
              <li><a href="">Equipamentos Defensivos</a></li>
              <li><a href="">Vestimentas</a></li>
              <li><a href="">Como Forjar</a></li>
            </ul>
          </div>
        </li>
        <li><button class="menu-a">Classes</button>
          <div class="menu-sub">
            <ul>
              <li><a href="">Como Funciona</a></li>
              <li><a href="">Sistema de Mentor</a></li>
              <li><a href="">Arqueiro</a></li>
              <li><a href="">Bárbaro</a></li>
              <li><a href="">Cavaleiro</a></li>
              <li><a href="">Cruzado</a></li>
              <li><a href="">Espadachim</a></li>
              <li><a href="">Guerreiro</a></li>
              <li><a href="">Hoplita</a></li>
              <li><a href="">Ladino</a></li>
              <li><a href="">Lanceiro</a></li>
              <li><a href="">Viking</a></li>
            </ul>
          </div>
        </li>
        <li><button href="/assets/html/modalidades.html" class="menu-a">Modalidades</button></li>
      </ul>
    </div>
  </nav>
</section>
    `
  
})();

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
