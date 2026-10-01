import { getClickHouseClient } from "./clickhouse";
import { getPool } from "./postgres";

type Target = "clickhouse" | "postgres" | "both";

type Weighted<T> = [T, number][];

function wpick<T>(table: Weighted<T>): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [val, w] of table) {
    r -= w;
    if (r <= 0) return val;
  }
  return table[table.length - 1][0];
}

const W_COUNTRIES: Weighted<string> = [
  ["US", 28], ["DE", 16], ["FR", 14], ["UK", 12], ["ES", 5],
  ["IT", 4], ["NL", 3], ["CA", 3], ["JP", 3], ["BR", 3],
  ["AU", 2], ["IN", 2], ["MX", 2], ["MA", 1.5], ["PL", 1.5],
];
const W_DEVICES: Weighted<"desktop" | "mobile" | "tablet"> = [
  ["mobile", 52], ["desktop", 38], ["tablet", 10],
];
const W_PAGE_TYPES: Weighted<string> = [
  ["home", 25], ["category", 22], ["product", 30], ["cart", 12], ["checkout", 8], ["confirmation", 3],
];
const W_CATEGORIES: Weighted<string> = [
  ["Electronics", 28], ["Clothing", 22], ["Home", 14], ["Beauty", 11],
  ["Sports", 8], ["Food", 7], ["Books", 6], ["Toys", 4],
];
const W_CART_ACTIONS: Weighted<"add" | "remove" | "update_qty"> = [
  ["add", 65], ["remove", 20], ["update_qty", 15],
];
const W_CHECKOUT_TYPES: Weighted<string> = [
  ["page_view", 35], ["begin_checkout", 25], ["add_payment", 18], ["purchase", 14], ["abandon", 8],
];
const W_PAY_METHODS: Weighted<string> = [
  ["credit_card", 42], ["paypal", 26], ["apple_pay", 18], ["bank_transfer", 14],
];
const W_PAY_STATUSES: Weighted<string> = [
  ["success", 82], ["pending", 8], ["failed", 7], ["refunded", 3],
];
const W_PROVIDERS: Weighted<string> = [
  ["stripe", 45], ["adyen", 25], ["paypal", 20], ["square", 10],
];
const W_WAREHOUSES: Weighted<string> = [
  ["EU-Central", 38], ["US-East", 30], ["US-West", 18], ["APAC", 14],
];
const W_CHANNELS: Weighted<string> = [
  ["web", 45], ["mobile", 30], ["marketplace", 15], ["store", 10],
];
const W_INV_TYPES: Weighted<string> = [
  ["sale", 50], ["restock", 25], ["return", 15], ["adjustment", 10],
];
const W_TIERS: Weighted<string> = [
  ["bronze", 45], ["silver", 30], ["gold", 18], ["platinum", 7],
];
const W_ORDER_STATUSES: Weighted<string> = [
  ["completed", 62], ["shipped", 18], ["pending", 14], ["cancelled", 6],
];
const W_REFERRERS: Weighted<string> = [
  ["google.com", 32], ["direct", 24], ["facebook.com", 14], ["email", 12],
  ["instagram.com", 10], ["tiktok.com", 8],
];
const W_FAILURE_REASONS: Weighted<string> = [
  ["insufficient_funds", 35], ["card_declined", 25], ["expired_card", 15],
  ["fraud_suspected", 10], ["network_error", 8], ["3ds_failed", 7],
];

interface Product { name: string; sku: string; priceMin: number; priceMax: number; category: string; weight: number }
const PRODUCTS: Product[] = [
  { name: "MacBook Pro 14", sku: "SKU-1001", priceMin: 1499, priceMax: 2499, category: "Electronics", weight: 8 },
  { name: "iPhone 16 Pro", sku: "SKU-1002", priceMin: 999, priceMax: 1399, category: "Electronics", weight: 12 },
  { name: "AirPods Pro", sku: "SKU-1003", priceMin: 189, priceMax: 249, category: "Electronics", weight: 15 },
  { name: "Samsung Galaxy S25", sku: "SKU-1004", priceMin: 799, priceMax: 1199, category: "Electronics", weight: 10 },
  { name: "Sony WH-1000XM5", sku: "SKU-1005", priceMin: 298, priceMax: 398, category: "Electronics", weight: 9 },
  { name: "Logitech MX Master", sku: "SKU-1006", priceMin: 79, priceMax: 99, category: "Electronics", weight: 7 },
  { name: "Nike Air Max 90", sku: "SKU-2001", priceMin: 110, priceMax: 160, category: "Clothing", weight: 14 },
  { name: "Levis 501 Jeans", sku: "SKU-2002", priceMin: 69, priceMax: 98, category: "Clothing", weight: 11 },
  { name: "North Face Jacket", sku: "SKU-2003", priceMin: 150, priceMax: 320, category: "Clothing", weight: 8 },
  { name: "Adidas Ultraboost", sku: "SKU-2004", priceMin: 140, priceMax: 190, category: "Clothing", weight: 10 },
  { name: "Dyson V15 Detect", sku: "SKU-3001", priceMin: 549, priceMax: 749, category: "Home", weight: 6 },
  { name: "Nespresso Vertuo", sku: "SKU-3002", priceMin: 149, priceMax: 219, category: "Home", weight: 9 },
  { name: "IKEA Kallax Shelf", sku: "SKU-3003", priceMin: 49, priceMax: 89, category: "Home", weight: 8 },
  { name: "La Roche-Posay SPF50", sku: "SKU-4001", priceMin: 18, priceMax: 32, category: "Beauty", weight: 13 },
  { name: "Estée Lauder Serum", sku: "SKU-4002", priceMin: 62, priceMax: 95, category: "Beauty", weight: 7 },
  { name: "Yoga Mat Premium", sku: "SKU-5001", priceMin: 29, priceMax: 69, category: "Sports", weight: 9 },
  { name: "Protein Whey 2kg", sku: "SKU-5002", priceMin: 35, priceMax: 55, category: "Sports", weight: 6 },
  { name: "Organic Granola Box", sku: "SKU-6001", priceMin: 6, priceMax: 14, category: "Food", weight: 10 },
  { name: "Nespresso Capsules x50", sku: "SKU-6002", priceMin: 28, priceMax: 42, category: "Food", weight: 8 },
  { name: "Atomic Habits", sku: "SKU-7001", priceMin: 12, priceMax: 22, category: "Books", weight: 7 },
  { name: "Kindle Paperwhite", sku: "SKU-7002", priceMin: 129, priceMax: 189, category: "Books", weight: 5 },
  { name: "LEGO Technic Set", sku: "SKU-8001", priceMin: 39, priceMax: 159, category: "Toys", weight: 6 },
  { name: "Nintendo Switch Game", sku: "SKU-8002", priceMin: 39, priceMax: 59, category: "Toys", weight: 5 },
];
const W_PRODUCTS: Weighted<Product> = PRODUCTS.map((p) => [p, p.weight]);

const W_PAGES: Weighted<string> = [
  ["/", 20], ["/products", 18], ["/category/electronics", 12], ["/category/clothing", 10],
  ["/product/iphone-16", 9], ["/product/airpods-pro", 7], ["/cart", 10], ["/checkout", 6],
  ["/account", 5], ["/deals", 3],
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function esc(s: string) { return s.replace(/'/g, "''"); }
function ri(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rf(min: number, max: number) {
  return +(Math.random() * (max - min) + min).toFixed(2);
}
function uid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function insertCH(query: string, retries = 3) {
  const client = getClickHouseClient();
  for (let attempt = 0; ; attempt++) {
    try {
      await client.command({ query });
      return;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

async function chBatch(mul: number): Promise<number> {
  const now = ts();
  let total = 0;
  const vals = (n: number, fn: () => string) =>
    Array.from({ length: n }, fn).join(",");

  const hour = new Date().getHours();
  const priceProfile = hour >= 20 ? 0.8 : hour >= 18 ? 1.35 : hour >= 14 ? 1.15 : hour >= 10 ? 1.0 : hour >= 7 ? 0.75 : 0.5;

  const pe = Math.round(80 * mul);
  await insertCH(
    `INSERT INTO page_events (event_id, event_time, session_id, user_id, page_url, page_type, device, country, referrer) VALUES ` +
    vals(pe, () =>
      `('${uid()}','${now}','${uid()}',${ri(1,50000)},'${wpick(W_PAGES)}','${wpick(W_PAGE_TYPES)}','${wpick(W_DEVICES)}','${wpick(W_COUNTRIES)}','${wpick(W_REFERRERS)}')`
    )
  );
  total += pe;

  const ce = Math.round(25 * mul);
  await insertCH(
    `INSERT INTO cart_events (event_id, event_time, session_id, user_id, product_sku, product_name, category, action, quantity, unit_price, country, device) VALUES ` +
    vals(ce, () => {
      const prod = wpick(W_PRODUCTS);
      const qty = wpick<number>([[1, 50], [2, 28], [3, 12], [4, 7], [5, 3]]);
      const up = rf(prod.priceMin, prod.priceMax);
      return `('${uid()}','${now}','${uid()}',${ri(1,50000)},'${prod.sku}','${esc(prod.name)}','${prod.category}','${wpick(W_CART_ACTIONS)}',${qty},${up},'${wpick(W_COUNTRIES)}','${wpick(W_DEVICES)}')`;
    })
  );
  total += ce;

  const co = Math.round(15 * mul);
  await insertCH(
    `INSERT INTO checkout_events (event_id, event_time, session_id, user_id, event_type, cart_value, items_count, country, device, payment_method) VALUES ` +
    vals(co, () => {
      const items = wpick<number>([[1, 35], [2, 28], [3, 18], [4, 10], [5, 5], [6, 3], [7, 1]]);
      const cartVal = rf(25, 400) * priceProfile * (0.8 + Math.random() * 0.4) * Math.sqrt(items);
      return `('${uid()}','${now}','${uid()}',${ri(1,50000)},'${wpick(W_CHECKOUT_TYPES)}',${+cartVal.toFixed(2)},${items},'${wpick(W_COUNTRIES)}','${wpick(W_DEVICES)}','${wpick(W_PAY_METHODS)}')`;
    })
  );
  total += co;

  const pay = Math.round(12 * mul);
  await insertCH(
    `INSERT INTO payment_events (event_id, event_time, order_id, user_id, amount, currency, payment_method, provider, status, failure_reason, country) VALUES ` +
    vals(pay, () => {
      const st = wpick(W_PAY_STATUSES);
      const reason = st === "failed" ? wpick(W_FAILURE_REASONS) : "";
      const amt = rf(15, 500) * priceProfile * (0.7 + Math.random() * 0.6);
      return `('${uid()}','${now}',${ri(1,500000)},${ri(1,50000)},${+amt.toFixed(2)},'EUR','${wpick(W_PAY_METHODS)}','${wpick(W_PROVIDERS)}','${st}','${reason}','${wpick(W_COUNTRIES)}')`;
    })
  );
  total += pay;

  const oe = Math.round(15 * mul);
  await insertCH(
    `INSERT INTO order_events (event_id, event_time, order_id, customer_id, product_sku, product_name, category, quantity, unit_price, total_amount, payment_method, status, country, channel, device) VALUES ` +
    vals(oe, () => {
      const prod = wpick(W_PRODUCTS);
      const qty = wpick<number>([[1, 50], [2, 28], [3, 12], [4, 7], [5, 3]]);
      const jitter = 0.85 + Math.random() * 0.3;
      const up = rf(prod.priceMin, prod.priceMax) * priceProfile * jitter;
      return `('${uid()}','${now}',${ri(1,500000)},${ri(1,50000)},'${prod.sku}','${esc(prod.name)}','${prod.category}',${qty},${+up.toFixed(2)},${+(qty * up).toFixed(2)},'${wpick(W_PAY_METHODS)}','${wpick(W_ORDER_STATUSES)}','${wpick(W_COUNTRIES)}','${wpick(W_CHANNELS)}','${wpick(W_DEVICES)}')`;
    })
  );
  total += oe;

  const ie = Math.round(12 * mul);
  await insertCH(
    `INSERT INTO inventory_events (event_id, event_time, product_sku, product_name, category, change_type, quantity_change, quantity_after, warehouse) VALUES ` +
    vals(ie, () => {
      const prod = wpick(W_PRODUCTS);
      const changeType = wpick(W_INV_TYPES);
      const qtyChange = changeType === "sale" ? -ri(1, 20) : changeType === "return" ? ri(1, 5) : ri(10, 200);
      return `('${uid()}','${now}','${prod.sku}','${esc(prod.name)}','${prod.category}','${changeType}',${qtyChange},${ri(0,1000)},'${wpick(W_WAREHOUSES)}')`;
    })
  );
  total += ie;

  return total;
}

const FIRST_NAMES = ["Emma", "Liam", "Sophia", "Noah", "Olivia", "Lucas", "Amelia", "Ethan", "Mia", "James", "Charlotte", "Alexander", "Isabella", "Benjamin", "Ava", "Daniel", "Harper", "Henri", "Léa", "Maximilian"];
const LAST_NAMES = ["Smith", "Johnson", "Müller", "Dupont", "García", "Rossi", "Silva", "Tanaka", "Patel", "Wilson", "Brown", "Martin", "Bernard", "Schmidt", "López", "Ferrari", "Santos", "Andersen", "Kowalski", "El Amrani"];

let _pgProductsSeeded = false;

async function ensureProducts(pool: ReturnType<typeof getPool>) {
  if (_pgProductsSeeded) return;
  const check = await pool.query(`SELECT count(*)::int AS cnt FROM products`);
  if (Number(check.rows[0]?.cnt) > 0) { _pgProductsSeeded = true; return; }
  const prods = PRODUCTS.map((p, i) => [
    i + 1, p.sku, p.name, p.category,
    +((p.priceMin + p.priceMax) / 2).toFixed(2),
    ri(100, 5000),
  ]);
  for (const p of prods) {
    await pool.query(
      `INSERT INTO products (id, sku, name, category, price, inventory_available, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (id) DO NOTHING`,
      p,
    );
  }
  _pgProductsSeeded = true;
}

async function pgBatch(mul: number): Promise<number> {
  const pool = getPool();
  await ensureProducts(pool);
  let total = 0;
  const hour = new Date().getHours();
  const priceProfile = hour >= 20 ? 0.8 : hour >= 18 ? 1.35 : hour >= 14 ? 1.15 : hour >= 10 ? 1.0 : hour >= 7 ? 0.75 : 0.5;

  const custCount = Math.max(1, Math.round(3 * mul));
  const custQueries: Promise<unknown>[] = [];
  const custIds: number[] = [];
  for (let i = 0; i < custCount; i++) {
    const id = ri(1, 20000);
    custIds.push(id);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const tier = wpick(W_TIERS);
    const isVip = tier === "platinum" || (tier === "gold" && Math.random() > 0.5);
    custQueries.push(
      pool.query(
        `INSERT INTO customers (id, email, full_name, country, tier, is_vip, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`,
        [id, `${first.toLowerCase()}.${last.toLowerCase()}${ri(1,99)}@shop.io`, `${first} ${last}`, wpick(W_COUNTRIES), tier, isVip],
      ),
    );
  }
  await Promise.allSettled(custQueries);
  total += custCount;

  const ordCount = Math.max(1, Math.round(20 * mul));
  const orderQueries: Promise<unknown>[] = [];
  const orderIds: number[] = [];
  for (let i = 0; i < ordCount; i++) {
    const oid = ri(1000000, 9999999);
    orderIds.push(oid);
    const prod = wpick(W_PRODUCTS);
    const qty = wpick<number>([[1, 50], [2, 28], [3, 12], [4, 7], [5, 3]]);
    const amount = +(rf(prod.priceMin, prod.priceMax) * qty * priceProfile * (0.85 + Math.random() * 0.3)).toFixed(2);
    orderQueries.push(
      pool.query(
        `INSERT INTO orders (id, customer_id, status, total_amount, payment_method, country, channel, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT (id) DO NOTHING`,
        [oid, pick(custIds), wpick(W_ORDER_STATUSES), amount, wpick(W_PAY_METHODS), wpick(W_COUNTRIES), wpick(W_CHANNELS)],
      ),
    );
  }
  await Promise.allSettled(orderQueries);
  total += ordCount;

  const itemQueries: Promise<unknown>[] = [];
  const itemCount = Math.max(1, Math.round(40 * mul));
  for (let i = 0; i < itemCount; i++) {
    const iid = ri(10000000, 99999999);
    const prod = wpick(W_PRODUCTS);
    const prodIdx = PRODUCTS.indexOf(prod) + 1;
    const qty = wpick<number>([[1, 50], [2, 28], [3, 12], [4, 7], [5, 3]]);
    const up = rf(prod.priceMin, prod.priceMax) * priceProfile * (0.85 + Math.random() * 0.3);
    itemQueries.push(
      pool.query(
        `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [iid, pick(orderIds), prodIdx, qty, +up.toFixed(2), +(qty * up).toFixed(2)],
      ),
    );
  }
  await Promise.allSettled(itemQueries);
  total += itemCount;

  const payQueries: Promise<unknown>[] = [];
  const payCount = Math.max(1, Math.round(10 * mul));
  for (let i = 0; i < payCount; i++) {
    const st = wpick(W_PAY_STATUSES);
    payQueries.push(
      pool.query(
        `INSERT INTO payment_status_current (order_id, status, provider, failure_reason, updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (order_id) DO UPDATE SET status=$2, provider=$3, failure_reason=$4, updated_at=NOW()`,
        [pick(orderIds), st, wpick(W_PROVIDERS), st === "failed" ? wpick(W_FAILURE_REASONS) : ""],
      ),
    );
  }
  await Promise.allSettled(payQueries);
  total += payCount;

  return total;
}

export async function runBatch(
  target: Target = "both",
  mul = 1
): Promise<{ chRows: number; pgRows: number; error: string | null }> {
  let chRows = 0;
  let pgRows = 0;
  let error: string | null = null;

  try {
    if (target === "clickhouse" || target === "both") {
      chRows = await chBatch(mul);
    }
  } catch (err) {
    error = `CH: ${(err as Error).message}`;
  }

  try {
    if (target === "postgres" || target === "both") {
      pgRows = await pgBatch(mul);
    }
  } catch (err) {
    error = (error ? error + " | " : "") + `PG: ${(err as Error).message}`;
  }

  return { chRows, pgRows, error };
}

export async function seedLastWeek(chTarget = 20000, pgTarget = 100): Promise<{ chRows: number; pgRows: number; elapsedMs: number }> {
  const t0 = Date.now();
  let chTotal = 0;
  let pgTotal = 0;

  const chMul = Math.max(1, Math.round(chTarget / 159));
  try {
    for (let day = 7; day >= 1; day--) {
      const rows = await chBatchWithOffset(chMul, day);
      chTotal += rows;
    }
  } catch (err) {
    console.error("[seed-week] CH error:", (err as Error).message);
  }

  const pgMul = Math.max(0.1, pgTarget / 74);
  try {
    pgTotal = await pgBatch(pgMul);
  } catch (err) {
    console.error("[seed-week] PG error:", (err as Error).message);
  }

  return { chRows: chTotal, pgRows: pgTotal, elapsedMs: Date.now() - t0 };
}

async function chBatchWithOffset(mul: number, daysAgo: number): Promise<number> {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const hours = Math.floor(Math.random() * 24);
  date.setHours(hours, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
  const now = date.toISOString().slice(0, 19).replace("T", " ");

  let total = 0;
  const vals = (n: number, fn: () => string) => Array.from({ length: n }, fn).join(",");
  const priceProfile = hours >= 20 ? 0.8 : hours >= 18 ? 1.35 : hours >= 14 ? 1.15 : hours >= 10 ? 1.0 : hours >= 7 ? 0.75 : 0.5;

  const pe = Math.round(80 * mul);
  await insertCH(`INSERT INTO page_events (event_id, event_time, session_id, user_id, page_url, page_type, device, country, referrer) VALUES ` +
    vals(pe, () => `('${uid()}','${now}','${uid()}',${ri(1,50000)},'${wpick(W_PAGES)}','${wpick(W_PAGE_TYPES)}','${wpick(W_DEVICES)}','${wpick(W_COUNTRIES)}','${wpick(W_REFERRERS)}')`));
  total += pe;

  const ce = Math.round(25 * mul);
  await insertCH(`INSERT INTO cart_events (event_id, event_time, session_id, user_id, product_sku, product_name, category, action, quantity, unit_price, country, device) VALUES ` +
    vals(ce, () => { const prod = wpick(W_PRODUCTS); return `('${uid()}','${now}','${uid()}',${ri(1,50000)},'${prod.sku}','${esc(prod.name)}','${prod.category}','${wpick(W_CART_ACTIONS)}',${wpick<number>([[1,50],[2,28],[3,12]])},${rf(prod.priceMin, prod.priceMax)},'${wpick(W_COUNTRIES)}','${wpick(W_DEVICES)}')`; }));
  total += ce;

  const co = Math.round(15 * mul);
  await insertCH(`INSERT INTO checkout_events (event_id, event_time, session_id, user_id, event_type, cart_value, items_count, country, device, payment_method) VALUES ` +
    vals(co, () => { const items = wpick<number>([[1,35],[2,28],[3,18]]); return `('${uid()}','${now}','${uid()}',${ri(1,50000)},'${wpick(W_CHECKOUT_TYPES)}',${+(rf(25,400)*priceProfile*Math.sqrt(items)).toFixed(2)},${items},'${wpick(W_COUNTRIES)}','${wpick(W_DEVICES)}','${wpick(W_PAY_METHODS)}')`; }));
  total += co;

  const pay = Math.round(12 * mul);
  await insertCH(`INSERT INTO payment_events (event_id, event_time, order_id, user_id, amount, currency, payment_method, provider, status, failure_reason, country) VALUES ` +
    vals(pay, () => { const st = wpick(W_PAY_STATUSES); return `('${uid()}','${now}',${ri(1,500000)},${ri(1,50000)},${+(rf(15,500)*priceProfile).toFixed(2)},'EUR','${wpick(W_PAY_METHODS)}','${wpick(W_PROVIDERS)}','${st}','${st==="failed"?wpick(W_FAILURE_REASONS):""}','${wpick(W_COUNTRIES)}')`; }));
  total += pay;

  const oe = Math.round(15 * mul);
  await insertCH(`INSERT INTO order_events (event_id, event_time, order_id, customer_id, product_sku, product_name, category, quantity, unit_price, total_amount, payment_method, status, country, channel, device) VALUES ` +
    vals(oe, () => { const prod = wpick(W_PRODUCTS); const qty = wpick<number>([[1,50],[2,28],[3,12]]); const up = rf(prod.priceMin, prod.priceMax)*priceProfile; return `('${uid()}','${now}',${ri(1,500000)},${ri(1,50000)},'${prod.sku}','${esc(prod.name)}','${prod.category}',${qty},${+up.toFixed(2)},${+(qty*up).toFixed(2)},'${wpick(W_PAY_METHODS)}','${wpick(W_ORDER_STATUSES)}','${wpick(W_COUNTRIES)}','${wpick(W_CHANNELS)}','${wpick(W_DEVICES)}')`; }));
  total += oe;

  const ie = Math.round(12 * mul);
  await insertCH(`INSERT INTO inventory_events (event_id, event_time, product_sku, product_name, category, change_type, quantity_change, quantity_after, warehouse) VALUES ` +
    vals(ie, () => { const prod = wpick(W_PRODUCTS); const ct = wpick(W_INV_TYPES); return `('${uid()}','${now}','${prod.sku}','${esc(prod.name)}','${prod.category}','${ct}',${ct==="sale"?-ri(1,20):ri(1,200)},${ri(0,1000)},'${wpick(W_WAREHOUSES)}')`; }));
  total += ie;

  return total;
}
