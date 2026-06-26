-- Enable Row Level Security (RLS) on all tables in the dx schema.
--
-- Why: the dx schema is exposed to Supabase's Data API (PostgREST). Without RLS,
-- anyone holding the (public) anon key + project URL could read/edit/delete data
-- through the auto-generated REST API. Several tables hold PII (e.g. InstoreOrder:
-- customerName / phone / deliveryAddress) and business data (Sale, ConfirmedOrder).
--
-- IMPORTANT — safety guard:
-- This app's runtime accesses the DB only via Prisma. Enabling RLS WITHOUT policies
-- is a default-deny: any role that does NOT bypass RLS (i.e. is not BYPASSRLS and is
-- not the table owner) will be UNABLE TO WRITE -> "data cannot be saved".
-- To avoid silently breaking writes, the guard below aborts the whole migration
-- (it runs in a transaction, so nothing is applied) unless the connecting role can
-- bypass RLS. If it aborts, do NOT force RLS; instead un-expose the `dx` schema from
-- the Data API (Supabase: Settings -> API -> Exposed schemas), which removes the
-- warning with zero RLS changes.

DO $$
BEGIN
  IF NOT COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION
      'Aborting: current role "%" does not have BYPASSRLS. Enabling RLS here would block application writes (data cannot be saved). Prefer un-exposing the dx schema from the Data API instead.',
      current_user;
  END IF;
END $$;

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
