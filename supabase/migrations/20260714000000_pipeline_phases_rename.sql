-- ============================================================================
-- Sustituye las 6 etapas genéricas de venta B2B del pipeline por el embudo
-- de 4 fases del negocio (exploración → interés → listo para comprar →
-- cliente), + 'lost' que se mantiene como estado manual/terminal. Verificado
-- que no hay deals reales en producción antes de este cambio (0 filas).
--
-- 'negotiation' no se puede eliminar del tipo enum de Postgres sin recrear el
-- tipo entero; queda definida pero sin uso — inofensivo (ninguna fila la
-- referencia y el código de la app ya no la incluye en su lista de valores).
-- ============================================================================

ALTER TYPE deal_stage RENAME VALUE 'new' TO 'exploracion';
ALTER TYPE deal_stage RENAME VALUE 'contacted' TO 'interes';
ALTER TYPE deal_stage RENAME VALUE 'proposal_sent' TO 'listo_para_comprar';
ALTER TYPE deal_stage RENAME VALUE 'won' TO 'cliente';

ALTER TABLE deals ALTER COLUMN stage SET DEFAULT 'exploracion';
