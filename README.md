# EPX-Food---card-pio-digital

MVP full stack para receber pedidos via WhatsApp Cloud API, aplicar regras comerciais no backend e acompanhar a operação em um painel responsivo. A base já nasce multiempresa: as consultas de domínio recebem `restaurantId` do token autenticado, nunca do corpo enviado pelo cliente.

## O que está implementado

- painel administrativo responsivo com login, dashboard, Kanban, detalhes, impressão, catálogo e clientes;
- atualização de status com transições válidas e stream SSE para tempo real;
- API REST em Express + TypeScript, validação Zod, JWT, rate limiting, CORS e Helmet;
- PostgreSQL + Prisma com os modelos do domínio, relações, índices e isolamento por pizzaria;
- ambiente inicial vazio, sem credenciais, clientes ou pedidos predefinidos;
- criação de pedido com preços, disponibilidade e taxa recalculados no servidor dentro de transação;
- webhook oficial da Meta (`GET` de verificação e `POST` de eventos), idempotência por `externalId` e identificação da pizzaria por `phoneNumberId`;
- máquina de estados persistente para o fluxo conversacional e comandos globais;
- abstração `WhatsAppService` para texto, botões, listas, templates e confirmação de leitura;
- painel e cardápio abastecidos somente por dados persistidos na API.

## Arquitetura

```text
apps/
├── api/
│   ├── prisma/             schema e seed
│   └── src/
│       ├── config/         ambiente validado
│       ├── controllers/    adaptação HTTP
│       ├── integrations/   WhatsApp Cloud API
│       ├── lib/            Prisma e eventos SSE
│       ├── middlewares/    autenticação e erros
│       ├── modules/        regras específicas do domínio
│       ├── routes/         rotas REST e webhook
│       └── services/       regras de negócio com tenant obrigatório
└── web/
    ├── public/             assets locais
    └── src/
        ├── components/     layout e componentes reutilizáveis
        ├── lib/            cliente da API
        └── pages/          telas do painel
```

Consulte também [ARCHITECTURE.md](./ARCHITECTURE.md) para decisões, limites de segurança e evolução por fases.

## Requisitos

- Node.js 20 ou superior;
- npm 10 ou superior;
- PostgreSQL 15+ ou Docker.

## Instalação

```bash
npm install
cp .env.example .env
```

No PowerShell, use `Copy-Item .env.example .env`.

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Gere o cliente e aplique as migrations:

```bash
npm run db:generate
npm run db:migrate -- --name init
```

O comando `npm run db:seed` é seguro e não insere dados. O primeiro restaurante deve ser criado em `/cadastro`.

Inicie frontend e backend juntos:

```bash
npm run dev
```

- Painel: http://localhost:5173
- API: http://localhost:3000
- Saúde da API: http://localhost:3000/health

Não existem credenciais padrão.

## Variáveis de ambiente

Copie `.env.example` e preencha:

- `DATABASE_URL`: conexão PostgreSQL;
- `JWT_SECRET`: segredo longo e aleatório em produção;
- `TOKEN_ENCRYPTION_SECRET`: segredo independente usado para criptografar tokens armazenados;
- `WEB_URL`: origem autorizada pelo CORS;
- `WHATSAPP_VERIFY_TOKEN`: token escolhido para validação do webhook;
- `WHATSAPP_ACCESS_TOKEN`: token da Meta, somente no backend;
- `WHATSAPP_PHONE_NUMBER_ID`: identificador do número na Cloud API;
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: identificador da conta WhatsApp Business (WABA);
- `WHATSAPP_DISPLAY_PHONE`: número legível, opcional, para identificação no painel;
- `WHATSAPP_API_VERSION`: versão da Graph API;
- `WHATSAPP_TEST_MODE`: em `true`, inicia novas conexões com o bot pausado e bloqueia mensagens proativas; respostas a mensagens recebidas continuam disponíveis para o teste;
- `META_APP_ID`: identificador público do aplicativo Meta;
- `META_EMBEDDED_SIGNUP_CONFIG_ID`: configuração do Facebook Login for Business usada pelo Embedded Signup;
- `META_APP_SECRET`: segredo do app usado para validar `X-Hub-Signature-256`;
- `META_REDIRECT_URI`: URI de redirecionamento OAuth cadastrada na Meta, quando exigida pela configuração;
- `TOKEN_ENCRYPTION_SECRET`: segredo exclusivo para criptografar tokens no banco; obrigatório em produção quando a Meta estiver configurada;
- `WWEBJS_DISABLE_SANDBOX`: mantenha `false`; habilite somente em ambiente isolado que exija execução sem sandbox;
- `VITE_API_URL`: URL pública da API usada pelo painel.

Nenhuma chave deve ser colocada no frontend ou versionada.

## Configuração do WhatsApp

1. Crie um app Business no Meta for Developers com o caso de uso WhatsApp.
2. Crie uma configuração de Facebook Login for Business para WhatsApp Embedded Signup.
3. Preencha `META_APP_ID`, `META_EMBEDDED_SIGNUP_CONFIG_ID` e `META_APP_SECRET` somente no backend.
4. Configure a URL pública `https://seu-dominio.com/webhooks/whatsapp` e use o mesmo `WHATSAPP_VERIFY_TOKEN` na Meta.
5. Assine o campo `messages` do webhook.
6. No painel, abra `/whatsapp`, clique em **Conectar WhatsApp** e conclua o fluxo oficial da Meta.

O backend troca o código temporário pelo token, confirma que o número pertence ao WABA autorizado, assina o webhook e armazena o token criptografado por pizzaria. App ID e Configuration ID podem chegar ao navegador; App Secret e tokens nunca são enviados ao frontend.

### WhatsApp Web experimental

Com `WHATSAPP_TEST_MODE=true`, a página de integração mostra um QR gerado pelo `whatsapp-web.js`. Esse conector não é uma API oficial da Meta e deve ser usado somente com um número secundário de teste. O bot inicia pausado, não oferece rota de disparo e responde apenas a mensagens recebidas depois da ativação manual. A sessão local fica em `.wwebjs_auth/`, diretório ignorado pelo Git.

Para uma conexão manual de desenvolvimento, ainda é possível preencher as variáveis `WHATSAPP_*` e executar:

Após preencher as credenciais da Meta no `.env`, vincule o número informando o slug criado no cadastro:

```bash
npm run whatsapp:link -- slug-do-restaurante
```

O endpoint `POST` valida `X-Hub-Signature-256` quando o segredo está configurado, responde `200` imediatamente e ignora eventos repetidos já gravados. Sem token da Meta, os envios funcionam em modo simulado e não fazem chamadas externas.

## Rotas principais

| Método | Rota | Função |
|---|---|---|
| `POST` | `/api/auth/login` | autenticação do painel |
| `POST` | `/api/auth/register` | criação do primeiro restaurante e proprietário |
| `GET` | `/api/dashboard` | indicadores do tenant |
| `GET` | `/api/catalog` | cardápio disponível |
| `GET` | `/api/customers` | clientes da pizzaria |
| `GET/POST` | `/api/orders` | listar e criar pedidos |
| `PATCH` | `/api/orders/:id/status` | avançar status validado |
| `GET/POST/PATCH/DELETE` | `/api/delivery-zones` | administrar áreas, taxas e prazos de entrega |
| `GET` | `/api/integrations/whatsapp` | estado e configuração pública do Embedded Signup |
| `POST` | `/api/integrations/whatsapp/complete` | troca do código e vínculo seguro do número |
| `PATCH` | `/api/integrations/whatsapp/automation` | ativar ou pausar o bot |
| `GET` | `/api/events` | stream SSE de pedidos |
| `GET/POST` | `/webhooks/whatsapp` | integração oficial Meta |
| `DELETE` | `/api/integrations/whatsapp-web/session` | encerra a sessão experimental para gerar um novo QR |

### Cardápio público EPX Food

- Abra `http://localhost:5173/r/{slug-do-restaurante}` para criar uma sessão segura e entrar no cardápio.
- A sessão é redirecionada para `/menu/s/{token}`; somente o hash do token é persistido.
- O fluxo público inclui busca, categorias, personalização de pizza, carrinho persistente, cupom, checkout idempotente e acompanhamento em `/pedido/{token}`.

Antes de usar o fluxo público com o banco, aplique a migration adicionada:

```bash
npm run db:migrate
```

## Testes e build

```bash
npm test
npm run build
```

Os testes cobrem regras conversacionais, criptografia de segredos, autenticação JWT, rejeição de tokens adulterados e assinatura HMAC do webhook da Meta.

## Produção

1. Use PostgreSQL gerenciado, TLS e backups.
2. Defina segredos no cofre da plataforma.
3. Execute `npx prisma migrate deploy -w @epx-food/api` antes de iniciar a API.
4. Sirva `apps/web/dist` em CDN ou proxy reverso.
5. Execute `npm run start -w @epx-food/api` atrás de HTTPS.
6. Troque o `EventEmitter` por Redis Pub/Sub quando houver múltiplas instâncias da API.

O asset de pizza em `apps/web/public/pizza-hero.png` foi gerado especificamente para esta interface e não depende de CDN externa.
