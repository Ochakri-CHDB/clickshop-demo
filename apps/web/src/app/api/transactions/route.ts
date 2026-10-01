import { NextRequest, NextResponse } from "next/server";
import { queryPostgres } from "@/lib/postgres";
import { getPool } from "@/lib/postgres";
import { withApiSpan } from "@/lib/api-telemetry";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// Detect if a search string targets the orders.id column (numeric). For numeric
// searches we can anchor the LIKE on a prefix and hit the primary-key index
// instead of triggering a full sequential scan.
function isNumericPrefix(s: string): boolean {
  return /^\d+$/.test(s.trim());
}

export async function GET(req: NextRequest) {
  return withApiSpan("/api/transactions", req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const search = (req.nextUrl.searchParams.get("search") ?? "").trim();
  const status = req.nextUrl.searchParams.get("status") ?? "";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);

  try {
    const params: unknown[] = [];
    const conditions: string[] = [];
    let idx = 1;

    // Only join customers when we actually need columns from it for filtering.
    const needsCustomerFilter = search.length > 0 && !isNumericPrefix(search);

    if (search) {
      if (isNumericPrefix(search)) {
        // Anchored prefix → index scan on orders.id (PK).
        conditions.push(`o.id::text LIKE $${idx} || '%'`);
        params.push(search);
        idx += 1;
      } else {
        // Text search over customers.full_name / email. ILIKE with leading %
        // is still seq-scan unless a pg_trgm GIN index exists, but we keep it
        // narrowly scoped to customers (smaller table) and avoid scanning
        // orders.id::text.
        conditions.push(`(c.full_name ILIKE $${idx} OR c.email ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx += 1;
      }
    }
    if (status) {
      conditions.push(`o.status = $${idx}`);
      params.push(status);
      idx += 1;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rowsPromise = queryPostgres(
      `SELECT o.id, o.status, o.total_amount, o.payment_method, o.country, o.channel,
              o.created_at, o.customer_id,
              c.full_name AS customer_name, c.email AS customer_email,
              c.tier AS customer_tier, c.country AS customer_country
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    // Fast-path: with no filters, use the planner's estimated row count
    // (instant, vs ~200ms count(*) on 552k rows). Prefixed with "~" by the
    // caller is unnecessary — the UI just needs an order of magnitude.
    const totalPromise: Promise<number> = (async () => {
      if (conditions.length === 0) {
        const est = await queryPostgres(
          `SELECT reltuples::bigint AS total
           FROM pg_class WHERE oid = 'public.orders'::regclass`,
        );
        return Number((est[0] as Record<string, unknown>)?.total ?? 0);
      }
      // With filters, only join customers when actually needed.
      const fromClause = needsCustomerFilter
        ? "orders o LEFT JOIN customers c ON c.id = o.customer_id"
        : "orders o";
      const countRows = await queryPostgres(
        `SELECT count(*)::int AS total FROM ${fromClause} ${where}`,
        params,
      );
      return Number((countRows[0] as Record<string, unknown>)?.total ?? 0);
    })();

    const [rows, total] = await Promise.all([rowsPromise, totalPromise]);

    return NextResponse.json({ rows, total, limit, offset });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const { id, updates } = body as { id: number; updates: Record<string, unknown> };

    if (!id) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

    const pool = getPool();

    if (updates.status || updates.total_amount || updates.payment_method || updates.country || updates.channel) {
      const orderFields: string[] = [];
      const orderVals: unknown[] = [];
      let pi = 1;
      for (const [key, val] of Object.entries(updates)) {
        if (["status", "total_amount", "payment_method", "country", "channel"].includes(key)) {
          orderFields.push(`${key} = $${pi++}`);
          orderVals.push(val);
        }
      }
      if (orderFields.length > 0) {
        await pool.query(
          `UPDATE orders SET ${orderFields.join(", ")} WHERE id = $${pi}`,
          [...orderVals, id],
        );
      }
    }

    if (updates.customer_name || updates.customer_email || updates.customer_tier || updates.customer_country) {
      const custResult = await pool.query(`SELECT customer_id FROM orders WHERE id = $1`, [id]);
      const custId = (custResult.rows[0] as Record<string, unknown>)?.customer_id;
      if (custId) {
        const custFields: string[] = [];
        const custVals: unknown[] = [];
        let pi = 1;
        const map: Record<string, string> = {
          customer_name: "full_name",
          customer_email: "email",
          customer_tier: "tier",
          customer_country: "country",
        };
        for (const [key, val] of Object.entries(updates)) {
          if (map[key]) {
            custFields.push(`${map[key]} = $${pi++}`);
            custVals.push(val);
          }
        }
        if (custFields.length > 0) {
          await pool.query(
            `UPDATE customers SET ${custFields.join(", ")} WHERE id = $${pi}`,
            [...custVals, custId],
          );
        }
      }
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
