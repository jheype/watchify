# Watchify 6.4.0 — Made to be worn.

Marketplace B2C de relógios com identidade própria, interface em inglês e perfil inicial **Joao Almeida**. A versão 6.0 apresenta uma sala de observação em azul profundo: fotografia do relógio no pulso, três ângulos selecionáveis e acesso direto à coleção e à venda. Tipografia com Commissioner quando instalada no computador, ou a fonte de sistema, catálogo mais legível e áreas de venda e conta com a mesma identidade. O servidor local da versão 5 continua disponível para enviar fotos à IA e consultar a API de preços. O catálogo e as operações de compra, venda, conta e inventário continuam sendo um protótipo.

O código dos conectores é real. O ZIP não contém credenciais, não conecta automaticamente a conta desta conversa e não comprova que uma chamada autenticada aos provedores tenha sido concluída. O estado de verificação está em [docs/TESTING.md](docs/TESTING.md).

## Começar no seu computador

Requer Node.js 22 ou superior. Extraia o ZIP inteiro e, dentro da pasta `watchify`, execute:

**Windows / PowerShell:**

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd start
```

**macOS / Linux:**

```bash
npm ci
[ -f .env ] || cp .env.example .env
npm start
```

Abra **http://127.0.0.1:3000**. Use esse endereço, especialmente para conectar o ChatGPT. Os comandos preservam um `.env` já configurado. `npm.cmd` evita o bloqueio de `npm.ps1` no PowerShell, sem alterar a política de execução.

1. Abra **Sell** e escolha **Continue with ChatGPT** antes de selecionar as fotos. Conclua o login e a autorização na página oficial da OpenAI. Isso permite usar o plano elegível da conta conectada para as solicitações aceitas por essa integração local; não dá acesso às suas conversas.
2. Para consultar preços, preencha `TALIA_PARTNER_API_KEY` no arquivo `.env` **do seu computador** com uma chave da API de parceiros autorizada para essa finalidade. Reinicie o servidor depois da alteração. Não cole a chave em mensagens, em arquivos públicos ou no JavaScript do navegador.
3. Adicione suas fotos em **Sell**, execute a análise, confirme a identificação e preencha as declarações de condição. A cotação usa a resposta do serviço de preços; falhas ou ausência de conexão não são substituídas silenciosamente por preços fictícios.

O [guia de integração local](docs/LOCAL-INTEGRATION.md) explica configuração, dados enviados, limites, erros e alternativa com chave da API OpenAI. Para apenas explorar o layout, os dados de catálogo continuam disponíveis; a análise real exige o servidor e a conexão de IA.

## O que mudou

A versão **6.4.0** adiciona **See it on your wrist** dentro de cada anúncio com tamanho de caixa utilizável. Um modal compacto recebe apenas a circunferência do pulso em cm e mostra uma ilustração proporcional atualizada ao digitar. Não é prova de ajuste nem foto do relógio no braço; não usa IA, câmera ou API. Trade continua removido. Veja [como atualizar e testar](ATUALIZACAO-6.4.0.md) e [a implementação e seus limites](docs/WRIST-FIT.md).

A versão **6.3.1** remove a funcionalidade de troca de relógios: navegação, página, preferência nos anúncios, propostas e módulos específicos. Compra, venda, mensagens, pedidos, avaliações, analytics, promoções, accounting, perfil e segurança permanecem disponíveis. Veja [como substituir a versão anterior](ATUALIZACAO-6.3.1.md).

A versão 6.2.0 amplia **My Watchify** com mensagens e negociação, pedidos de compra e venda, avaliações dadas e recebidas, analytics, market scanner, listing views, price analysis, promoções, accounting, edição do dealer e segurança. O perfil público mostra a coleção disponível e a reputação do dealer; editar nome, showroom, foto e localização atualiza sua apresentação. As telas compartilham os mesmos registros: aceitar uma oferta cria um pedido, uma avaliação exige uma transação concluída, e a promoção aparece no financeiro e no posicionamento recomendado do catálogo.

Esses novos fluxos são locais e simulados, com dados em memória que reiniciam ao recarregar a página. Não há entrega de mensagens a outras pessoas, cobrança real, emissão fiscal ou autenticação de marketplace. Os fluxos de senha e MFA são explicitamente apresentações de configuração; não alteram senhas nem protegem uma conta real. A integração local de fotos/IA/preços já existente permanece separada. Veja [docs/WORKSPACE.md](docs/WORKSPACE.md) para explorar cada área e conhecer os limites.

A versão 6.1.6 corrige a etapa de preço: uma referência/ano não encontrada não é mais apresentada como conexão ausente. A tela mostra os dados exatos consultados e permite revisar a referência e o ano mantendo as fotos e a análise. Após `WATCH_NOT_FOUND`, uma busca de catálogo mostra os anos encontrados, sem cotar outro ano automaticamente. Essa busca não cobra um preço, mas consome uma requisição da franquia. Uma tentativa explícita de atualizar reconsulta esse resultado com a mesma chave; preços já entregues mantêm a proteção contra repetição de cobrança. A escolha de variante permanece nas tentativas após falhas temporárias.

A versão 6.1.5 corrige a rejeição de respostas sem `Content-Type`. Quando o cabeçalho está ausente ou vazio, o servidor examina no máximo os primeiros 4 KiB para selecionar JSON ou SSE e repassa todos os bytes originais ao leitor limitado. A avaliação ainda precisa estar concluída, atender ao schema e citar as fotos enviadas. HTML, dados não reconhecidos, respostas parciais e erros continuam rejeitados. O terminal agora mostra `Watchify 6.1.5` ao iniciar, para confirmar que o código atualizado está em execução.

A versão 6.1.4 seleciona o leitor pelo `Content-Type` da resposta: SSE e JSON completo convergem para as mesmas validações da avaliação. O pedido no modo ChatGPT continua com `stream: true`; aceitar um objeto JSON concluído do mesmo endpoint é compatibilidade defensiva, sem segunda chamada ou troca de provedor. Respostas parciais, erros, fotos desconhecidas e JSON fora do schema permanecem rejeitados. Cabeçalhos não reconhecidos e UTF-8 inválido agora têm diagnósticos separados.

A versão 6.1.3 corrige limites que podiam rejeitar respostas válidas. A leitura do streaming é incremental e descarta eventos já consumidos, com limites separados para o tráfego completo, cada evento e o JSON final. O catálogo de modelos também tem um orçamento próprio. O schema, a revisão obrigatória e as verificações das fotos permanecem exigidos. Se algum limite for atingido, o erro identifica a etapa e informa os tamanhos recebido e permitido, sem expor o conteúdo privado da resposta.

A versão 6.1.2 corrige a leitura da avaliação: comentários intermediários da IA não são mais concatenados ao JSON final. É exigida uma única avaliação concluída, válida e vinculada às fotos da solicitação. O schema enviado ao modelo restringe os IDs às fotos realmente enviadas. Respostas ambíguas, incompletas, recusadas ou inválidas continuam bloqueadas; não há repetição automática de chamadas. Se uma análise falhar, a tela de venda mostra uma categoria de diagnóstico e, quando aplicável, o campo do schema que falhou, sem revelar o conteúdo privado da resposta.

A versão 6.1.1 torna o erro de login `AUTH_IDENTITY` diagnosticável: o JSON inclui um `reason` fixo que distingue assinatura, chaves, validade temporal, emissor, destinatário e ambiente de criptografia. Não expõe tokens, conteúdo das claims nem exceções internas. Todas as verificações continuam obrigatórias; esta atualização não comprova a resolução do login real sem uma nova tentativa no computador afetado.

A versão 6.1 aplica a logo em azul profundo, mantendo o desenho original. A trilha de venda usa círculos e linhas com a mesma geometria no desktop e no celular. As etapas avançam e retornam com uma transição de 220 ms; fotos, filtros e menu recebem transições curtas. Navegação por teclado e preferência por movimento reduzido continuam imediatas. Atualizações de conexão ou preço não repetem a animação da etapa.

A atualização visual 6.0 substitui a composição em bege, as seções numeradas e as fichas separadas por linhas da versão 5.2. A abertura mostra o Rolex Submariner no pulso e permite alternar entre **On the wrist**, **The dial** e **In full**. Marca, modelo, ano e preço permanecem próximos da fotografia. O desenho da logo e as fotografias existentes são preservados.

O catálogo usa quatro colunas em telas amplas, três em larguras intermediárias e duas nos celulares usuais. Busca, navegação por marca, ordenação, filtros expansíveis, favoritos e comparação continuam disponíveis. Venda, conta e detalhes receberam texto maior, campos legíveis e ações claras; o azul identifica navegação e seleção. As declarações separadas de uso e polimento e as regras de revisão permanecem preservadas.

Os movimentos respondem às ações: troca de fotografia com transição breve, feedback ao pressionar controles e abertura de diálogos. A navegação por teclado não recebe essa animação; a preferência por movimento reduzido é respeitada. O pacote usa fontes locais/de sistema e não inclui arquivos de fonte nem faz requisições a serviços externos de fontes. As decisões visuais estão em [DESIGN.md](DESIGN.md).

Esta atualização não ativa novas integrações, não publica o site e não altera os limites do servidor local.

Os recursos de integração introduzidos na versão 5 continuam disponíveis:

| Parte | Comportamento da versão 05 |
| --- | --- |
| Upload | Fotos do dispositivo são enviadas ao servidor local, validadas, decodificadas e convertidas em imagens sem metadados antes da análise. |
| Reconhecimento | A IA sugere marca, modelo e referência quando houver evidência suficiente. A referência precisa ser confirmada; um palpite não é identificação definitiva. |
| Condição | Observações por componente, marcas visíveis, possíveis sinais de polimento, qualidade das fotos e limitações aparecem separadas das declarações do vendedor. |
| Box e papers | A IA informa se os acessórios aparecem nas imagens. Isso não confirma originalidade nem validade dos documentos. |
| Preços | O servidor consulta a API de parceiros por referência/ano ou variante selecionada. A moeda, origem do preço e data são preservadas. |
| Incerteza | Fotos insuficientes, variantes ambíguas, declarações conflitantes ou um preço indisponível não viram aprovação automática. |
| Submissão | O anúncio continua em **In review**, sem compra disponível e sem aprovação automática da IA. |

O fluxo conserva cinco etapas: fotos, identificação, condição, preço e revisão. Fotos de catálogo são referências de design e não equivalem à análise de um relógio do vendedor.

## Cotação e condição

A API de preços fornece uma referência de mercado de negociação entre profissionais; não especifica uma condição padrão ou kit de acessórios. Por isso, a configuração inicial apresenta **a referência recebida e o relatório de condição**, sem inventar um desconto ou chamar esse valor de cotação final de varejo.

Há uma política opcional de indicação de preço para ensaios controlados. Ela exige declarar uma hipótese de condição-base no servidor e fica identificada como experimental. Não é uma regra do provedor nem um modelo calibrado de mercado. Os detalhes estão em [docs/LOCAL-INTEGRATION.md](docs/LOCAL-INTEGRATION.md).

## O que ainda é simulado

Os anúncios pré-carregados, dealers, propostas, reservas, vendas, compras, sincronização de inventário e conta de membro são fictícios. A taxa de 5% e o câmbio GBP/USD/EUR do catálogo continuam sendo exemplos de interface. Cotações reais não passam por esse câmbio ilustrativo.

Enviar uma submissão não publica um anúncio na internet, não agenda uma inspeção e não executa uma transação. Rascunhos, submissões, preferências de conta e estados comerciais ficam na memória da aba; atualizar a página reinicia esse estado. Favoritos do catálogo original e a preferência de moeda podem persistir no navegador.

As fotos enviadas ao servidor local ficam em memória por tempo limitado e são descartadas ao encerrar o processo. Não há armazenamento durável de evidências, banco de dados de anúncios, painel de inspeção, autenticação de compradores/dealers, checkout ou estoque concorrente. O login do ChatGPT autoriza a conexão de IA; não transforma a conta fictícia de membro em uma conta comercial verificada.

## Estado do relógio e prevenção de inconsistências

O vendedor declara separadamente uso anterior, polimento após a fabricação e marcas visíveis. `Unworn` exige nunca usado, sem polimento posterior e sem marcas. Histórico desconhecido impede essa classificação. A IA não pode concluir `Unworn`, ausência de polimento, autenticidade, propriedade, saúde do mecanismo ou resistência à água a partir das fotografias.

As declarações e os resultados da análise permanecem separados. Contradições exigem correção ou avaliação; fotos e confirmações não tornam uma afirmação verdadeira. A operação comercial ainda precisa de inspeção especializada e controles de publicação no backend. Consulte [docs/CONDITION-POLICY.md](docs/CONDITION-POLICY.md).

## Código e verificação

```bash
npm run check
npm test
```

| Arquivo/pasta | Função |
| --- | --- |
| `index.html`, `src/`, `assets/` | Interface, logo, catálogo e experiência de venda. |
| `src/live-api.js` | Comunicação da interface com o servidor local; não contém segredos dos provedores. |
| `server/chatgpt-auth.cjs` | Conexão OAuth local com o ChatGPT, validação de identidade e renovação das credenciais. |
| `server/media.cjs` | Validação, redução, conversão e retenção temporária das imagens. |
| `server/vision.cjs` | Análise estruturada pela Responses API da OpenAI. |
| `server/talia.cjs` | Consulta à API de parceiros de preços. |
| `server/` e `tools/serve.cjs` | Rotas locais, sessão, validações e inicialização. |
| `tests/` | Regras do domínio e integrações com respostas de provedores controladas por testes. |
| `docs/` | Contratos, arquitetura, segurança, limites e resultados de verificação. |

O pacote usa `sharp` e `jose` em versões fixadas no arquivo de dependências. Não inclui `node_modules`, `.env`, tokens, credenciais pessoais ou dados de execução. Nenhum repositório ou serviço remoto precisa receber este código para testá-lo localmente.

## Fotografias e identidade

A logo Watchify está aplicada ao cabeçalho, rodapé e favicon. `assets/watchify-logo.png` e `assets/watchify-symbol.png` são PNGs transparentes, não vetores; [docs/BRAND.md](docs/BRAND.md) registra os detalhes.

As imagens do catálogo são fotografias reais de terceiros para referência de design. As origens estão em `assets/sources.json`; permissões comerciais não foram verificadas. Substitua-as por fotos autorizadas antes de uma publicação comercial. O design e suas referências estão em [docs/DESIGN-REFERENCES.md](docs/DESIGN-REFERENCES.md).
