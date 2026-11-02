# Copiloto

Painel local para gestão de tráfego pago (Meta Ads), feito em **React + TypeScript + Express**, sem banco de dados.

- Cadastro de clientes (ficha em Markdown + mídias)
- Assistente de nova campanha que pergunta tudo o que é necessário (incluindo público **sugestão × restrito**)
- Chat com o Claude (Claude Code CLI) para pedir ajustes
- Relatórios semanais (sábado a sexta, sem atravessar o mês) e mensais, a partir da exportação .csv do Gerenciador de Anúncios, com envio por WhatsApp
- Sininho de lembrete toda sexta e no último dia do mês

## Como rodar

Requisitos: Node 20+, [Claude Code](https://claude.com/claude-code) instalado e, para os relatórios/campanhas, a extensão Claude in Chrome.

```bash
cd painel
npm install
npm run dev        # desenvolvimento (Vite + servidor)
# ou
iniciar.bat        # Windows: build + abre http://127.0.0.1:3333
```

Os dados dos clientes ficam em `clientes/<cliente>/` (use `clientes/_modelo/` como base) e os dados do painel em `painel/data/` — ambos fora do Git.
