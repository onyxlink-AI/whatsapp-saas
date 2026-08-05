-- ============================================================
-- Migration: 20260808000003_team_chat_custom_channel_kind
-- Separada a propósito de 20260808000004_team_chat_custom_channels.sql:
-- Postgres no permite usar un valor nuevo de un enum dentro de la MISMA
-- transacción en la que se añade con ALTER TYPE ... ADD VALUE (error
-- "unsafe use of new value ... of enum type", SQLSTATE 55P04) — hay que
-- confirmarlo en una migración propia antes de que la siguiente lo use en
-- un CHECK constraint o en cuerpos de función.
-- ============================================================

ALTER TYPE team_channel_kind ADD VALUE IF NOT EXISTS 'custom';

-- ============================================================
-- End of migration: 20260808000003_team_chat_custom_channel_kind
-- ============================================================
