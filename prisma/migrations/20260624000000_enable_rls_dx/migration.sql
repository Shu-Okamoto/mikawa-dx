-- Enable Row Level Security (RLS) on all tables in the dx schema.
--
-- Why: the dx schema is exposed to Supabase's Data API (PostgREST). Without RLS,
-- anyone holding the (public) anon key + project URL could read/edit/delete data
-- through the auto-generated REST API. Several tables hold PII (e.g. InstoreOrder:
-- customerName / phone / deliveryAddress) and business data (Sale, ConfirmedOrder).
--
-- Safe for this app: all runtime access goes through Prisma using the Supabase
-- `postgres` role, which has BYPASSRLS and owns these tables. Enabling RLS with no
-- policies therefore denies the anon/authenticated PostgREST roles while leaving
-- Prisma's queries fully functional. No policies are added on purpose (default-deny).

ALTER TABLE "dx"."Store"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."Vendor"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."Product"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."OrderProduct"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."User"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."DailyOrder"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."ConfirmedOrder"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."InstoreOrder"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."OrderCategoryMemo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."Sale"              ENABLE ROW LEVEL SECURITY;
