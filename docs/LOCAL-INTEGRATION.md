# Teste local de upload, IA e preços

A versão 05 conecta o fluxo de venda a dois serviços distintos: OpenAI para observar as fotos e Talia para obter a referência de preço. As declarações continuam sendo responsabilidade do vendedor, e uma análise fotográfica não é aprovação do anúncio.

## Instalação

Use Node.js 22 ou superior. Na pasta extraída `watchify`:

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

Abra `http://127.0.0.1:3000`. Conecte a IA antes de selecionar fotos: o retorno do login recarrega a página, e os rascunhos comerciais não são persistidos.

## Configuração

| Variável | Uso |
| --- | --- |
| `TALIA_PARTNER_API_KEY` | Chave da API de parceiros de preços; obrigatória para preço real. Fica somente no servidor local. |
| `OPENAI_API_KEY` | Alternativa opcional ao plano ChatGPT para a análise de imagens. Se estiver definida, o servidor usa essa chave em vez da conexão OAuth. |
| `OPENAI_VISION_MODEL` | Modelo de visão configurado. Padrão: `gpt-6-astra`; no modo ChatGPT ele precisa constar entre os modelos disponíveis para a conta conectada. |
| `WATCHIFY_PRICE_BASELINE` | Omitir mantém a referência sem ajuste de condição. `excellent_full_set` ativa a hipótese experimental descrita abaixo. |

Não há chave pré-configurada no ZIP. Uma credencial interna de sincronização do CRM ou uma sessão de usuário do CRM não substitui a chave da API de parceiros. A conta dessa API precisa estar habilitada e ter permissão/quota para a consulta; o código não cria essa permissão nem assume chamadas gratuitas.

Edite `.env` somente no seu computador e reinicie o processo. Nunca exponha `.env`, tokens ou o diretório de configuração em um servidor público. Não é necessário compartilhar esses valores em uma conversa.

## Usar o plano ChatGPT

Na página **Sell**, escolha **Continue with ChatGPT**. O aplicativo abre a autorização oficial, e você escolhe a conta e autoriza o uso elegível do plano. A sessão desta conversa não é copiada para o site.

A integração usa o fluxo oficial para aplicativos locais: PKCE, estado de tentativa, nonce e callback `http://127.0.0.1:<porta>/auth/callback`. A identidade e os escopos concedidos são verificados antes de habilitar inferência. A autorização não concede acesso às suas conversas, arquivos da conta ou chave pessoal de API.

O aplicativo guarda a conexão em `~/.config/watchify/chatgpt.json`, fora do projeto, usando diretório privado e arquivo `0600` em sistemas Unix. Esse arquivo contém tokens e deve ser protegido. Ele não é um cofre criptografado nem uma integração com o chaveiro do sistema.

Desconectar elimina os tokens locais e tenta revogá-los no provedor. Se a revogação remota não for confirmada, remova também a autorização nas configurações do ChatGPT. O identificador estável da instalação e o registro da conta podem permanecer para uma nova conexão.

Esta modalidade é para o teste local. A documentação oficial exige um caminho apropriado para aplicativos comerciais pagos ou hospedados remotamente. Não publique este servidor local como uma integração de plano ChatGPT para todos os clientes.

## O que é enviado

| Destino | Dados |
| --- | --- |
| Servidor local Watchify | Bytes das fotos escolhidas, categoria da foto, referência/ano e declarações usadas no fluxo. |
| OpenAI | Versões reprocessadas das fotos e contexto limitado necessário para identificação e observações. O modelo recebe instruções para não seguir comandos contidos nas imagens. |
| API de preços | Referência/ano ou identificador de catálogo escolhido; não recebe as fotografias. |

Antes de enviar, esconda números de série e dados pessoais presentes nos documentos. Remover metadados EXIF não apaga textos que aparecem nos pixels. A opção `store: false` da Responses API é utilizada; ela não significa que o aplicativo possa prometer ausência de retenção de dados em todos os sistemas do provedor.

O servidor aceita JPG, PNG e WebP com no máximo 8 MiB por arquivo e 24 megapixels. As imagens são decodificadas, orientadas, reduzidas para no máximo 2.048 pixels no maior lado e convertidas em JPEG sem metadados. Arquivos animados, formatos falsos, imagens inválidas e excesso de quota são rejeitados. Até seis assets podem ser usados por análise. Os derivados ficam em memória por até 30 minutos e desaparecem ao reiniciar o servidor.

## Analisar um relógio

1. Conecte a IA, adicione fotos do mostrador, caixa, laterais, fecho e detalhes de desgaste. Acrescente box e papers se estiverem incluídos.
2. Inicie a análise. Falha de rede, recusa do modelo, resposta incompleta ou um modelo indisponível retorna um erro; não é gerado um resultado de demonstração em substituição.
3. Confira as sugestões de marca/modelo/referência e as observações. Uma referência não legível pode permanecer incerta. Confirme os dados a partir do próprio relógio ou documentação; é possível informar uma referência que não esteja entre os oito itens de demonstração.
4. Declare uso, polimento e marcas. A IA não seleciona `Unworn`, não confirma que nunca houve polimento e não preenche as suas confirmações por você.
5. Consulte a referência de preço. Se houver variantes ambíguas, escolha a variante correta antes de continuar. O preço pedido pelo vendedor permanece uma escolha separada.
6. Revise e envie. O anúncio fica em revisão no protótipo; nenhuma IA o publica ou aprova automaticamente.

Não ver box/papers em uma foto não prova que eles não existam. Ver documentos não prova que sejam originais. O relatório descreve evidência visual, incluindo limites da qualidade e dos ângulos apresentados.

## Política de preço

A API de parceiros retorna uma referência de negociação entre profissionais, com moeda, data, base e estado de revisão. Ela não informa uma condição-padrão nem se a referência pressupõe box/papers. O padrão do Watchify é `reference_only`: exibir a referência sem inventar um ajuste por condição ou apresentar uma cotação final de varejo.

Para experimentar uma hipótese controlada, um operador pode configurar `WATCHIFY_PRICE_BASELINE=excellent_full_set`. Isso declara explicitamente a hipótese de que a referência corresponde a uma peça `Excellent` com kit completo. **Não é uma informação fornecida pelo Talia e precisa ser validada antes de qualquer uso comercial.**

A política experimental `watchify-local-indication-v1` usa a condição mais conservadora entre a declaração e a sugestão visual, quando ambas são utilizáveis:

| Entrada | Ajuste experimental |
| --- | --- |
| Excellent | 0% |
| Very good | −5% |
| Good | −10% |
| Sem box | −2% |
| Sem papers | −5% |

Os ajustes são aditivos. Não há prêmio por `Unworn`, desconto independente por polimento ou desconto automático por idade. O preço por ano já vem da consulta ao provedor. Esses coeficientes não foram calibrados com transações reais; a origem de mercado e a indicação calculada permanecem campos distintos.

A política local exige uma data de cálculo utilizável e, para produzir a indicação, uma referência de até 30 dias. Esse prazo é uma decisão do Watchify para o teste, não uma garantia do provedor. Data ausente, futura ou antiga, preço disputado, base desconhecida, fotos inadequadas ou declarações incompatíveis exigem revisão em vez de uma indicação automática. A moeda do provedor é preservada, sem usar o câmbio fictício do catálogo.

## Referência e ano não encontrados (6.1.6)

A rota correta é `GET /api/partner/v1/price`, com `reference` e `year`. O contrato da API 1.3.0 foi conferido no CRM, commit `442a931ba2d95cb12fd9eb11e54f4441c672ad1b`. A referência é normalizada sem pontuação ou distinção de maiúsculas; o ano precisa corresponder ao ano exato da entrada. O intervalo de fabricação do modelo não substitui esse ano.

| Retorno | Significado no Watchify |
| --- | --- |
| `404 WATCH_NOT_FOUND` | A consulta não encontrou uma entrada atual para a referência e o ano. Não significa conexão ausente. |
| `200`, `price.status: unavailable` | A entrada existe, mas não há preço disponível. |
| `200`, `paused` ou `withdrawn` | O preço está pausado ou foi retirado. |
| `409 WATCH_AMBIGUOUS` | É preciso escolher a variante exata. |
| `404 ENDPOINT_NOT_FOUND` | Erro de rota; não é tratado como relógio não encontrado. |

Após `WATCH_NOT_FOUND`, o servidor faz uma única busca `/watches` pela mesma referência, sem ano. A busca não entrega preços nem cobra uma consulta de preço, mas conta para os limites de requisições. Exibe somente os anos encontrados entre até 50 entradas, indicando se existem mais resultados ou entradas sem ano. Entradas pausadas/retiradas podem não aparecer nessa busca. Nunca muda o ano declarado nem pede automaticamente o preço de outro relógio.

Use **Check reference** ou **Check year** para conferir os dados contra os documentos do relógio. Não escolha outro ano apenas para obter um preço. Se os dados estiverem corretos e não houver entrada correspondente, é possível informar o preço desejado e seguir para revisão sem estimativa automática.

**Refresh market reference** reconsulta um resultado `not_found` reutilizando a chave de idempotência. Esse 404 não possui recibo na API. Preços já recebidos e os estados 200 continuam reaproveitados durante a janela local de dez minutos. O provedor também pode reproduzir o recibo de uma mesma chave; uma nova cotação após expirar a janela pode consumir a franquia de preços se houver preço disponível. Não há repetição automática de uma consulta de preço.

## Resolver problemas

A partir da versão 6.1.2, erros de análise inválida mostram `Diagnostic: ...` diretamente na tela de venda. A correção separa mensagens `commentary` da mensagem `final_answer`, mantendo compatibilidade com uma única mensagem sem fase. Somente a avaliação final concluída passa pela validação; nenhum trecho parcial vira um resultado.

| Diagnóstico | Significado |
| --- | --- |
| `ASSESSMENT_JSON` | A mensagem final não contém um JSON válido. |
| `SCHEMA_MISMATCH` | Um campo não atende ao schema exigido; o caminho do campo aparece sem o seu valor. |
| `UNKNOWN_PHOTO_ID` | Uma observação cita uma foto que não pertence à solicitação. |
| `FINAL_MISSING` / `FINAL_AMBIGUOUS` | Não há uma avaliação final única; comentários não são usados como substituto. |
| `OUTPUT_SHAPE` | O formato das mensagens retornadas não foi reconhecido. |
| `RESPONSE_CONTENT_TYPE` | Tipo HTTP explícito não suportado ou, sem cabeçalho, prefixo não reconhecido em até 4 KiB. O diagnóstico mostra somente uma categoria segura (`html`, `text`, `binary`, `missing` ou `other`). |
| `STREAM_ENCODING` / `RESPONSE_ENCODING` | Os bytes do SSE ou JSON não formam UTF-8 válido. A resposta é rejeitada sem substituir caracteres corrompidos. |
| `STREAM_FORMAT` / `STREAM_EVENT` | Formato de streaming inválido; `STREAM_FORMAT` é o diagnóstico genérico de versões anteriores. |
| `RESPONSE_BODY` / `RESPONSE_JSON` | A resposta do serviço está ausente ou não pôde ser lida. |
| `RESPONSE_LIMIT` | Um limite de leitura foi atingido. A partir da versão 6.1.3, o diagnóstico identifica qual limite e os tamanhos recebido/permitido. |
| `MODEL_CATALOG` | O catálogo de modelos retornado não pôde ser validado. |

A versão 6.1.5 usa o tipo de conteúdo recebido para escolher entre o leitor SSE e o leitor JSON limitado. Se `Content-Type` estiver ausente ou vazio, examina até 4 KiB do início da mesma resposta autenticada para reconhecer um objeto JSON ou o início de um evento SSE. BOM UTF-8 e espaços/quebras de linha iniciais são considerados. O prefixo só seleciona o leitor: todos os bytes originais passam uma única vez pelos mesmos limites e validações, sem armazenar ou exibir o conteúdo de diagnóstico. Cabeçalhos explícitos não suportados continuam rejeitados. O fluxo ChatGPT mantém o pedido oficial de streaming. Se o endpoint responder com `application/json`, somente um objeto Responses com estado concluído, uma avaliação final válida e IDs das fotos corretos pode ser aceito. Um corpo de erro, uma página HTML ou deltas parciais não são convertidos em avaliação. Nenhuma nova chamada é feita automaticamente para tentar outro formato.

Os limites de resposta da versão 6.1.3 são separados:

| Categoria | Limite | O que é contado |
| --- | --- | --- |
| `MODEL_CATALOG_BYTES` | 2 MiB | JSON do catálogo de modelos da conta. |
| `RESPONSE_BYTES` | 4 MiB | Resposta HTTP JSON no modo de chave de API. |
| `STREAM_BYTES` | 32 MiB | Soma dos bytes recebidos durante o streaming, incluindo eventos intermediários. |
| `STREAM_EVENT_BYTES` | 4 MiB | Um evento SSE, inclusive quando repartido em vários blocos da rede. |
| `ASSESSMENT_BYTES` | 512 KiB | Texto JSON da avaliação final antes da validação do schema. |

O leitor conserva somente o evento em processamento e a resposta concluída necessária à validação; não acumula o histórico de eventos intermediários. Blocos grandes da rede podem conter vários eventos pequenos. O limite de tráfego não é o tamanho de um buffer mantido em memória. A avaliação continua sujeita aos limites de campos, itens, observações e vínculos com as fotos. A análise tem prazo de 90 segundos, sem reenvio automático.

Compartilhe a mensagem de erro com esse diagnóstico para investigação. Não é necessário enviar as fotografias, tokens, a resposta bruta do provedor ou arquivos de credenciais. O app não reenvia as fotos automaticamente após uma falha.

Se o login retornar `AUTH_IDENTITY`, a versão 6.1.1 inclui um campo `reason` com a categoria segura da falha. O `requestId` anterior, sozinho, não identifica a causa: este servidor não mantém um histórico de logs de autenticação.

- `TOKEN_EXPIRED`, `TOKEN_NOT_ACTIVE` ou `ISSUED_IN_FUTURE`: confira data/hora e sincronização automática do computador. Volte a **Sell** e inicie uma nova autorização; recarregar a URL de callback reutiliza um código já consumido.
- `CRYPTO_UNAVAILABLE`: confira `node --version` (Node.js 22+) e se o processo foi iniciado com Web Crypto desativado. Reinicie após corrigir o ambiente.
- `AUDIENCE_MISMATCH`, `ISSUER_MISMATCH`, `NONCE_MISMATCH` ou `AUTHORISED_PARTY_MISMATCH`: a identidade não corresponde à autorização esperada. Não remova as verificações; registre o diagnóstico seguro para investigação.
- `SIGNING_KEY_NOT_FOUND`, `SIGNING_KEYS_INVALID` ou `SIGNING_KEY_AMBIGUOUS`: tente uma nova autorização mais tarde; as chaves vêm exclusivamente do endereço oficial fixado.
- `SIGNATURE_INVALID`, `TOKEN_HEADER`, `TOKEN_MALFORMED`, `ID_TOKEN_MISSING`, `CLAIMS_INVALID`, `SUBJECT_MISMATCH` ou `TOKEN_UNVERIFIABLE`: a conexão permanece rejeitada. Compartilhe apenas o JSON de erro produzido pelo Watchify, nunca a URL completa de retorno, arquivos de credenciais ou tokens.

Ao iniciar a versão atual, o terminal deve mostrar `Watchify 6.3.1: http://127.0.0.1:3000` (a porta pode variar se configurada).

Para atualizar um pacote existente, pare o servidor com `Ctrl+C`, substitua os arquivos pelo ZIP novo, preserve o seu `.env`, execute `npm.cmd ci` e `npm.cmd start` no PowerShell e abra `http://127.0.0.1:3000/#sell`. Inicie uma nova tentativa pelo botão **Continue with ChatGPT**. Nenhuma credencial precisa ser apagada manualmente.

| Situação | Ação |
| --- | --- |
| IA não conectada | Conecte o ChatGPT localmente ou configure uma chave de API OpenAI no servidor. |
| Modelo não permitido para a conta | Configure um modelo de visão que a conta realmente disponibilize; não há troca silenciosa de modelo. |
| Login não retorna | Use o endereço `127.0.0.1`, mantenha o servidor ativo e reinicie a tentativa. O callback não usa `localhost`. |
| Conexão expirada ou revogada | Conecte a conta novamente pela interface. |
| Preços não conectados | Configure uma chave de parceiro autorizada e reinicie o servidor. |
| Limite/quota do provedor | Aguarde ou confira a configuração da conta; o app não tenta contornar o limite. |
| Referência ambígua | Confira ano e variante e escolha a identidade correta. |
| Foto expirada | Selecione/envie novamente as fotos e execute uma nova análise. |
| Apenas referência de mercado | É o padrão enquanto a condição-base não foi definida/calibrada. Não é um preço final garantido para o exemplar. |

## Fontes do contrato

Consultadas em 9 de novembro de 2026:

- [OpenAI — ChatGPT plan usage em aplicativos locais](https://developers.openai.com/siwc/token-sharing-open-source).
- [OpenAI — Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).
- [OpenAI — Images and vision](https://developers.openai.com/api/docs/guides/images-vision).
- Contrato da API de parceiros do CRM, versão 1.3.0, no commit `6d8aea6b5e03e5bbf8fd6a6cb1168b72d53c8fa8`. A origem `https://app.taliaai.com/api/partner/v1` foi conferida no código de roteamento; não representa um teste autenticado concluído.

A documentação do provedor pode evoluir. A verificação reproduzível deste pacote, incluindo o que foi testado com mocks e o que ainda depende de conexão real, está em `TESTING.md`.
