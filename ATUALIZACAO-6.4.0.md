# Watchify 6.4.0 — Virtual Wrist Fit

Projeto completo, baseado no pacote 6.3.1 sem trocas. Trade continua removido.

## Como testar

Abra um anúncio, por exemplo `http://127.0.0.1:3000/#watch/datejust`, e clique em **See it on your wrist**, logo abaixo da referência, do tamanho e do ano. O modal tem apenas um campo: **Your wrist circumference**. Digite `16.5` ou `16,5`; a ilustração atualiza imediatamente com a medida daquele anúncio. Não é necessário enviar foto, entrar em uma conta ou configurar uma API.

O campo pede a circunferência (medida ao redor do pulso), não o diâmetro. O guia aceita de 10 a 30 cm. O tamanho da caixa vem do anúncio e não pode ser editado pelo comprador no modal. Relógios sem uma medida utilizável ficam com o botão indisponível, sem um valor inventado.

## Substituir a versão anterior

1. Pare o servidor e faça uma cópia de segurança da pasta atual.
2. Extraia o pacote em uma pasta nova. Copie seu `.env` da instalação anterior para a nova pasta `watchify`, sem o publicar ou compartilhar. As credenciais privadas que o servidor mantém fora do projeto não fazem parte do ZIP.
3. Dentro da nova pasta `watchify`, execute `npm ci` e `npm start`. No PowerShell, use `npm.cmd ci` e `npm.cmd start` quando necessário.
4. O terminal deve mostrar **Watchify 6.4.0**. Abra o endereço local e faça uma recarga completa do navegador.

Não há migração de banco nem dependência nova. As versões de `jose` e `sharp` foram preservadas. Não é preciso configurar integrações de IA/preços para usar o simulador. Não mescle esta pasta sobre uma instalação 6.3.0 com Trade: mesclar não apagaria os módulos antigos que foram removidos na 6.3.1.

## Limites da visualização

É uma ilustração proporcional, não uma foto do relógio colocado no seu braço, uma medição anatômica ou uma garantia de ajuste. A largura do pulso é estimada por uma seção oval simplificada. Caixa, cor aproximada do mostrador e formato são ilustrados; lug-to-lug, espessura, articulação e comprimento real da pulseira não são medidos. A imagem não tem escala física 1:1 na tela.

A medida informada fica apenas na memória da aba, para comparar anúncios sem precisar digitá-la novamente. Não é enviada ao servidor nem salva no perfil, localStorage ou cookies. Recarregar a página limpa a medida.

## Verificação

- 51 testes novos do simulador passaram.
- 60 verificações de interface passaram em Chromium, com montagem offline dos arquivos do projeto, incluindo desktop, 390 px, 320 px e paisagem. Não houve erros de execução ou de console nessa montagem. Essa verificação não equivale a um teste do backend, da CSP no navegador, de Safari/iOS físico ou de provedores reais.
- `npm run check` passou. A suíte completa terminou em 309 aprovações e 32 falhas, contra 258 aprovações e as mesmas 32 falhas no pacote 6.3.1 intacto, no mesmo ambiente. Não surgiram novos testes reprovados. As falhas existentes envolvem a dependência `jose` não instalada e o teste de imagem animada com `sharp` global 0.34.1, diferente do lockfile.
- Os arquivos públicos novos respondem HTTP 200 no servidor local; `.env` e arquivos internos do servidor continuam HTTP 404.

Consulte `docs/WRIST-FIT.md`, `docs/TESTING.md` e `docs/RELEASE-6.4.0-CHECKS.json` para os detalhes e limites.
