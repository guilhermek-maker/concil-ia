-- Estoque: cadastro de produtos com saldo e custo (lidos do Bling enquanto ele for o sistema de estoque)
-- e parâmetros de reposição definidos pela equipe no EcomBalance (nunca sobrescritos pela sincronização).
create table if not exists public.produtos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,                 -- SKU (código do produto); sem código: bling-<id>
  bling_id text,
  pai text,                         -- SKU/ID do produto pai (variações)
  nome text not null,
  formato text,                     -- S simples | V com variações | E composição/kit
  situacao text,                    -- A ativo | I inativo
  preco numeric(14,2),
  custo numeric(14,4),
  saldo numeric(14,3),              -- saldo virtual total no Bling
  imagem text,
  sincronizado_em timestamptz,
  -- equipe (EcomBalance)
  minimo numeric(14,3),             -- estoque de segurança
  prazo_reposicao int,              -- dias entre pedir e receber
  fornecedor text,
  localizacao text,
  observacao text,
  ignorar boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists produtos_bling on public.produtos (workspace_id, bling_id);
alter table public.produtos enable row level security;
drop policy if exists produtos_select on public.produtos;
create policy produtos_select on public.produtos for select using (public.is_member(workspace_id));
drop policy if exists produtos_update on public.produtos;
create policy produtos_update on public.produtos for update using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- Ajustes e movimentos manuais de estoque feitos no EcomBalance (inventário, perda, amostra, devolução recebida).
create table if not exists public.estoque_movimentos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  sku text not null,
  data date not null,
  tipo text not null check (tipo in ('inventario','ajuste','perda','devolucao','amostra','transferencia')),
  quantidade numeric(14,3) not null,  -- positivo entra, negativo sai; inventário = contagem física
  custo numeric(14,4),
  referencia text,                    -- pedido, atendimento, nota…
  observacao text,
  criado_por text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists estoque_mov_sku on public.estoque_movimentos (workspace_id, sku, data);
alter table public.estoque_movimentos enable row level security;
drop policy if exists estoque_mov_all on public.estoque_movimentos;
create policy estoque_mov_all on public.estoque_movimentos for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

drop trigger if exists auditar on public.produtos;
create trigger auditar after insert or update or delete on public.produtos for each row execute function public.auditar('so_usuario');
drop trigger if exists auditar on public.estoque_movimentos;
create trigger auditar after insert or update or delete on public.estoque_movimentos for each row execute function public.auditar();
