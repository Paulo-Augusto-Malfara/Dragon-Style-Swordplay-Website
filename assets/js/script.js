(function loadEssentials() {
  document.getElementById("myHead").innerHTML = `
  <section>
  <div class="header-top">
    <div class="header-logo">
      <a id="logo-anchor" href="/home"
        ><img
          id="logo-ds"
          src="/assets/img/logo-ds-landscape.png"
          alt="Logo do Dragon Style Swordplay e Eventos"
        />
      </a>
      <div id="header-icons-div">
        <a
          target="_blank"
          href="https://www.facebook.com/groups/227828760657044"
        >
          <ion-icon class="header-icon" name="logo-facebook"></ion-icon>
        </a>
        <a
          target="_blank"
          href="https://instagram.com/ds.swordplay?igshid=YmMyMTA2M2Y="
          ><ion-icon class="header-icon" name="logo-instagram"></ion-icon
        ></a>
        <!-- <ion-icon class="header-icon" name="logo-discord"></ion-icon> -->
        <a
          target="_blank"
          href="https://chat.whatsapp.com/J5KIqI5LsuBLqEecV5Fv34"
        >
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
        <a class="toggle-button button-toggle">MENU</a>
      </div>
      <ul class="menu-main">
        <li>
          <a class="menu-a">Sobre Nós</a>
          <div class="menu-sub">
            <ul>
              <li>
                <a href="/quem-somos">Quem Somos</a>
              </li>
              <li>
                <a href="/o-que-e-swordplay"
                  >O que é Swordplay?</a
                >
              </li>
              <li>
                <a href="/como-participar"
                  >Como Participar</a
                >
              </li>
              <li>
                <a href="/historia-do-ds"
                  >História do DS</a
                >
              </li>
              <li>
                <a href="/administracao"
                  >Administração</a
                >
              </li>
              <li>
                <a href="/doacoes">Doações</a>
              </li>
            </ul>
          </div>
        </li>

        <li>
          <a class="menu-a">Regulamentos</a>
          <div class="menu-sub">
            <ul>
              <li>
                <a href="/organizacao-dos-treinos"
                  >Organização dos Treinos</a
                >
              </li>
              <li>
                <a href="/codigo-de-conduta"
                  >Código de Conduta</a
                >
              </li>
              <li>
                <a href="/regras-de-combate"
                  >Regras de Combate</a
                >
              </li>
            </ul>
          </div>
        </li>

        <li>
          <a class="menu-a">Equipamentos</a>
          <div class="menu-sub">
            <ul>
              <li>
                <a href="/introducao"
                  >Introdução</a
                >
              </li>
              <li>
                <a href="/armas-curtas"
                  >Armas Curtas</a
                >
              </li>
              <li>
                <a href="/armas-medias"
                  >Armas Médias</a
                >
              </li>
              <li>
                <a href="/armas-longas"
                  >Armas Longas</a
                >
              </li>
              <li>
                <a href="/longo-alcance"
                  >Longo Alcance</a
                >
              </li>
              <li>
                <a href="/armas-de-arremesso"
                  >Armas de Arremesso</a
                >
              </li>
              <li>
                <a href="/escudos">Escudos</a>
              </li>
              <!--               <li>
                <a href="/vestimentas"
                  >Vestimentas</a
                >
              </li> -->
              <!-- <li><a>Como Forjar</a></li> -->
            </ul>
          </div>
        </li>
        <li>
          <a class="menu-a">Progressão</a>
          <div class="menu-sub">
            <ul>
              <li>
                <a href="/nivel-geral"
                  >Nível Geral e Graduações</a
                >
              </li>
              <li>
                <a href="/novato-x-veterano"
                  >Novato x Veterano</a
                >
              </li>
              <li>
                <a href="/pontos-de-honra"
                  >Pontos de Honra</a
                >
              </li>
              <!-- <li>
                <a href="/conquistas">Conquistas</a>
              </li> -->
            </ul>
          </div>
        </li>
        <li>
          <a class="menu-a">Classes</a>
          <div class="menu-sub">
            <ul>
              <li>
                <a href="/como-funciona"
                  >Como Funciona</a
                >
              </li>
              <li>
                <a href="/resumo-das-classes"
                  >Resumo das Classes</a
                >
              </li>
              <!--               <li>
                <a href="/bonus-nivel-3"
                  >Bônus de Nível 3</a
                >
              </li>
              <li>
                <a href="/mentor-de-classe"
                  >Mentor de Classe</a
                >
              </li> -->
              <li>
                <a href="/arqueiro">Arqueiro</a>
              </li>
              <li>
                <a href="/barbaro">Bárbaro</a>
              </li>
              <li>
                <a href="/cavaleiro">Cavaleiro</a>
              </li>
              <li>
                <a href="/espadachim">Espadachim</a>
              </li>
              <li>
                <a href="/guerreiro">Guerreiro</a>
              </li>
              <li>
                <a href="/hoplita">Hoplita</a>
              </li>
              <li>
                <a href="/lanceiro">Lanceiro</a>
              </li>
              <li>
                <a href="/sicario">Sicário</a>
              </li>
              <li>
                <a href="/templario">Templário</a>
              </li>
              <li>
                <a href="/viking">Viking</a>
              </li>
            </ul>
          </div>
        </li>
        <li>
          <a href="/modalidades" class="menu-a">Modalidades</a>
        </li>
        <li>
          <a href="/novidades" class="menu-a">Novidades</a>
        </li>
      </ul>
    </div>
  </nav>
</section>
    `;
})();

/* AJAX */

/* (function ajaxReqst() {
  const request = (obj) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(obj.method, obj.url, true);
      xhr.send();

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        } else {
          reject(xhr.statusText);
        }
      });
    });
  };

  document.addEventListener("click", (e) => {
    const el = e.target;
    const tag = el.tagName.toLowerCase();

    if (tag === "a") {
      e.preventDefault();
      carregaPagina(el);
    }
  });

  async function carregaPagina(el) {
    const href = el.getAttribute("href");
    try {
      const response = await request({
        method: "GET",
        url: href,
      });
      carregaResultado(response);
    } catch (e) {
      console.log(e);
    }
  }

  function carregaResultado(response) {
    const resultado = document.querySelector(".resultado");
    resultado.innerHTML = response;
  }
})(); */

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
  document.addEventListener("click", (evento) => {
    const el = evento.target;
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
