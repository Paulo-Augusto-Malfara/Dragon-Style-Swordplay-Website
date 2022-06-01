(function loadEssentials() {
  document.getElementById("myHead").innerHTML = `
  <section>
  <div class="header-top">
    <div class="header-logo">
      <a id="logo-anchor" href="/index.html"
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
                <a href="/assets/html/sobre-nos/quem-somos.html">Quem Somos</a>
              </li>
              <li>
                <a href="/assets/html/sobre-nos/o-que-e-swordplay.html"
                  >O que é Swordplay?</a
                >
              </li>
              <li>
                <a href="/assets/html/sobre-nos/como-participar.html"
                  >Como Participar</a
                >
              </li>
              <li>
                <a href="/assets/html/sobre-nos/historia-do-ds.html"
                  >História do DS</a
                >
              </li>
              <li>
                <a href="/assets/html/sobre-nos/administracao.html"
                  >Administração</a
                >
              </li>
              <li>
                <a href="/assets/html/sobre-nos/doacoes.html">Doações</a>
              </li>
            </ul>
          </div>
        </li>

        <li>
          <a class="menu-a">Regulamentos</a>
          <div class="menu-sub">
            <ul>
              <li>
                <a href="/assets/html/regulamentos/organizacao-dos-treinos.html"
                  >Organização dos Treinos</a
                >
              </li>
              <li>
                <a href="/assets/html/regulamentos/codigo-de-conduta.html"
                  >Código de Conduta</a
                >
              </li>
              <li>
                <a href="/assets/html/regulamentos/regras-de-combate.html"
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
                <a href="/assets/html/equipamentos/introducao.html"
                  >Introdução</a
                >
              </li>
              <li>
                <a href="/assets/html/equipamentos/armas-curtas.html"
                  >Armas Curtas</a
                >
              </li>
              <li>
                <a href="/assets/html/equipamentos/armas-medias.html"
                  >Armas Médias</a
                >
              </li>
              <li>
                <a href="/assets/html/equipamentos/armas-longas.html"
                  >Armas Longas</a
                >
              </li>
              <li>
                <a href="/assets/html/equipamentos/longo-alcance.html"
                  >Longo Alcance</a
                >
              </li>
              <li>
                <a href="/assets/html/equipamentos/armas-de-arremesso.html"
                  >Armas de Arremesso</a
                >
              </li>
              <li>
                <a href="/assets/html/equipamentos/escudos.html">Escudos</a>
              </li>
              <!--               <li>
                <a href="/assets/html/equipamentos/vestimentas.html"
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
                <a href="/assets/html/progressao/nivel-geral.html"
                  >Nível Geral e Graduações</a
                >
              </li>
              <li>
                <a href="/assets/html/progressao/novato-x-veterano.html"
                  >Novato x Veterano</a
                >
              </li>
              <li>
                <a href="/assets/html/progressao/pontos-de-honra.html"
                  >Pontos de Honra</a
                >
              </li>
              <!-- <li>
                <a href="/assets/html/progressao/conquistas.html">Conquistas</a>
              </li> -->
            </ul>
          </div>
        </li>
        <li>
          <a class="menu-a">Classes</a>
          <div class="menu-sub">
            <ul>
              <li>
                <a href="/assets/html/classes/como-funciona.html"
                  >Como Funciona</a
                >
              </li>
              <li>
                <a href="/assets/html/classes/resumo-das-classes.html"
                  >Resumo das Classes</a
                >
              </li>
              <!--               <li>
                <a href="/assets/html/classes/bonus-nivel-3.html"
                  >Bônus de Nível 3</a
                >
              </li>
              <li>
                <a href="/assets/html/classes/mentor-de-classe.html"
                  >Mentor de Classe</a
                >
              </li> -->
              <li>
                <a href="/assets/html/classes/arqueiro.html">Arqueiro</a>
              </li>
              <li>
                <a href="/assets/html/classes/barbaro.html">Bárbaro</a>
              </li>
              <li>
                <a href="/assets/html/classes/cavaleiro.html">Cavaleiro</a>
              </li>
              <li>
                <a href="/assets/html/classes/espadachim.html">Espadachim</a>
              </li>
              <li>
                <a href="/assets/html/classes/guerreiro.html">Guerreiro</a>
              </li>
              <li>
                <a href="/assets/html/classes/hoplita.html">Hoplita</a>
              </li>
              <li>
                <a href="/assets/html/classes/lanceiro.html">Lanceiro</a>
              </li>
              <li>
                <a href="/assets/html/classes/sicario.html">Sicário</a>
              </li>
              <li>
                <a href="/assets/html/classes/templario.html">Templário</a>
              </li>
              <li>
                <a href="/assets/html/classes/viking.html">Viking</a>
              </li>
            </ul>
          </div>
        </li>
        <li>
          <a href="/assets/html/modalidades.html" class="menu-a">Modalidades</a>
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
