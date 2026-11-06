Secretfans é a plataforma social que conecta criadores e fãs: o criador monetiza conteúdo exclusivo e o apoiador paga uma assinatura mensal. A marca fala de **desejo, segredo e conexão**.

O **Rebrand 2026** (logo coração-cadeado, estética neon sobre fundo escuro) é a identidade atual e o tema padrão `neon`. O BrandBook 2022 (coração-cadeado com chifres, vermelho + roxo) segue documentado em *Identidade 2022 (legado)* e nos temas `light`/`dark`, para peças antigas e transição.

## Conteúdo e tom

- Fale com o criador e o fã por **você**, em português do Brasil. Frases curtas, afirmativas, com uma virada: "Mais que conteúdo. **É conexão.**", "Uma nova fase **começa.**", "Sua imagem é sua marca. **Seu conteúdo tem valor.**"
- Pilares que se repetem: **conteúdo exclusivo, conexões reais, liberdade, privacidade e segurança**. Assinaturas oficiais em `tagline`: "CONTEÚDO • CONEXÃO • LIBERDADE" (principal), "CONTEÚDO EXCLUSIVO. CONEXÕES REAIS.", "CONTEÚDO REAL · CONEXÕES DE VERDADE".
- Verbos de benefício no imperativo, em caixa alta e `accent-text`: MONETIZE, CONSTRUA, PROTEJA, FORTALEÇA, EXPLORE, SEJA VOCÊ — com uma linha curta de apoio em `ink-muted`.
- Frases script: "Aqui tem mais.", "Também merece espaço.", "O segredo é viver do seu jeito.", "Liberdade tem mais sentido aqui."
- CTA: "FAÇA SEU PRÉ-CADASTRO", "PRÉ-CADASTRO ABERTO!", "EM BREVE", "Faça parte dessa experiência".
- Escreva **Secretfans** em texto corrido (o wordmark é desenho). Hashtag: **#sejasecret**.
- Sensual, nunca explícito. Sem emoji decorativo; use os ícones de linha.

## Cores (Rebrand 2026)

- Base escura: `noite` como fundo, `vinho` para cards, `vinho-borda` no contorno fino.
- Rosa como única cor de marca: `rosa-neon` (CTA, ícones, glow, "fans" do wordmark), `rosa-claro` (palavras de destaque nos títulos), `rosa-profundo` (fim do degradê e botões com rótulo pequeno).
- Texto em `ink` (branco) e `ink-muted`; destaque em `accent-text`.
- Degradê de destaque: `linear-gradient(90deg, var(--rosa-claro), var(--rosa-neon))` em palavras-chave do título; CTA `linear-gradient(90deg, var(--rosa-neon), var(--rosa-profundo))`.
- Branco sobre `rosa-neon` dá 3.77:1: use só em rótulos bold ≥19px (o estilo `cta`). Para rótulos menores, fundo `rosa-profundo` (4.85:1).
- Cores amostradas das peças finais (não há manual 2026 com Pantone/CMYK); confirme com o designer antes de impressos.

## Cores de status

- `success`, `warning` e `danger` só comunicam estado (aprovado, em análise, erro). Rosa continua sendo a única cor de marca e nunca indica erro.
- Use em texto, ícone e contorno sobre `surface`/`surface-alt`; não preencha grandes áreas. Botão destrutivo é contorno `danger`.
- No tema `neon`, não use `vermelho-claro`/`vermelho-escuro` (2022) para erro.

## Tipografia (Rebrand 2026)

- **Montserrat** em tudo: títulos `hero` (extrabold, leading apertado) e `hero-italic` (black itálico caixa alta), `feature-title`, `body`, `label`.
- `tagline`: caixa alta com tracking 0.4em, sob o logo e como rótulo de seção ("PARA CRIADORES", "REBRAND").
- `script-accent`: frase manuscrita de apoio ("Liberdade tem mais sentido aqui.", "Seja a sua melhor versão"), em `accent-text`, uma por peça. Fonte aproximada (Yellowtail); troque pela original se houver.
- O wordmark usa um desenho próprio geométrico arredondado — nunca recomponha com fonte; use os arquivos de `assets/Logo 2026/`.

## Logo (Rebrand 2026)

- Logo oficial: **coração-cadeado** volumétrico rosa (coração com fechadura e alça de cadeado) + wordmark "Secret" em branco e "fans" em `rosa-neon`, geométrico arredondado.
- `logo-cadeado-horizontal.png`: versão padrão — topo de posts, header do site/app.
- `logo-cadeado-assinatura.png`: com a assinatura "CONTEÚDO • CONEXÃO • LIBERDADE" em `tagline` — capa de posts e abertura.
- `simbolo-coracao-cadeado.png`: só o símbolo — avatar, favicon, marca d'água, tela do celular nas fotos.
- Sempre sobre fundo escuro (`noite`, `vinho` ou foto escurecida). Os arquivos são raster recortados das peças (sem transparência, resolução baixa); peça ao designer o vetor SVG/PDF para impressos, fundos claros e tamanhos grandes.
- Não distorcer, rotacionar, recolorir, nem recompor o wordmark com fonte. Respiro mínimo = altura da alça do cadeado.
- O símbolo S-coração foi descontinuado (`assets/Logo S (descontinuado)/`); o teaser antigo ainda o usa.

## Site (home) e componentes

Layout da home web, fundo `noite`:
- **Topbar**: logo horizontal à esquerda, busca em pílula (`surface-alt`, `radius-pill`, placeholder "Buscar criadores, categorias ou conteúdos…"), links Início (ativo em `accent-text` com sublinhado), Explorar, Seja Criador, botão secundário "Entrar" e primário "Criar Conta".
- **Sidebar** (240px): Início, Explorar, Criadores, Assinaturas, Mensagens, Notificações — ícone de linha + `label`; item ativo em `surface-alt` com `radius-md`. Abaixo, botão "Criar Conta" largo e card "Seja um Criador" (coroa, texto, botão contorno "Saiba mais").
- **Hero**: foto à direita escurecida para a esquerda, `tagline`, título `hero-italic` com a virada em `accent-text`, subtítulo `body`, CTA "Criar Conta Grátis →", faixa de 4 selos (Conteúdo exclusivo, Conexões reais, Privacidade e segurança, Mais liberdade), frase `script-accent` no canto e card "Criadores reais" com avatares empilhados e "+18" em `accent`.
- **Explore por categoria**: tiles 115×58 com ícone + rótulo (Todos, Sensual, Fitness, Lifestyle, Cosplay, Tattoo, Lingerie, Viagens, Conteúdo ao vivo); ativo com borda `accent`. "Ver todas →" em `accent-text`.
- **Criadores em destaque**: carrossel de cards de foto `radius-sm`, nome + selo verificado `accent` + @handle sobre degradê escuro, setas circulares.
- **Banner Conteúdo Premium**: faixa `surface-alt` com borda `accent`, coroa, título, texto e CTA "Quero ver mais →".
- **Publicações recentes**: abas Todos/Fotos/Vídeos/Ao vivo (ativa em pílula `surface-alt` com `accent-text`) e grade de mídia com badges (nº de fotos, duração do vídeo, "+ Ao vivo" em `accent`).

Componentes das peças:
- **CTA pílula**: `radius-pill`, degradê rosa, `glow-lg`, ícone (envelope/usuário) + divisória + "PRÉ-CADASTRO / ABERTO!" (`cta` + `hero-italic`) + seta.
- **Campo de URL**: pílula contorno `accent` com cadeado/globo, URL em `accent-text`, ícone de copiar.
- **Benefício em anel**: ícone dentro de círculo contorno `accent`; título "PARA **CRIADORES**" (primeira palavra `ink`, segunda `accent-text`) + 2 linhas `body`.
- **Faixa de selos**: ícone + `tagline`, divisórias verticais `border`.
- Ícones de linha arredondados (estilo Lucide): coroa, pessoas, cadeado, escudo, estrela, coração, infinito, chama, balão, envelope, globo.

## Fotografia e motion

- Retratos sensuais sem nudez explícita, luz rosa/neon, quarto em penumbra, neons de coração ao fundo. Foto profissional; evite P&B e fotos de espelho.
- Marca d'água com o símbolo; nunca o logo centralizado a 100% sobre a foto.
- Formatos: 1080×1350 (feed), 1080×1080 (quadrado/teaser).
- Motion (`assets/Motion/teaser-1x1.mp4`): fundo `noite` com partículas rosa, entra o badge com glow, a assinatura em `tagline`, depois frases `hero-italic` uma a uma, script de apoio e lista de benefícios com ícones em anel.

## Layout

- Espaçamento `space-1`…`space-10`; margem lateral `space-4` no mobile e ~`space-10` em posts.
- Separe áreas com `surface-alt` e `border`; o glow (`glow-sm`, `glow-lg`) é a única "sombra", só no tema `neon`.
- Foco: anel sólido de 2px em `focus`.

## Identidade 2022 (legado)

- Combination mark coração + cadeado + chifres, paleta `vermelho-claro` #EE314A (192 C), `vermelho-escuro` #C9343F (193 C), `roxo` #752F58 (7650 C), `cinza-roxeado` #4D2E47 (518 C), `branco`. Use os temas `light`/`dark`.
- Logos em `assets/Logos/` (vertical preferencial, horizontal quando não couber), submarca e Locked em `assets/Simbolo/`, pattern em `assets/Pattern/`.
- Degradê do símbolo: de baixo para cima `roxo` → `vermelho-claro`. Tipografia: Gotham (texto), New Machines (`lettering-xl`, `lettering-md`), Secretfont (só logotipo).
- Área de reserva = largura da fechadura (~30pt); redução mínima digital 140px (vertical) / 160px (horizontal).

## Componentes do app

Implementados no app web (Next.js + Tailwind, `src/components/ui`) e documentados em **Components**, cada um com guia e preview:

- **Ações**: `Button` (primário pequeno em `rosa-profundo`; degradê + `glow-lg` só no tamanho grande com `cta`), `CtaPill`.
- **Formulários**: `Field`, `Select`, `Checkbox`, `RadioCard`, `SearchPill`, `UrlField`.
- **Feedback**: `Badge`, `Alert`, `EmptyState`.
- **Estrutura**: `Card`, `Tabs`, `Table`.
- **Marca**: `BenefitRing`, `SealStrip`, `CategoryTile`, `CreatorCard`, `PremiumBanner`.

Regras comuns: foco com anel sólido 2px `focus`; estados hover/disabled em todos os controles; nada de dado inventado em produção (listas vazias usam `EmptyState`). Sem fotografia licenciada, banners usam o padrão geométrico do Cover (blocos `vinho-borda`/rosa e discos `rosa-neon`).

