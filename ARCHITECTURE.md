# Arquitetura e plano de evolução

## Decisões centrais

### Backend é a fonte da verdade

Preço, disponibilidade, desconto, taxa e total nunca são aceitos do WhatsApp ou do painel. `orders.service.ts` carrega os produtos pelo tenant, valida disponibilidade e recalcula tudo dentro de uma transação. O mesmo padrão deve ser usado para cupons, pizzas configuráveis e promoções.

### Multi-tenant desde a primeira consulta

O JWT contém `restaurantId`, derivado do usuário autenticado. Serviços recebem esse identificador e o incluem nos filtros. Webhooks descobrem o tenant pelo `phoneNumberId` registrado. IDs fornecidos pelo cliente nunca são suficientes para acessar um registro.

### Conversa determinística

A IA futura poderá transformar linguagem natural em intenção estruturada, mas não executará regra comercial. A máquina de estados persiste `state`, `mode` e `context`; reinícios não apagam a etapa do cliente.

### Integrações atrás de contratos

`WhatsAppService` concentra a Graph API. Um futuro `PaymentService` deve seguir o mesmo desenho, com implementação manual e adaptadores Mercado Pago/PIX separados.

## Fluxo crítico de confirmação

```text
mensagem → idempotência → tenant → cliente → conversa → intenção
  → catálogo disponível → carrinho → recálculo do backend
  → resumo → confirmação explícita → transação do pedido → notificação SSE
```

Antes da confirmação: reconsultar produtos, disponibilidade, tamanhos, sabores, bordas, adicionais, cupom, zona e preços. Somente depois criar pedido, itens, pagamento e histórico de status na mesma transação.

## Fases

### Fase 1 — núcleo operacional

- CRUDs completos de categoria, produto, tamanho, sabor, borda e zona;
- carrinho persistente e configuração de pizza meio a meio;
- completar o fluxo conversacional com listas/botões oficiais;
- mensagens automáticas em cada mudança de status;
- auditoria e testes de integração com PostgreSQL.

### Fase 2 — crescimento

- `PaymentService`, PIX e Mercado Pago;
- cupons e promoções com agenda;
- atendimento humano no painel;
- relatórios exportáveis;
- interpretação opcional por IA com schema estrito.

### Fase 3 — SaaS

- onboarding e provisionamento de pizzarias;
- planos e assinaturas;
- Super Admin separado do painel do restaurante;
- Redis para eventos, filas para webhooks e workers de mensagens;
- observabilidade central e limites por plano.

## Pontos de produção

- criptografar tokens da Meta em repouso;
- exigir `META_APP_SECRET` em produção e monitorar falhas de assinatura;
- mover processamento para fila, mantendo o ACK imediato;
- aplicar rotação de refresh token ou sessão segura;
- adicionar trilha de auditoria para mudança de preços e status;
- usar storage de objetos para imagens do cardápio.
