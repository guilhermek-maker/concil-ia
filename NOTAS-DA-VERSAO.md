# Notas da versão

## 3.0 — nuvem, integrações, IA e inteligência comercial (set/2026)

- **Modo nuvem (Supabase)**: login por e-mail, workspace compartilhado pela equipe, dados sincronizados entre computadores, gravação incremental com indicador de status. Sem configuração, continua no modo local.
- **Integrações oficiais (OAuth)**: Bling (pedidos, NF, itens, cliente, UF, contas a receber/pagar), Mercado Livre + Mercado Pago (tarifas, frete, liberações), Shopee (escrow e repasses), Magalu (pedidos). Sincronização por período, retomável, sem sobrescrever vínculos, anotações ou fechamentos.
- **Assistente de IA (Claude)**: consulta pedidos, liberações, produtos, estados, clientes e contas; investiga divergências; propõe vínculos em lote para confirmação.
- **Conciliação em lote** das correspondências exatas (pedido idêntico + valor exato), com revisão e auditoria.
- **Novas telas**: Integrações, Entradas e saídas, Produtos (ranking e curva ABC), Estados (mapa do Brasil), Clientes · CRM (segmentos, estágios, etiquetas, contatos, follow-ups, listas de campanha).
- **Importação**: colunas opcionais de cliente, CPF/CNPJ, UF, produto, SKU e quantidade.
- Navegação por endereço (`#clientes`, `#integracoes`…), publicação automática via GitHub Actions.

## 2.0 — base operacional (versão publicada no ChatGPT Sites)

Base vazia, importação multiformato (CSV, planilhas, PDF com texto), matching com confirmação, investigação por regras, fechamento, relatórios e auditoria locais.
