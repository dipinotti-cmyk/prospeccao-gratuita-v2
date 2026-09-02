-- =====================================================================
-- 2026-09-02 · Direcao PREMIUM da mensagem de prospeccao
-- =====================================================================
-- Por que esta migracao existe:
-- O Diogo reprovou os textos gerados na primeira rodada do pivot de
-- e-commerce. Quatro defeitos, todos com origem AQUI, nos campos por nicho:
--
--   1. demo_fechamento prometia trabalho de graca em 4 nichos
--      ("Quer ver como ficaria com o catalogo de voces?"). Isso obriga o
--      Diogo a montar uma loja pro sujeito ANTES de vender. Agora toda
--      pergunta de fechamento QUALIFICA: faixa de preco, canal da venda,
--      alcance geografico.
--   2. solucao falava de dor generica ("pega quem pesquisa de madrugada").
--      Agora fala de dinheiro de produto CARO.
--   3. tom mandava "proximo, sem giria" — tom de quem pede permissao.
--      Agora e o tom de parceiro certificado que escolhe cliente.
--   4. pedido_demo era lido pelo codigo como "sobre pedir demonstracao
--      gratis". O campo mantem o nome (nao vale migrar coluna por isso),
--      mas o CONTEUDO agora e a prova que se cita, nao a demo que se oferece.
--
-- O que NAO muda: demo_url, demo_tipo e demo_quem dos 4 nichos com case
-- real (semijoias-joias, boutique-moda-feminina, moda-crista,
-- decoracao-casa). Case novo nao se inventa.
--
-- Contexto: lupixa-agents/docs/prospeccao-mensagem-premium.md
-- Codigo que consome: lib/generateMessage.js (comentario "02/09/2026 (2)")
-- =====================================================================

-- ---------------------------------------------------------------------
-- JOIAS E ACESSORIOS
-- ---------------------------------------------------------------------

update prospeccao_niches set
  tom = 'de igual pra igual, seco e seguro. Quem vende joia entende de margem e de cliente que pesquisa antes; nada de intimidade forcada, nada de elogio empilhado',
  solucao = 'loja Nuvemshop com preco na pagina, foto de detalhe e checkout com frete calculado: a peca cara fecha sem o cliente ter que pedir preco no direct, que e onde a venda decidida costuma morrer',
  elogio_sugestao = 'no maximo uma linha reconhecendo nota ou volume de avaliacoes, e so se estiver no briefing. Nunca supor material, preco ou origem da peca',
  pedido_demo = 'parceiro certificado Nuvemshop; a loja da Settima, joalheria de ouro 18k, foi migrada e esta no ar',
  demo_olhar = '· o preco junto de cada peca, sem precisar perguntar
· a foto de detalhe que mostra o acabamento de perto
· o frete calculado e o prazo antes de fechar',
  demo_fechamento = 'Qual a faixa de preco das pecas que mais saem hoje?'
where slug = 'semijoias-joias';

update prospeccao_niches set
  tom = 'direto e tecnico, de quem sabe que relogio se vende por confianca e procedencia, nao por desconto',
  solucao = 'loja Nuvemshop com ficha de cada modelo, preco e garantia na tela: quem procura relogio especifico compara antes e nao abre conversa pra perguntar preco',
  elogio_sugestao = 'so a nota ou o volume de avaliacoes, se houver. Nunca supor marca trabalhada nem se e novo ou usado',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de ticket alto ja entregues',
  demo_olhar = '· a ficha de cada peca com preco na tela
· o carrinho com frete e prazo calculados
· a busca por tipo de peca',
  demo_fechamento = 'Hoje voces vendem so pra quem vai na loja, ou ja mandam pra fora?'
where slug = 'relojoaria';

update prospeccao_niches set
  tom = 'pratico e claro, sem jargao de otica; quem compra oculos de sol decide por modelo e preco',
  solucao = 'loja Nuvemshop com catalogo por modelo e marca, preco na pagina e checkout proprio, pra vender o oculos de sol sem depender de quem entra na loja',
  elogio_sugestao = 'uma linha sobre reputacao, so se o briefing trouxer nota ou avaliacoes',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de acessorio ja no ar',
  demo_olhar = '· cada modelo com foto e preco na mesma tela
· o filtro por tipo e por marca
· o frete calculado no carrinho',
  demo_fechamento = 'Quanto da venda de voces sai hoje pelo direct?'
where slug = 'oticas-oculos';

update prospeccao_niches set
  tom = 'direto, de quem entende que bolsa boa se vende pela foto e pelo acabamento',
  solucao = 'loja Nuvemshop com foto de detalhe, medidas e preco na pagina: a bolsa de ticket alto fecha sozinha quando o cliente ve tudo sem precisar perguntar',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver. Nunca supor material nem faixa de preco',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de moda e acessorio entregues',
  demo_olhar = '· a foto de detalhe que mostra o acabamento
· as medidas e o preco na mesma pagina
· o frete calculado antes de fechar',
  demo_fechamento = 'Voces ja vendem pra fora da cidade hoje?'
where slug = 'bolsas-e-acessorios';

-- ---------------------------------------------------------------------
-- MODA
-- ---------------------------------------------------------------------

update prospeccao_niches set
  tom = 'de igual pra igual com quem ja vende bem, sem giria de vendedor e sem ensinar o oficio dela',
  solucao = 'loja Nuvemshop puxando o catalogo que ja existe no Instagram, com tabela de medidas e frete calculado: a venda deixa de sair uma peca por conversa no direct',
  elogio_sugestao = 'citar nota ou avaliacoes se aparecerem no briefing, nunca inventar volume de venda',
  pedido_demo = 'parceiro certificado Nuvemshop; a loja da Joley, boutique de moda feminina em Paulinia, esta no ar',
  demo_olhar = '· o frete gratis regional na barra do topo
· cada peca com varias fotos e tabela de medidas
· o catalogo ligado ao Instagram Shopping',
  demo_fechamento = 'Quanto da venda de voces sai hoje pelo direct?'
where slug = 'boutique-moda-feminina';

update prospeccao_niches set
  tom = 'respeitoso e direto, sem apelar pra religiao como argumento de venda',
  solucao = 'loja Nuvemshop com catalogo proprio e checkout: o publico de moda crista costuma estar espalhado pelo pais, e por conversa so fecha quem esta perto',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing sustentar',
  pedido_demo = 'parceiro certificado Nuvemshop; a Avina, moda crista com moletons bordados, esta no ar',
  demo_olhar = '· o catalogo separado por tipo de peca
· a foto do bordado de perto
· o frete calculado pro Brasil inteiro',
  demo_fechamento = 'Voces ja vendem pra fora do estado hoje?'
where slug = 'moda-crista';

update prospeccao_niches set
  tom = 'leve e direto, de quem sabe que moda praia vende por estacao e por foto',
  solucao = 'loja Nuvemshop com grade de tamanho, foto de cada estampa e checkout: pega a cliente de outra cidade que hoje nao tem como comprar',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de moda ja entregues',
  demo_olhar = '· cada peca com varias fotos e tabela de medidas
· a grade de tamanho aparecendo antes de comprar
· o frete calculado no carrinho',
  demo_fechamento = 'Voces ja vendem pra fora da cidade hoje?'
where slug = 'moda-praia';

update prospeccao_niches set
  tom = 'direto e sem diminutivo; quem faz roupa infantil autoral vende acabamento, nao fofura',
  solucao = 'loja Nuvemshop com grade por idade, foto de detalhe e checkout, pra vender a peca autoral pra avo que mora em outro estado',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing trouxer',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de moda ja no ar',
  demo_olhar = '· a grade por tamanho e idade
· a foto que mostra o tecido de perto
· o frete calculado antes de fechar',
  demo_fechamento = 'Voces ja vendem pra fora do estado hoje?'
where slug = 'moda-infantil-premium';

update prospeccao_niches set
  tom = 'seco e objetivo, do jeito que homem que compra alfaiataria decide: medida, tecido, prazo',
  solucao = 'loja Nuvemshop com ficha de tecido, medidas e prazo na tela: quem compra terno pesquisa sozinho antes e nao abre conversa pra perguntar preco',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de moda de ticket alto entregues',
  demo_olhar = '· a ficha de tecido e medidas na propria pagina
· o preco visivel sem precisar perguntar
· o prazo de entrega antes de fechar',
  demo_fechamento = 'Qual a faixa de preco do que mais sai hoje?'
where slug = 'moda-masculina-alfaiataria';

update prospeccao_niches set
  tom = 'direto e sem discurso de autoestima; quem vende plus size autoral sabe que o problema e grade e medida',
  solucao = 'loja Nuvemshop com tabela de medidas real por peca e checkout: a cliente que hoje pergunta medida no direct compra sozinha quando a medida esta na tela',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing sustentar',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de moda ja no ar',
  demo_olhar = '· a tabela de medidas peca por peca
· varias fotos da mesma peca
· o frete calculado pro Brasil inteiro',
  demo_fechamento = 'Quanto da venda de voces sai hoje pelo direct?'
where slug = 'moda-plus-size-autoral';

update prospeccao_niches set
  tom = 'discreto e profissional; lingerie exige privacidade, nao intimidade',
  solucao = 'loja Nuvemshop com grade, medidas e checkout proprio: muita cliente nao pergunta tamanho por mensagem, e compra sozinha quando o dado esta na pagina',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de moda entregues',
  demo_olhar = '· a tabela de medidas em cada peca
· a grade de tamanho antes de comprar
· o frete calculado no carrinho',
  demo_fechamento = 'Voces ja vendem pra fora da cidade hoje?'
where slug = 'lingerie-moda-intima';

update prospeccao_niches set
  tom = 'direto e de quem entende couro: acabamento, numeracao e procedencia',
  solucao = 'loja Nuvemshop com numeracao, foto de detalhe do couro e preco na pagina, pra fechar o par caro sem depender de conversa',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing trouxer',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de ticket alto ja no ar',
  demo_olhar = '· a numeracao disponivel aparecendo na pagina
· a foto que mostra o acabamento de perto
· o frete calculado antes de fechar',
  demo_fechamento = 'Qual a faixa de preco do que mais sai hoje?'
where slug = 'calcados-premium';

-- ---------------------------------------------------------------------
-- CASA E DECORACAO
-- ---------------------------------------------------------------------

update prospeccao_niches set
  tom = 'calmo e concreto, de quem sabe que peca de decoracao se vende por foto boa e medida certa',
  solucao = 'loja Nuvemshop com medida, foto em ambiente e frete calculado por peso: peca grande so fecha pra fora da cidade quando o frete aparece na tela antes',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver. Nunca supor material nem processo de producao',
  pedido_demo = 'parceiro certificado Nuvemshop; a loja da Ceramica Reserva esta no ar',
  demo_olhar = '· a medida de cada peca junto da foto
· a foto da peca no ambiente
· o frete calculado por peso antes de fechar',
  demo_fechamento = 'Peca grande voces entregam so na regiao ou ja mandam pro Brasil?'
where slug = 'decoracao-casa';

update prospeccao_niches set
  tom = 'tecnico e direto: quem compra iluminacao decide por medida, potencia e acabamento',
  solucao = 'loja Nuvemshop com ficha tecnica, medida e frete calculado: luminaria e compra pesquisada, e quem pesquisa nao pede ficha por mensagem',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing sustentar',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de decoracao ja entregues',
  demo_olhar = '· a ficha tecnica junto da foto
· a medida exata de cada peca
· o frete calculado por peso',
  demo_fechamento = 'Voces ja vendem pra fora do estado hoje?'
where slug = 'iluminacao-decorativa';

update prospeccao_niches set
  tom = 'direto e sem poesia de enxoval; quem compra cama e mesa premium olha composicao e fio',
  solucao = 'loja Nuvemshop com composicao, medida e preco na pagina: enxoval de ticket alto se compara antes, e comparacao nao acontece no direct',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de casa e decoracao no ar',
  demo_olhar = '· a composicao e a medida de cada item
· o preco na mesma tela da foto
· o frete calculado antes de fechar',
  demo_fechamento = 'Qual a faixa de preco do que mais sai hoje?'
where slug = 'cama-mesa-banho-premium';

update prospeccao_niches set
  tom = 'organizado e direto, de quem sabe que papelaria fina vende por acabamento e prazo',
  solucao = 'loja Nuvemshop com opcao de personalizacao e prazo na tela: pedido personalizado consome conversa inteira no direct antes de virar venda',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing trouxer',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de produto autoral entregues',
  demo_olhar = '· as opcoes de personalizacao antes de comprar
· o prazo de producao na propria pagina
· o frete calculado no carrinho',
  demo_fechamento = 'Quanto da venda de voces sai hoje pelo direct?'
where slug = 'papelaria-personalizada';

-- ---------------------------------------------------------------------
-- BELEZA E BEM-ESTAR
-- ---------------------------------------------------------------------

update prospeccao_niches set
  tom = 'direto e informativo; perfumaria vende por marca, volume e procedencia',
  solucao = 'loja Nuvemshop com volume, preco e procedencia na pagina: perfume caro se compara antes, e quem compara nao abre conversa',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver. Nunca supor marca trabalhada',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de ticket alto ja no ar',
  demo_olhar = '· o volume e o preco na mesma tela
· o filtro por marca
· o frete calculado antes de fechar',
  demo_fechamento = 'Voces ja vendem pra fora da cidade hoje?'
where slug = 'perfumaria-cosmeticos';

update prospeccao_niches set
  tom = 'objetivo e sem promessa de resultado; suplemento se vende por composicao e preco',
  solucao = 'loja Nuvemshop com composicao, dose e recompra facil: cliente de suplemento compra todo mes e nao quer abrir conversa toda vez',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing sustentar. Nunca prometer efeito nem resultado',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de semijoias, moda e decoracao ja no ar',
  demo_olhar = null,
  demo_fechamento = 'Quanto da venda de voces e de cliente que compra todo mes?'
where slug = 'suplementos-nutricao-premium';

-- ---------------------------------------------------------------------
-- GASTRONOMIA E PRESENTES
-- ---------------------------------------------------------------------

update prospeccao_niches set
  tom = 'direto e sem afetacao de sommelier; emporio vende curadoria e procedencia',
  solucao = 'loja Nuvemshop com rotulo, safra e preco na pagina, e frete calculado: garrafa cara so sai pra fora da cidade quando o frete aparece antes',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de ticket alto no ar',
  demo_olhar = '· o rotulo e a descricao na mesma tela do preco
· o filtro por tipo e por faixa de preco
· o frete calculado antes de fechar',
  demo_fechamento = 'Voces ja entregam pra fora da cidade hoje?'
where slug = 'emporio-gourmet';

update prospeccao_niches set
  tom = 'direto e concreto; chocolate fino vende por foto, prazo e cuidado no envio',
  solucao = 'loja Nuvemshop com caixa montada, prazo e frete refrigerado na tela: encomenda de presente vira conversa longa no direct e boa parte nao fecha',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing trouxer',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de produto autoral entregues',
  demo_olhar = '· as opcoes de caixa e montagem antes de comprar
· o prazo de producao na pagina
· o frete calculado no carrinho',
  demo_fechamento = 'Quanto da venda de voces sai hoje pelo direct?'
where slug = 'chocolateria-doces-finos';

update prospeccao_niches set
  tom = 'direto e pratico; loja de presente vive de data e de decisao rapida',
  solucao = 'loja Nuvemshop com embalagem de presente, cartao e prazo na tela: em data comemorativa o direct entope e o pedido que espera resposta some',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de semijoias, moda e decoracao ja no ar',
  demo_olhar = null,
  demo_fechamento = 'Em data comemorativa, quanto de pedido voces perdem por nao dar conta de responder?'
where slug = 'presentes-curadoria';

-- ---------------------------------------------------------------------
-- PET E BEBE
-- ---------------------------------------------------------------------

update prospeccao_niches set
  tom = 'direto e sem infantilizar o dono do pet; produto premium vende por composicao e marca',
  solucao = 'loja Nuvemshop com marca, peso e recompra facil: cliente de pet compra racao e petisco todo mes e nao quer pedir por mensagem toda vez',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing sustentar',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de semijoias, moda e decoracao ja no ar',
  demo_olhar = null,
  demo_fechamento = 'Quanto da venda de voces e de cliente que compra todo mes?'
where slug = 'pet-shop-premium';

update prospeccao_niches set
  tom = 'calmo e cuidadoso, sem melar o texto; enxoval de bebe e compra planejada e cara',
  solucao = 'loja Nuvemshop com composicao, medida e lista de enxoval: quem monta enxoval compara por semanas antes de decidir, e comparacao nao acontece no direct',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de ticket alto ja no ar',
  demo_olhar = '· a composicao e a medida de cada item
· o preco visivel sem precisar perguntar
· o frete calculado antes de fechar',
  demo_fechamento = 'Qual a faixa de preco do que mais sai hoje?'
where slug = 'enxoval-bebe-luxo';

-- ---------------------------------------------------------------------
-- COZINHA · ARTE · FLORICULTURA
-- ---------------------------------------------------------------------

update prospeccao_niches set
  tom = 'tecnico e direto; utensilio premium vende por material, medida e garantia',
  solucao = 'loja Nuvemshop com material, medida e garantia na pagina: panela e faca de ticket alto sao compra pesquisada, e quem pesquisa nao abre conversa',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing trouxer',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de ticket alto entregues',
  demo_olhar = '· o material e a medida junto do preco
· a garantia na propria pagina
· o frete calculado antes de fechar',
  demo_fechamento = 'Voces ja vendem pra fora do estado hoje?'
where slug = 'utensilios-cozinha-premium';

update prospeccao_niches set
  tom = 'sobrio e respeitoso com a peca; quem vende arte e antiguidade vende procedencia, nao volume',
  solucao = 'loja Nuvemshop com ficha de procedencia, medida e foto de detalhe: peca unica de ticket alto perde comprador de outra cidade quando so existe no direct',
  elogio_sugestao = 'uma linha sobre nota ou avaliacoes, se houver. Nunca supor epoca, autor ou valor da peca',
  pedido_demo = 'parceiro certificado Nuvemshop, com loja de decoracao autoral e joalheria de ticket alto ja no ar',
  demo_olhar = null,
  demo_fechamento = 'Qual a faixa de preco das pecas que mais saem hoje?'
where slug = 'arte-antiguidades-galeria';

update prospeccao_niches set
  tom = 'direto e pratico; floricultura de alto padrao vive de data, prazo e entrega certa',
  solucao = 'loja Nuvemshop com arranjo montado, cartao e janela de entrega na tela: pedido de flor e urgente, e o que espera resposta no direct vira venda perdida no mesmo dia',
  elogio_sugestao = 'uma linha sobre reputacao, se o briefing sustentar',
  pedido_demo = 'parceiro certificado Nuvemshop, com lojas de semijoias, moda e decoracao ja no ar',
  demo_olhar = null,
  demo_fechamento = 'Em data comemorativa, quanto de pedido voces perdem por nao dar conta de responder?'
where slug = 'floricultura-eventos-luxo';

-- ---------------------------------------------------------------------
-- demo_olhar so faz sentido quando existe demo_url: ele descreve a loja do
-- case ("preco na pagina", "frete no carrinho"). Nicho sem case manda o
-- lead pra home do site, que e portfolio, nao loja — e o codigo ja ignora
-- demo_olhar nesse caminho. Zerar aqui evita que um bullet generico vire
-- descricao errada no dia em que o nicho ganhar um case de verdade: quem
-- cadastrar o case escreve o olhar daquela loja.
-- ---------------------------------------------------------------------
update prospeccao_niches set demo_olhar = null where demo_url is null;

-- =====================================================================
-- Conferencia: nenhum fechamento pode prometer trabalho de graca.
-- Espera-se 0 linha neste select.
-- =====================================================================
select slug, demo_fechamento
from prospeccao_niches
where demo_fechamento ilike '%como ficaria%'
   or demo_fechamento ilike '%que eu monte%'
   or demo_fechamento ilike '%te mostre%'
   or demo_fechamento ilike '%topa%';
