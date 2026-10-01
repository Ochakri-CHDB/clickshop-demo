/**
 * Populate PostgreSQL with high-cardinality demo data.
 *
 * Target volumes:
 *   customers              10 000
 *   products                2 000
 *   orders                100 000
 *   order_items           250 000
 *   payment_status_current 100 000
 *   sales_rep_accounts         500
 *   vip_customer_flags       1 000
 */
import { Pool } from "pg";

const PG_URL = process.env.POSTGRES_URL;
if (!PG_URL) throw new Error("POSTGRES_URL env var is required");

// ── Reference data ──────────────────────────────────────────────────────
const FIRST_NAMES = [
  "Alice","Bob","Carlos","Diana","Eva","Frank","Greta","Hans","Isabelle","Jan",
  "Katarina","Luca","Maria","Nikolai","Olivia","Peter","Rosa","Stefan","Thomas","Ulrike",
  "Viktor","William","Xavier","Yuki","Zara","Anna","Boris","Clara","David","Emma",
  "Felix","Gabriella","Hugo","Irene","Joao","Klaus","Luna","Marco","Nina","Oscar",
  "Petra","Quinn","Ricardo","Sophie","Tobias","Ursula","Vera","Walter","Xenia","Yves",
];
const LAST_NAMES = [
  "Mueller","Martin","Wilson","Garcia","Rossi","DeVries","Nordstrom","Kowalski","Johnson","Dupont",
  "Berg","Fernandez","Hoffmann","Schneider","Silva","Laurent","Petrov","Schmidt","Brown","Anderson",
  "Thompson","Martinez","Robinson","Clark","Lewis","Lee","Walker","Hall","Allen","Young",
  "King","Wright","Hill","Green","Adams","Nelson","Baker","Carter","Mitchell","Roberts",
  "Turner","Phillips","Campbell","Parker","Evans","Edwards","Collins","Stewart","Morris","Murphy",
];
const COUNTRIES = [
  "Germany","Germany","Germany","France","France","France",
  "United Kingdom","United Kingdom","Spain","Spain","Italy","Italy",
  "Netherlands","Netherlands","Sweden","Poland","Belgium","Austria",
  "Switzerland","Portugal","Denmark","Norway","Finland","Ireland",
  "Czech Republic","Romania","Greece","Hungary","Croatia","Bulgaria",
];
const TIERS = ["Standard","Standard","Standard","Standard","Growth","Growth","Growth","Enterprise","Enterprise","VIP"];
const CATEGORIES = ["Electronics","Home & Living","Fashion","Sports & Outdoor","Beauty & Health","Books & Media","Food & Drinks","Toys & Games"];
const CAT_PREFIXES = ["ELEC","HOME","FASH","SPRT","BEAU","BOOK","FOOD","TOYS"];
const PRODUCT_TYPES = [
  ["Headphones","TV","Speaker","Laptop","Watch","Camera","Tablet","Monitor","Keyboard","Mouse","Charger","Cable","Case","Stand","Adapter"],
  ["Chair","Desk","Lamp","Shelf","Rug","Cushion","Mirror","Clock","Vase","Frame","Candle","Blanket","Curtain","Basket","Organizer"],
  ["Coat","Jacket","Shirt","Dress","Jeans","Sneakers","Bag","Scarf","Belt","Hat","Gloves","Socks","Tie","Wallet","Sunglasses"],
  ["Shoes","Mat","Bottle","Helmet","Gloves","Band","Tracker","Weights","Rope","Ball","Jersey","Shorts","Backpack","Tent","Pole"],
  ["Cream","Serum","Mask","Oil","Shampoo","Perfume","Brush","Palette","Lipstick","Soap","Lotion","Mist","Balm","Scrub","Gel"],
  ["Novel","Guide","Biography","Cookbook","Atlas","Album","Magazine","Journal","Planner","Calendar","Comics","Poetry","Textbook","Audiobook","eBook"],
  ["Coffee","Tea","Chocolate","Snack","Sauce","Spice","Honey","Jam","Pasta","Rice","Oil","Vinegar","Nuts","Granola","Protein"],
  ["Puzzle","Blocks","Doll","Car","Robot","Board Game","Craft Kit","Plushie","Train Set","Action Figure","Kite","Drone","Spinner","Slime","Play Set"],
];
const PAYMENT_METHODS = ["credit_card","credit_card","credit_card","credit_card","paypal","paypal","apple_pay","google_pay","bank_transfer","klarna"];
const STATUSES = ["completed","completed","completed","completed","completed","completed","completed","failed","failed","pending"];
const CHANNELS_LIST = ["web","web","web","web","mobile","mobile","mobile","social","email","affiliate"];
const FAILURE_REASONS = ["gateway_timeout","card_declined","insufficient_funds","3ds_failure","fraud_check","expired_card","network_error","processor_error"];
const REP_NAMES = [
  "Alice Schmidt","Bob Laurent","Carlos Mendez","Diana Petrov","Erik Johansson",
  "Fatima Al-Hassan","George Papadopoulos","Hannah Fischer","Ivan Novak","Julia Santos",
  "Karl Andersen","Lisa Bergstrom","Marco Bianchi","Nina Horvat","Oscar Lindberg",
  "Petra Kowalczyk","Rafael Gutierrez","Sandra Muller","Tomas Eriksson","Ursula Weber",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}
function rand(min: number, max: number, seed: number): number {
  const hash = Math.abs((seed * 2654435761) >>> 0);
  return min + (hash % (max - min + 1));
}
function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    max: 1,
  });

  const t0 = Date.now();
  console.log("\n━━━ ClickShop — Populate PostgreSQL (high cardinality) ━━━\n");

  const ver = await pool.query("SELECT version()");
  console.log(`Connected: ${ver.rows[0].version.split(" ").slice(0, 2).join(" ")}`);
  await pool.query("SET synchronous_commit = off");
  console.log("Set synchronous_commit = off\n");

  async function exec(label: string, sql: string) {
    const start = Date.now();
    process.stdout.write(`  ▸ ${label} …`);
    try {
      const res = await pool.query(sql);
      console.log(` ✓  ${res.rowCount ?? 0} rows  ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.log(` ✗  ${(err as Error).message.slice(0, 120)}`);
    }
  }

  // 1. Clean existing data (DELETE, not TRUNCATE — cloud PG sync replication blocks DDL)
  console.log("Phase 1 — Clean existing data\n");
  const delOrder = ["vip_customer_flags","sales_rep_accounts","payment_status_current","order_items","orders","products","customers"];
  for (const t of delOrder) {
    await exec(`DELETE FROM ${t}`, `DELETE FROM ${t}`);
  }

  // 2. Customers — 10 000
  console.log("\nPhase 2 — Customers (10,000)\n");
  const CUST_BATCH = 1000;
  for (let b = 0; b < 10; b++) {
    const rows: string[] = [];
    for (let i = 0; i < CUST_BATCH; i++) {
      const id = b * CUST_BATCH + i + 1;
      const first = pick(FIRST_NAMES, id * 7 + 3);
      const last = pick(LAST_NAMES, id * 13 + 7);
      const country = pick(COUNTRIES, id * 17 + 11);
      const tier = pick(TIERS, id * 23 + 5);
      const isVip = tier === "VIP";
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${id}@example.com`;
      rows.push(`('${escSql(email)}','${escSql(first)} ${escSql(last)}','${escSql(country)}','${tier}',${isVip})`);
    }
    await exec(`customers batch ${b + 1}/10`, `INSERT INTO customers (email, full_name, country, tier, is_vip) VALUES ${rows.join(",")}`);
  }

  // 3. Products — 2 000
  console.log("\nPhase 3 — Products (2,000)\n");
  const PROD_BATCH = 500;
  for (let b = 0; b < 4; b++) {
    const rows: string[] = [];
    for (let i = 0; i < PROD_BATCH; i++) {
      const id = b * PROD_BATCH + i + 1;
      const catIdx = id % CATEGORIES.length;
      const typeArr = PRODUCT_TYPES[catIdx];
      const typeName = pick(typeArr, id * 31);
      const variant = rand(1, 50, id * 41);
      const sku = `${CAT_PREFIXES[catIdx]}-${String(id).padStart(4, "0")}`;
      const name = `${typeName} ${pick(["Pro","Elite","Classic","Ultra","Lite","Max","Mini","Plus","Air","Prime"], id * 53)} ${variant}`;
      const price = (rand(5, 800, id * 59) + rand(0, 99, id * 61) / 100).toFixed(2);
      const inventory = rand(0, 5000, id * 67);
      rows.push(`('${sku}','${escSql(name)}','${escSql(CATEGORIES[catIdx])}',${price},${inventory})`);
    }
    await exec(`products batch ${b + 1}/4`, `INSERT INTO products (sku, name, category, price, inventory_available) VALUES ${rows.join(",")}`);
  }

  // 4. Orders — 100 000
  console.log("\nPhase 4 — Orders (100,000)\n");
  const ORD_BATCH = 5000;
  for (let b = 0; b < 20; b++) {
    const rows: string[] = [];
    for (let i = 0; i < ORD_BATCH; i++) {
      const id = b * ORD_BATCH + i + 1;
      const custId = rand(1, 10000, id * 71);
      const status = pick(STATUSES, id * 73);
      const amount = (rand(10, 1500, id * 79) + rand(0, 99, id * 83) / 100).toFixed(2);
      const method = pick(PAYMENT_METHODS, id * 89);
      const country = pick(COUNTRIES, id * 97);
      const channel = pick(CHANNELS_LIST, id * 101);
      const daysAgo = rand(0, 89, id * 103);
      const hoursAgo = rand(0, 23, id * 107);
      rows.push(`(${custId},'${status}',${amount},'${method}','${escSql(country)}','${channel}',NOW() - INTERVAL '${daysAgo} days' - INTERVAL '${hoursAgo} hours')`);
    }
    await exec(`orders batch ${b + 1}/20`, `INSERT INTO orders (customer_id, status, total_amount, payment_method, country, channel, created_at) VALUES ${rows.join(",")}`);
  }

  // 5. Order items — 250 000
  console.log("\nPhase 5 — Order Items (250,000)\n");
  const ITEM_BATCH = 5000;
  for (let b = 0; b < 50; b++) {
    const rows: string[] = [];
    for (let i = 0; i < ITEM_BATCH; i++) {
      const id = b * ITEM_BATCH + i + 1;
      const orderId = rand(1, 100000, id * 109);
      const prodId = rand(1, 2000, id * 113);
      const qty = rand(1, 5, id * 127);
      const price = (rand(5, 800, id * 131) + rand(0, 99, id * 137) / 100).toFixed(2);
      const total = (qty * parseFloat(price)).toFixed(2);
      rows.push(`(${orderId},${prodId},${qty},${price},${total})`);
    }
    await exec(`order_items batch ${b + 1}/50`, `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) VALUES ${rows.join(",")}`);
  }

  // 6. Payment status — 100 000
  console.log("\nPhase 6 — Payment Status (100,000)\n");
  await exec("payment_status_current", `
    INSERT INTO payment_status_current (order_id, status, provider, failure_reason, updated_at)
    SELECT o.id,
      CASE WHEN o.status = 'failed' THEN 'failed' ELSE 'success' END,
      (ARRAY['stripe','stripe','stripe','adyen','adyen','mollie','worldpay','braintree'])[floor(random()*8)+1],
      CASE WHEN o.status = 'failed' THEN
        (ARRAY['gateway_timeout','card_declined','insufficient_funds','3ds_failure','fraud_check','expired_card','network_error','processor_error'])[floor(random()*8)+1]
      ELSE NULL END,
      o.created_at + INTERVAL '30 seconds'
    FROM orders o
    ON CONFLICT (order_id) DO NOTHING
  `);

  // 7. VIP flags — from VIP customers
  console.log("\nPhase 7 — VIP Flags\n");
  await exec("vip_customer_flags", `
    INSERT INTO vip_customer_flags (customer_id, reason, flagged_at)
    SELECT id,
      (ARRAY['High lifetime value','Frequent buyer','Enterprise contract','Strategic account','Loyalty program','Executive referral'])[floor(random()*6)+1],
      created_at
    FROM customers WHERE is_vip = TRUE
    ON CONFLICT (customer_id) DO NOTHING
  `);

  // 8. Sales rep accounts — 500
  console.log("\nPhase 8 — Sales Rep Accounts (500)\n");
  await exec("sales_rep_accounts", `
    INSERT INTO sales_rep_accounts (rep_name, region, customer_id)
    SELECT
      (ARRAY['Alice Schmidt','Bob Laurent','Carlos Mendez','Diana Petrov','Erik Johansson',
             'Fatima Al-Hassan','George Papadopoulos','Hannah Fischer','Ivan Novak','Julia Santos',
             'Karl Andersen','Lisa Bergstrom','Marco Bianchi','Nina Horvat','Oscar Lindberg',
             'Petra Kowalczyk','Rafael Gutierrez','Sandra Muller','Tomas Eriksson','Ursula Weber'])[floor(random()*20)+1],
      c.country,
      c.id
    FROM customers c
    WHERE c.tier IN ('VIP','Enterprise')
    ORDER BY random()
    LIMIT 500
  `);

  // ── Verify ──────────────────────────────────────────────────────────
  console.log("\n━━━ Verification ━━━\n");
  const verify = [
    "customers", "products", "orders", "order_items",
    "payment_status_current", "sales_rep_accounts", "vip_customer_flags",
  ];
  for (const t of verify) {
    try {
      const res = await pool.query(`SELECT count(*)::int AS c FROM ${t}`);
      console.log(`  ${t.padEnd(28)} ${Number(res.rows[0].c).toLocaleString().padStart(10)} rows`);
    } catch (err) {
      console.log(`  ${t.padEnd(28)} ERROR: ${(err as Error).message.slice(0, 80)}`);
    }
  }

  // Cardinality stats
  console.log("\n  Cardinality:");
  const cardQueries = [
    ["customers", "SELECT count(DISTINCT country) AS countries, count(DISTINCT tier) AS tiers, count(*) FILTER (WHERE is_vip) AS vips FROM customers"],
    ["products", "SELECT count(DISTINCT category) AS categories, min(price) AS min_price, max(price) AS max_price FROM products"],
    ["orders", "SELECT count(DISTINCT customer_id) AS customers, count(DISTINCT payment_method) AS methods, count(DISTINCT country) AS countries, count(DISTINCT channel) AS channels FROM orders"],
  ];
  for (const [label, sql] of cardQueries) {
    const res = await pool.query(sql);
    const row = res.rows[0];
    const details = Object.entries(row).map(([k, v]) => `${k}=${v}`).join(", ");
    console.log(`    ${label}: ${details}`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n✓ Done in ${elapsed}s\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
