// (function loadEssentials(){
//   document.getElementById("myHead").innerHTML = `
// <section>
//   <div class="header-top">
//     <div class="header-logo">
//       <a id="logo-anchor"
//         href="/index.html"><img id="logo-ds"
//         src="/assets/img/logo-ds-landscape.png"
//         alt="Logo do Dragon Style Swordplay e Eventos"/>
//       </a>
//       <div id="header-icons-div">
//         <a
//           target="_blank "
//           href="https://www.facebook.com/groups/227828760657044">
//           <ion-icon class="header-icon" name="logo-facebook"></ion-icon>
//         </a>
//         <ion-icon class="header-icon" name="logo-instagram"></ion-icon>
//         <ion-icon class="header-icon" name="logo-discord"></ion-icon>
//         <a target="_blank"
//           href="https://chat.whatsapp.com/J5KIqI5LsuBLqEecV5Fv34">
//           <ion-icon class="header-icon" name="logo-whatsapp"></ion-icon>
//         </a>
//       </div>
//     </div>
//   </div>
// </section>

// <section>
//   <nav class="nav">
//     <div class="container">
//       <div>
//         <a href="#" class="toggle-button button-toggle">MENU</a>
//       </div>
//       <ul class="menu-main">
//         <li><button class="menu-a">Sobre Nós</button>
//           <div class="menu-sub">
//             <ul>
//               <li><a href="/assets/html/sobre-nos/o-grupo.html">Quem Somos</a></li>
//               <li><a href="">O que é Swordplay?</a></li>
//               <li><a href="">Como Participar</a></li>
//               <li><a href="/assets/html/sobre-nos/historia-do-ds.html">História do DS</a></li>
//               <li><a href="">Organização</a></li>
//             </ul>
//           </div>
//         </li>

//         <li><button class="menu-a">Equipamentos</button>
//           <div class="menu-sub">
//             <ul>
//               <li><a href="/assets/html/equipamentos/introducao.html">Introdução</a></li>
//               <li><a href="">Armas Curtas</a></li>
//               <li><a href="">Armas Médias</a></li>
//               <li><a href="">Armas Longas</a></li>
//               <li><a href="">Longo Alcance</a></li>
//               <li><a href="">Arremessos</a></li>
//               <li><a href="">Equipamentos Defensivos</a></li>
//               <li><a href="">Vestimentas</a></li>
//               <li><a href="">Como Forjar</a></li>
//             </ul>
//           </div>
//         </li>
//         <li><button class="menu-a">Classes</button>
//           <div class="menu-sub">
//             <ul>
//               <li><a href="">Como Funciona</a></li>
//               <li><a href="">Sistema de Mentor</a></li>
//               <li><a href="">Arqueiro</a></li>
//               <li><a href="">Bárbaro</a></li>
//               <li><a href="">Cavaleiro</a></li>
//               <li><a href="">Cruzado</a></li>
//               <li><a href="">Espadachim</a></li>
//               <li><a href="">Guerreiro</a></li>
//               <li><a href="">Hoplita</a></li>
//               <li><a href="">Ladino</a></li>
//               <li><a href="">Lanceiro</a></li>
//               <li><a href="">Viking</a></li>
//             </ul>
//           </div>
//         </li>
//         <li><button href="/assets/html/modalidades.html" class="menu-a">Modalidades</button></li>
//       </ul>
//     </div>
//   </nav>
// </section>
//     `

// })();

/* AJAX */

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

/* SLIDES */

let slideIndex = 1;
showDivs(slideIndex);

function plusDivs(n) {
  showDivs(slideIndex += n);
}

function showDivs(n) {
  let i;
  let x = document.getElementsByClassName("mySlides");
  if (n > x.length) {slideIndex = 1}
  if (n < 1) {slideIndex = x.length} ;
  for (i = 0; i < x.length; i++) {
    x[i].style.display = "none";
  }
  x[slideIndex-1].style.display = "block";
}

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
