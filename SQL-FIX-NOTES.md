# SQL Fix Notes

The master SQL was corrected for PostgreSQL/PL/pgSQL syntax.

Most importantly, PL/pgSQL does not support `+=` assignment. The payment-order function now uses explicit `:=` assignment and explicit enum casts.

The file also avoids `CREATE POLICY IF NOT EXISTS`; policies are dropped with `DROP POLICY IF EXISTS` before recreation.
