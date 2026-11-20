# Watchify 6.3.1 — sem troca de relógios

Este pacote contém o projeto completo, não apenas um patch. Não contém node_modules,
credenciais, .env, arquivos de autenticação locais, fontes binárias ou dados pessoais.

## Substituir com segurança

1. Pare o servidor com Ctrl+C e faça uma cópia de segurança da pasta antiga.
2. Extraia este ZIP em uma **pasta nova**. Não mescle por cima da 6.3.0: copiar arquivos
   sem apagar os antigos deixaria os módulos removidos dentro da pasta.
3. Copie somente o seu `.env` da instalação anterior para a nova pasta. A autenticação
   local usa por padrão `~/.config/watchify`, fora do projeto; preserve essa pasta e
   não compartilhe seus arquivos. Não é necessário movê-la ao substituir o projeto.
4. Dentro da nova pasta `watchify`, rode `npm ci` e depois `npm start`.
5. Abra `http://127.0.0.1:3000/`. O terminal deve informar **Watchify 6.3.1**.

Se você já mantém `.env` ou dados de autenticação fora da pasta do projeto, preserve
os caminhos configurados. Não copie node_modules: o npm ci instala as versões travadas.
No Windows PowerShell, use `npm.cmd ci` e `npm.cmd start` se o npm.ps1 estiver bloqueado.

## O que saiu

- Trade no header, menu mobile e atalhos da conta.
- Página de montagem de troca e propostas enviadas/recebidas.
- “Accept trades” na criação/edição de anúncios e atalhos nos detalhes dos relógios.
- Dados, módulos, estilos, scripts de testes e documentação exclusivos das trocas.

Uma URL antiga `#trade` não abre a funcionalidade; cai na página já existente de
endereço não encontrado, com retorno para a coleção.

## O que foi preservado

Compra e venda, inventário, mensagens/negociação por dinheiro, pedidos, reviews,
analytics (incluindo market scanner, listing views e price analysis), promoções,
accounting, perfil público do dealer, configurações e os conectores locais existentes.

O marketplace continua sendo um protótipo em memória. Esta versão não ativa pagamentos,
autenticação multiusuário, envio de mensagens ou persistência reais. Nenhuma mudança
é aplicada automaticamente à cópia no seu computador ou a um site publicado.
