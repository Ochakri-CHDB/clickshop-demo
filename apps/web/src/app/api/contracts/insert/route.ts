import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/postgres";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

interface ContractPayload {
  customer: {
    full_name: string;
    email: string | null;
    country: string;
    tier: string;
    is_vip: boolean;
  };
  order: {
    status: string;
    total_amount: number;
    payment_method: string;
    country: string;
    channel: string;
  };
  items: {
    product_name: string;
    category: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
  payment: {
    status: string;
    provider: string | null;
  };
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const pool = getPool();
  const client = await pool.connect();

  try {
    const body: ContractPayload = await req.json();
    const { customer, order, items, payment } = body;

    await client.query("BEGIN");

    await client.query("SELECT setval('customers_id_seq', COALESCE((SELECT MAX(id) FROM customers), 0) + 1, false)");
    await client.query("SELECT setval('orders_id_seq', COALESCE((SELECT MAX(id) FROM orders), 0) + 1, false)");
    await client.query("SELECT setval('products_id_seq', COALESCE((SELECT MAX(id) FROM products), 0) + 1, false)");
    await client.query("SELECT setval('order_items_id_seq', COALESCE((SELECT MAX(id) FROM order_items), 0) + 1, false)");

    const custResult = await client.query(
      `INSERT INTO customers (email, full_name, country, tier, is_vip)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, country = EXCLUDED.country, tier = EXCLUDED.tier
       RETURNING id`,
      [
        customer.email || `contract-${Date.now()}@clickshop.io`,
        customer.full_name,
        customer.country,
        customer.tier || "Standard",
        customer.is_vip || false,
      ],
    );
    const customerId = custResult.rows[0].id;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, status, total_amount, payment_method, country, channel)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        customerId,
        order.status || "pending",
        order.total_amount,
        order.payment_method,
        order.country || customer.country,
        order.channel || "direct",
      ],
    );
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      const prodResult = await client.query(
        `INSERT INTO products (sku, name, category, price, inventory_available)
         VALUES ($1, $2, $3, $4, 1000)
         ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price
         RETURNING id`,
        [
          `CONTRACT-${item.product_name.replace(/\s+/g, "-").toUpperCase().slice(0, 30)}`,
          item.product_name,
          item.category || "General",
          item.unit_price,
        ],
      );
      const productId = prodResult.rows[0].id;

      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, productId, item.quantity, item.unit_price, item.total_price],
      );
    }

    await client.query(
      `INSERT INTO payment_status_current (order_id, status, provider)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO UPDATE SET status = EXCLUDED.status, provider = EXCLUDED.provider, updated_at = NOW()`,
      [orderId, payment.status || "pending", payment.provider],
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      customerId,
      orderId,
      itemsInserted: items.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Contract Insert]", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
