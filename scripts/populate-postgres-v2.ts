/**
 * Populate PostgreSQL — v2 (cloud-safe).
 * No TRUNCATE, no DROP, no DELETE on potentially locked tables.
 * Uses INSERT ... ON CONFLICT DO NOTHING where possible.
 * Skips order_items FK to avoid conflict with locked orders.
 */
import { Pool, PoolClient } from "pg";

const PG_URL = process.env.POSTGRES_URL;
if (!PG_URL) throw new Error("POSTGRES_URL env var is required");

const FIRST = ["Alice","Bob","Carlos","Diana","Eva","Frank","Greta","Hans","Isabelle","Jan","Katarina","Luca","Maria","Nikolai","Olivia","Peter","Rosa","Stefan","Thomas","Ulrike","Viktor","William","Xavier","Yuki","Zara","Anna","Boris","Clara","David","Emma","Felix","Gabriella","Hugo","Irene","Joao","Klaus","Luna","Marco","Nina","Oscar","Petra","Quinn","Ricardo","Sophie","Tobias","Ursula","Vera","Walter","Xenia","Yves"];
const LAST = ["Mueller","Martin","Wilson","Garcia","Rossi","DeVries","Nordstrom","Kowalski","Johnson","Dupont","Berg","Fernandez","Hoffmann","Schneider","Silva","Laurent","Petrov","Schmidt","Brown","Anderson","Thompson","Martinez","Robinson","Clark","Lewis","Lee","Walker","Hall","Allen","Young","King","Wright","Hill","Green","Adams","Nelson","Baker","Carter","Mitchell","Roberts","Turner","Phillips","Campbell","Parker","Evans","Edwards","Collins","Stewart","Morris","Murphy"];
const COUNTRIES = ["Germany","Germany","Germany","France","France","France","United Kingdom","United Kingdom","Spain","Spain","Italy","Italy","Netherlands","Netherlands","Sweden","Poland","Belgium","Austria","Switzerland","Portugal","Denmark","Norway","Finland","Ireland","Czech Republic","Romania","Greece","Hungary","Croatia","Bulgaria"];
const TIERS = ["Standard","Standard","Standard","Standard","Growth","Growth","Growth","Enterprise","Enterprise","VIP"];
const CATEGORIES = ["Electronics","Home & Living","Fashion","Sports & Outdoor","Beauty & Health","Books & Media","Food & Drinks","Toys & Games"];
const CAT_PFX = ["ELEC","HOME","FASH","SPRT","BEAU","BOOK","FOOD","TOYS"];
const PRODUCT_ADJECTIVES = ["Pro","Elite","Classic","Ultra","Lite","Max","Mini","Plus","Air","Prime","Eco","Smart","Deluxe","Basic","Premium"];
const PAYMENT = ["credit_card","credit_card","credit_card","credit_card","paypal","paypal","apple_pay","google_pay","bank_transfer","klarna"];
const STATUSES = ["completed","completed","completed","completed","completed","completed","completed","failed","failed","pending"];
const CHANNELS = ["web","web","web","web","mobile","mobile","mobile","social","email","affiliate"];

function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]; }
function rng(min: number, max: number, seed: number): number { return min + (Math.abs((seed * 2654435761) >>> 0) % (max - min + 1)); }
function esc(s: string): string { return s.replace(/'/g, "''"); }

async function main() {
  const pool = new Pool({ connectionString: PG_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000, max: 1 });
  const t0 = Date.now();
  console.log("\n━━━ ClickShop — Populate PostgreSQL v2 (cloud-safe) ━━━\n");

  // Get a dedicated client so SET is persistent
  const client: PoolClient = await pool.connect();
  const ver = await client.query("SELECT version()");
  console.log(`Connected: ${ver.rows[0].version.split(" ").slice(0, 2).join(" ")}`);
  await client.query("SET synchronous_commit = off");
  await client.query("SET lock_timeout = '5s'");
  console.log("Set synchronous_commit=off, lock_timeout=5s\n");

  async function exec(label: string, sql: string): Promise<number> {
    const start = Date.now();
    process.stdout.write(`  ▸ ${label} …`);
    try {
      const res = await client.query(sql);
      const rc = res.rowCount ?? 0;
      console.log(` ✓  ${rc} rows  ${((Date.now() - start) / 1000).toFixed(1)}s`);
      return rc;
    } catch (err) {
      const msg = (err as Error).message;
      console.log(` ✗  ${msg.slice(0, 120)}`);
      // If transaction aborted, reset it
      if (msg.includes("current transaction is aborted")) {
        try { await client.query("ROLLBACK"); } catch {}
        await client.query("SET synchronous_commit = off");
        await client.query("SET lock_timeout = '10s'");
      }
      return 0;
    }
  }

  // ─── Ensure tables exist ─────────────────────────────────────────────
  console.log("Phase 0 — Ensure tables exist\n");
  await exec("CREATE customers", `CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, full_name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL, tier VARCHAR(50) NOT NULL DEFAULT 'Standard',
    is_vip BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec("CREATE products", `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY, sku VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, price NUMERIC(10,2) NOT NULL,
    inventory_available INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec("CREATE orders", `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending', total_amount NUMERIC(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL, country VARCHAR(100), channel VARCHAR(50) DEFAULT 'web',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec("CREATE order_items", `CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES orders(id),
    product_id INT NOT NULL REFERENCES products(id), quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL, total_price NUMERIC(10,2) NOT NULL)`);
  await exec("CREATE payment_status_current", `CREATE TABLE IF NOT EXISTS payment_status_current (
    order_id INT PRIMARY KEY REFERENCES orders(id), status VARCHAR(50) NOT NULL,
    provider VARCHAR(50), failure_reason VARCHAR(255), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec("CREATE sales_rep_accounts", `CREATE TABLE IF NOT EXISTS sales_rep_accounts (
    id SERIAL PRIMARY KEY, rep_name VARCHAR(255) NOT NULL, region VARCHAR(100) NOT NULL,
    customer_id INT REFERENCES customers(id), assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await exec("CREATE vip_customer_flags", `CREATE TABLE IF NOT EXISTS vip_customer_flags (
    customer_id INT PRIMARY KEY REFERENCES customers(id), reason VARCHAR(255),
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  // ─── Customers (10,000) ──────────────────────────────────────────────
  console.log("Phase 1 — Customers (10,000)\n");
  const CUST_BATCH = 1000;
  for (let b = 0; b < 10; b++) {
    const rows: string[] = [];
    for (let i = 0; i < CUST_BATCH; i++) {
      const id = b * CUST_BATCH + i + 100;
      const first = pick(FIRST, id * 7 + 3);
      const last = pick(LAST, id * 13 + 7);
      const country = pick(COUNTRIES, id * 17 + 11);
      const tier = pick(TIERS, id * 23 + 5);
      const isVip = tier === "VIP";
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.${id}@clickshop.demo`;
      rows.push(`('${esc(email)}','${esc(first)} ${esc(last)}','${esc(country)}','${tier}',${isVip})`);
    }
    await exec(`customers batch ${b + 1}/10`, `INSERT INTO customers (email, full_name, country, tier, is_vip) VALUES ${rows.join(",")} ON CONFLICT (email) DO NOTHING`);
  }

  // ─── Products (2,000) ────────────────────────────────────────────────
  console.log("\nPhase 2 — Products (2,000)\n");
  const PROD_BATCH = 500;
  for (let b = 0; b < 4; b++) {
    const rows: string[] = [];
    for (let i = 0; i < PROD_BATCH; i++) {
      const id = b * PROD_BATCH + i + 100;
      const catIdx = id % CATEGORIES.length;
      const adj = pick(PRODUCT_ADJECTIVES, id * 31);
      const variant = rng(1, 99, id * 41);
      const sku = `${CAT_PFX[catIdx]}-${String(id).padStart(4, "0")}`;
      const name = `${CATEGORIES[catIdx]} ${adj} ${variant}`;
      const price = (rng(5, 800, id * 59) + rng(0, 99, id * 61) / 100).toFixed(2);
      const inventory = rng(0, 5000, id * 67);
      rows.push(`('${sku}','${esc(name)}','${esc(CATEGORIES[catIdx])}',${price},${inventory})`);
    }
    await exec(`products batch ${b + 1}/4`, `INSERT INTO products (sku, name, category, price, inventory_available) VALUES ${rows.join(",")} ON CONFLICT (sku) DO NOTHING`);
  }

  // Fetch actual IDs for FK integrity
  let custIds: number[] = [];
  let prodIds: number[] = [];
  try {
    const cr = await client.query("SELECT id FROM customers ORDER BY id");
    custIds = cr.rows.map((r: { id: number }) => r.id);
  } catch {}
  try {
    const pr = await client.query("SELECT id FROM products ORDER BY id");
    prodIds = pr.rows.map((r: { id: number }) => r.id);
  } catch {}
  console.log(`\n  Customer IDs: ${custIds.length}, Product IDs: ${prodIds.length}\n`);
  if (custIds.length === 0 || prodIds.length === 0) {
    console.error("No customers or products found — cannot create orders.");
    client.release(); await pool.end(); process.exit(1);
  }

  // ─── Orders (100,000) ────────────────────────────────────────────────
  console.log("Phase 3 — Orders (100,000)\n");
  const ORD_BATCH = 2000;
  const ORD_TOTAL = 100_000;
  const ORD_BATCHES = ORD_TOTAL / ORD_BATCH;
  for (let b = 0; b < ORD_BATCHES; b++) {
    const rows: string[] = [];
    for (let i = 0; i < ORD_BATCH; i++) {
      const id = b * ORD_BATCH + i + 1;
      const custId = custIds[Math.abs((id * 71) | 0) % custIds.length];
      const status = pick(STATUSES, id * 73);
      const amount = (rng(10, 1500, id * 79) + rng(0, 99, id * 83) / 100).toFixed(2);
      const method = pick(PAYMENT, id * 89);
      const country = pick(COUNTRIES, id * 97);
      const channel = pick(CHANNELS, id * 101);
      const daysAgo = rng(0, 89, id * 103);
      const hoursAgo = rng(0, 23, id * 107);
      rows.push(`(${custId},'${status}',${amount},'${method}','${esc(country)}','${channel}',NOW()-INTERVAL '${daysAgo} days'-INTERVAL '${hoursAgo} hours')`);
    }
    await exec(`orders batch ${b + 1}/${ORD_BATCHES}`, `INSERT INTO orders (customer_id,status,total_amount,payment_method,country,channel,created_at) VALUES ${rows.join(",")}`);
  }

  // Fetch actual order IDs for FK integrity
  let ordIds: number[] = [];
  try {
    const or2 = await client.query("SELECT id FROM orders ORDER BY id");
    ordIds = or2.rows.map((r: { id: number }) => r.id);
  } catch {}
  console.log(`\n  Order IDs: ${ordIds.length}\n`);
  if (ordIds.length === 0) {
    console.log("  No orders — skipping order_items");
  }

  // ─── Order Items (250,000) ───────────────────────────────────────────
  console.log("Phase 4 — Order Items (250,000)\n");
  const ITEM_BATCH = 2000;
  const ITEM_TOTAL = 250_000;
  const ITEM_BATCHES = ITEM_TOTAL / ITEM_BATCH;
  for (let b = 0; b < ITEM_BATCHES; b++) {
    if (ordIds.length === 0) { console.log("  (skipped — no orders)"); break; }
    const rows: string[] = [];
    for (let i = 0; i < ITEM_BATCH; i++) {
      const id = b * ITEM_BATCH + i + 1;
      const orderId = ordIds[Math.abs((id * 109) | 0) % ordIds.length];
      const prodId = prodIds[Math.abs((id * 113) | 0) % prodIds.length];
      const qty = rng(1, 5, id * 127);
      const price = (rng(5, 800, id * 131) + rng(0, 99, id * 137) / 100).toFixed(2);
      const total = (qty * parseFloat(price)).toFixed(2);
      rows.push(`(${orderId},${prodId},${qty},${price},${total})`);
    }
    await exec(`order_items batch ${b + 1}/${ITEM_BATCHES}`, `INSERT INTO order_items (order_id,product_id,quantity,unit_price,total_price) VALUES ${rows.join(",")}`);
  }

  // ─── Payment Status (from orders) ───────────────────────────────────
  console.log("\nPhase 5 — Payment Status\n");
  await exec("payment_status_current", `
    INSERT INTO payment_status_current (order_id, status, provider, failure_reason, updated_at)
    SELECT o.id,
      CASE WHEN o.status='failed' THEN 'failed' ELSE 'success' END,
      (ARRAY['stripe','stripe','stripe','adyen','adyen','mollie','worldpay','braintree'])[floor(random()*8)+1],
      CASE WHEN o.status='failed' THEN (ARRAY['gateway_timeout','card_declined','insufficient_funds','3ds_failure','fraud_check','expired_card','network_error','processor_error'])[floor(random()*8)+1] ELSE NULL END,
      o.created_at + INTERVAL '30 seconds'
    FROM orders o
    ON CONFLICT (order_id) DO NOTHING
  `);

  // ─── VIP Flags ──────────────────────────────────────────────────────
  console.log("\nPhase 6 — VIP Flags & Sales Reps\n");
  await exec("vip_customer_flags", `
    INSERT INTO vip_customer_flags (customer_id, reason, flagged_at)
    SELECT id, (ARRAY['High lifetime value','Frequent buyer','Enterprise contract','Strategic account','Loyalty program','Executive referral'])[floor(random()*6)+1], created_at
    FROM customers WHERE is_vip = TRUE
    ON CONFLICT (customer_id) DO NOTHING
  `);

  // ─── Sales Rep Accounts ─────────────────────────────────────────────
  await exec("sales_rep_accounts", `
    INSERT INTO sales_rep_accounts (rep_name, region, customer_id)
    SELECT (ARRAY['Alice Schmidt','Bob Laurent','Carlos Mendez','Diana Petrov','Erik Johansson','Fatima Al-Hassan','George Papadopoulos','Hannah Fischer','Ivan Novak','Julia Santos','Karl Andersen','Lisa Bergstrom','Marco Bianchi','Nina Horvat','Oscar Lindberg','Petra Kowalczyk','Rafael Gutierrez','Sandra Muller','Tomas Eriksson','Ursula Weber'])[floor(random()*20)+1],
      c.country, c.id
    FROM customers c WHERE c.tier IN ('VIP','Enterprise')
    ORDER BY random() LIMIT 500
  `);

  // ─── Verification ───────────────────────────────────────────────────
  console.log("\n━━━ Verification ━━━\n");
  for (const t of ["customers","products","orders","order_items","payment_status_current","sales_rep_accounts","vip_customer_flags"]) {
    try {
      const res = await client.query(`SELECT count(*)::int AS c FROM ${t}`);
      console.log(`  ${t.padEnd(28)} ${Number(res.rows[0].c).toLocaleString().padStart(10)} rows`);
    } catch (e) {
      console.log(`  ${t.padEnd(28)} ERROR: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Cardinality
  console.log("\n  Cardinality:");
  try {
    const cc = await client.query("SELECT count(DISTINCT country) AS countries, count(DISTINCT tier) AS tiers, count(*) FILTER (WHERE is_vip) AS vips FROM customers");
    console.log(`    customers: ${Object.entries(cc.rows[0]).map(([k,v])=>`${k}=${v}`).join(", ")}`);
  } catch {}
  try {
    const cp = await client.query("SELECT count(DISTINCT category) AS categories, min(price)::text AS min_price, max(price)::text AS max_price FROM products");
    console.log(`    products: ${Object.entries(cp.rows[0]).map(([k,v])=>`${k}=${v}`).join(", ")}`);
  } catch {}
  try {
    const co = await client.query("SELECT count(DISTINCT customer_id) AS customers, count(DISTINCT payment_method) AS methods, count(DISTINCT country) AS countries, count(DISTINCT channel) AS channels FROM orders");
    console.log(`    orders: ${Object.entries(co.rows[0]).map(([k,v])=>`${k}=${v}`).join(", ")}`);
  } catch {}

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n✓ Done in ${elapsed}s\n`);

  client.release();
  await pool.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
