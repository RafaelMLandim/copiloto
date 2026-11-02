# Painel Copiloto

Painel local (só neste computador) para gerir clientes, montar campanhas com o Claude,
conversar com ele e receber relatórios no WhatsApp.

## Como abrir
- Dê dois cliques em `iniciar.bat` → abre http://127.0.0.1:3333
- Para desenvolver: `npm run dev` (interface em http://127.0.0.1:5173 com recarga automática)
- Para o relatório automático rodar, o painel precisa estar aberto. Dica: coloque um atalho do
  `iniciar.bat` em `shell:startup` (Win+R) para abrir junto com o Windows.

## Onde ficam os dados
- Clientes: as mesmas pastas de `../clientes/` (ficha.md, midias/novas, midias/usadas). O painel lê e escreve nelas.
  Extras do painel (WhatsApp do relatório, cor) ficam em `clientes/<cliente>/painel.json`.
- Briefings de campanha: `clientes/<cliente>/briefings/`.
- Configurações, conversas e relatórios: `painel/data/*.json`. Não precisa de banco de dados.

## Como funciona
- **Chat**: cada mensagem roda o Claude Code (`claude -p`) na pasta Copiloto, com o CLAUDE.md, a memória e o
  Claude in Chrome. As conversas continuam de onde pararam (`--resume`).
- **Nova campanha**: o assistente pergunta tudo o que é necessário, monta o briefing e manda para o Claude, que cria
  o **rascunho** no Gerenciador. Idade e gênero têm "Sugestão" ou "Somente esse público" (trava fora do Advantage+).
- **Relatórios**: semanal (sábado a sexta, sem atravessar o mês) e mensal. Com token do Meta (Configurações) usa a API; sem token, o Claude lê
  o Gerenciador pelo navegador (somente leitura). Envio: link wa.me, CallMeBot, Evolution API ou Z-API.
