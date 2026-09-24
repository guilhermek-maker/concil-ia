-- Detalhamento de cada liberação (tarifas, cupons, frete, valor bruto do pagamento) vindo da plataforma.
alter table public.receipts add column if not exists details jsonb;
