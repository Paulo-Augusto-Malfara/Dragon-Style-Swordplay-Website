$(document).ready(function() {
    // Função para atualizar os links da barra de navegação
    function atualizarLinks() {
        // Mapeia os links da barra de navegação
        $('nav a').each(function() {
            // Obtém o href do link atual
            var href = $(this).attr('href');
            
            // Verifica se o href começa com o caminho longo
            if (href.startsWith('/assets/html/classes/')) {
                // Atualiza o href com o caminho curto
                $(this).attr('href', '/' + href.split('/').pop());
            }
        });
    }
    // Chama a função para atualizar os links quando a página é carregada
    atualizarLinks();
});
