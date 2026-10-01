/**
 * Populate ClickHouse with high-volume, high-cardinality demo data.
 *
 * Target volumes:
 *   page_events            100 M
 *   checkout_events          50 M
 *   cart_events              40 M
 *   order_events             30 M
 *   payment_events           20 M
 *   inventory_events          5 M
 *   customer_activity         3 M
 *   product_performance_hourly 2 M
 *   revenue_analytics       500 K
 *   conversion_analytics    200 K
 *                         ──────────
 *                   Total ≈ 250.7 M rows
 */
import { createClient } from "@clickhouse/client-web";

const BATCH = 10_000_000;

// ── Reusable SQL fragments ─────────────────────────────────────────────
const COUNTRIES = `[
  'Germany','Germany','Germany',
  'France','France','France',
  'United Kingdom','United Kingdom',
  'Spain','Spain',
  'Italy','Italy',
  'Netherlands','Netherlands',
  'Sweden','Poland','Belgium','Austria','Switzerland','Portugal'
]`;

const COUNTRIES_30 = `[
  'Germany','Germany','Germany','Germany',
  'France','France','France',
  'United Kingdom','United Kingdom','United Kingdom',
  'Spain','Spain',
  'Italy','Italy',
  'Netherlands','Netherlands',
  'Sweden','Sweden',
  'Poland','Poland',
  'Belgium','Austria','Switzerland','Portugal',
  'Denmark','Norway','Finland','Ireland',
  'Czech Republic','Romania'
]`;

const DEVICES = `['desktop','desktop','desktop','desktop','desktop','mobile','mobile','mobile','mobile','tablet']`;

const CATEGORIES = `[
  'Electronics','Electronics','Electronics',
  'Home & Living','Home & Living',
  'Fashion','Fashion',
  'Sports & Outdoor',
  'Beauty & Health',
  'Books & Media'
]`;

const CAT_PREFIXES = `['ELEC','ELEC','ELEC','HOME','HOME','FASH','FASH','SPRT','BEAU','BOOK']`;

const PAGE_TYPES = `[
  'home','home','home','home',
  'category','category','category','category','category',
  'product','product','product','product','product','product',
  'cart','cart',
  'checkout','checkout',
  'confirmation'
]`;

const CHECKOUT_TYPES = `[
  'page_view','page_view','page_view','page_view','page_view','page_view',
  'begin_checkout','begin_checkout','begin_checkout',
  'add_payment','add_payment',
  'purchase','purchase',
  'abandon','abandon'
]`;

const PAYMENT_METHODS = `[
  'credit_card','credit_card','credit_card','credit_card',
  'paypal','paypal',
  'apple_pay','apple_pay',
  'google_pay',
  'bank_transfer',
  'klarna'
]`;

const PAYMENT_STATUSES = `[
  'success','success','success','success','success','success','success','success',
  'success','success','success','success','success','success','success','success','success',
  'failed','failed',
  'pending'
]`;

const FAILURE_REASONS = `[
  '','','','','','','','','','','','','','','','','',
  'gateway_timeout','card_declined','insufficient_funds','3ds_failure','fraud_check','expired_card','network_error','processor_error','invalid_cvv'
]`;

const CHANNELS = `['web','web','web','web','web','mobile','mobile','mobile','social','email','affiliate']`;

const REFERRERS = `['','','','','','google','facebook','instagram','email','direct','bing','twitter','linkedin','reddit','tiktok','youtube','pinterest','snapchat','whatsapp','telegram']`;

const ORDER_STATUSES = `['completed','completed','completed','completed','completed','completed','completed','completed','failed','failed','pending','refunded']`;

const WAREHOUSES = `['EU-Central','EU-Central','EU-Central','EU-West','EU-West','EU-North','EU-South','EU-East']`;

const TIERS = `['Standard','Standard','Standard','Standard','Growth','Growth','Growth','Enterprise','Enterprise','VIP']`;

// 90 days in seconds
const RANGE_90D = 90 * 86400;
const RANGE_30D = 30 * 86400;

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const host = process.env.CLICKHOUSE_HOST;
  if (!host) {
    console.error("CLICKHOUSE_HOST is required. Set it in .env");
    process.exit(1);
  }

  const port = process.env.CLICKHOUSE_PORT ?? "8443";
  const secure = process.env.CLICKHOUSE_SECURE !== "false";
  const client = createClient({
    url: `${secure ? "https" : "http"}://${host}:${port}`,
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
    database: process.env.CLICKHOUSE_DATABASE ?? "clickshop",
    request_timeout: 600_000,
  });

  const t0 = Date.now();
  console.log("\n━━━ ClickShop — Populate ClickHouse (high volume) ━━━\n");

  async function exec(label: string, sql: string) {
    const start = Date.now();
    process.stdout.write(`  ▸ ${label} …`);
    try {
      await client.command({ query: sql });
      console.log(` ✓  ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.log(` ✗  ${(err as Error).message.slice(0, 120)}`);
    }
  }

  // 1. Truncate
  console.log("Phase 1 — Truncate existing data\n");
  const tables = [
    "page_events",
    "cart_events",
    "checkout_events",
    "payment_events",
    "order_events",
    "inventory_events",
    "product_performance_hourly",
    "customer_activity",
    "revenue_analytics",
    "conversion_analytics",
  ];
  for (const t of tables) {
    await exec(`TRUNCATE ${t}`, `TRUNCATE TABLE IF EXISTS ${t}`);
  }

  // 2. page_events — 100 M (10 × 10 M)
  console.log("\nPhase 2 — page_events (100 M rows)\n");
  for (let b = 0; b < 10; b++) {
    const off = b * BATCH;
    await exec(`page_events batch ${b + 1}/10`, `
      INSERT INTO page_events (event_time, session_id, user_id, page_url, page_type, device, country, referrer)
      SELECT
        now() - toIntervalSecond(cityHash64(number + ${off}) % ${RANGE_90D}),
        concat('s-', toString(cityHash64(number + ${off}, 1) % 8000000)),
        toUInt32(cityHash64(number + ${off}, 2) % 50000 + 1),
        concat('/', arrayElement(['','catalog/c-','product/p-','cart','checkout/','confirm/'], (cityHash64(number + ${off}, 3) % 6) + 1), toString(cityHash64(number + ${off}, 12) % 20000)),
        arrayElement(${PAGE_TYPES}, (cityHash64(number + ${off}, 4) % 20) + 1),
        arrayElement(${DEVICES}, (cityHash64(number + ${off}, 5) % 10) + 1),
        arrayElement(${COUNTRIES_30}, (cityHash64(number + ${off}, 6) % 30) + 1),
        arrayElement(${REFERRERS}, (cityHash64(number + ${off}, 7) % 20) + 1)
      FROM numbers(${BATCH})
    `);
  }

  // 3. checkout_events — 50 M (5 × 10 M)
  console.log("\nPhase 3 — checkout_events (50 M rows)\n");
  for (let b = 0; b < 5; b++) {
    const off = b * BATCH;
    await exec(`checkout_events batch ${b + 1}/5`, `
      INSERT INTO checkout_events (event_time, session_id, user_id, event_type, cart_value, items_count, country, device, payment_method)
      SELECT
        now() - toIntervalSecond(cityHash64(number + ${off}, 20) % ${RANGE_90D}),
        concat('s-', toString(cityHash64(number + ${off}, 21) % 8000000)),
        toUInt32(cityHash64(number + ${off}, 22) % 50000 + 1),
        arrayElement(${CHECKOUT_TYPES}, (cityHash64(number + ${off}, 23) % 15) + 1),
        toDecimal64((cityHash64(number + ${off}, 24) % 80000 + 999) / 100.0, 2),
        toUInt16(cityHash64(number + ${off}, 25) % 8 + 1),
        arrayElement(${COUNTRIES_30}, (cityHash64(number + ${off}, 26) % 30) + 1),
        arrayElement(${DEVICES}, (cityHash64(number + ${off}, 27) % 10) + 1),
        arrayElement(${PAYMENT_METHODS}, (cityHash64(number + ${off}, 28) % 11) + 1)
      FROM numbers(${BATCH})
    `);
  }

  // 4. cart_events — 40 M (4 × 10 M)
  console.log("\nPhase 4 — cart_events (40 M rows)\n");
  for (let b = 0; b < 4; b++) {
    const off = b * BATCH;
    await exec(`cart_events batch ${b + 1}/4`, `
      INSERT INTO cart_events (event_time, session_id, user_id, product_sku, product_name, category, action, quantity, unit_price, country, device)
      SELECT
        now() - toIntervalSecond(cityHash64(number + ${off}, 30) % ${RANGE_90D}),
        concat('s-', toString(cityHash64(number + ${off}, 31) % 8000000)),
        toUInt32(cityHash64(number + ${off}, 32) % 50000 + 1),
        concat(arrayElement(${CAT_PREFIXES}, (cityHash64(number + ${off}, 33) % 10) + 1), '-', lpad(toString(cityHash64(number + ${off}, 34) % 250 + 1), 4, '0')),
        concat(arrayElement(['Gadget','Furniture','Garment','Equipment','Cosmetic','Book','Snack','Toy','Accessory','Tool'], (cityHash64(number + ${off}, 33) % 10) + 1), ' ', toString(cityHash64(number + ${off}, 34) % 250 + 1)),
        arrayElement(${CATEGORIES}, (cityHash64(number + ${off}, 33) % 10) + 1),
        arrayElement(['add','add','add','add','add','add','add','remove','remove','update_qty'], (cityHash64(number + ${off}, 35) % 10) + 1),
        toUInt16(cityHash64(number + ${off}, 36) % 5 + 1),
        toDecimal64((cityHash64(number + ${off}, 37) % 60000 + 499) / 100.0, 2),
        arrayElement(${COUNTRIES_30}, (cityHash64(number + ${off}, 38) % 30) + 1),
        arrayElement(${DEVICES}, (cityHash64(number + ${off}, 39) % 10) + 1)
      FROM numbers(${BATCH})
    `);
  }

  // 5. order_events — 30 M (3 × 10 M)
  console.log("\nPhase 5 — order_events (30 M rows)\n");
  for (let b = 0; b < 3; b++) {
    const off = b * BATCH;
    await exec(`order_events batch ${b + 1}/3`, `
      INSERT INTO order_events (event_time, order_id, customer_id, product_sku, product_name, category, quantity, unit_price, total_amount, payment_method, status, country, channel, device)
      SELECT
        now() - toIntervalSecond(cityHash64(number + ${off}, 40) % ${RANGE_90D}),
        toUInt32(cityHash64(number + ${off}, 41) % 5000000 + 1),
        toUInt32(cityHash64(number + ${off}, 42) % 50000 + 1),
        concat(arrayElement(${CAT_PREFIXES}, (cityHash64(number + ${off}, 43) % 10) + 1), '-', lpad(toString(cityHash64(number + ${off}, 44) % 250 + 1), 4, '0')),
        concat(arrayElement(['Gadget','Furniture','Garment','Equipment','Cosmetic','Book','Snack','Toy','Accessory','Tool'], (cityHash64(number + ${off}, 43) % 10) + 1), ' ', toString(cityHash64(number + ${off}, 44) % 250 + 1)),
        arrayElement(${CATEGORIES}, (cityHash64(number + ${off}, 43) % 10) + 1),
        toUInt16(cityHash64(number + ${off}, 45) % 5 + 1),
        toDecimal64((cityHash64(number + ${off}, 46) % 60000 + 499) / 100.0, 2),
        toDecimal64((cityHash64(number + ${off}, 45) % 5 + 1) * ((cityHash64(number + ${off}, 46) % 60000 + 499) / 100.0), 2),
        arrayElement(${PAYMENT_METHODS}, (cityHash64(number + ${off}, 47) % 11) + 1),
        arrayElement(${ORDER_STATUSES}, (cityHash64(number + ${off}, 48) % 12) + 1),
        arrayElement(${COUNTRIES_30}, (cityHash64(number + ${off}, 49) % 30) + 1),
        arrayElement(${CHANNELS}, (cityHash64(number + ${off}, 50) % 11) + 1),
        arrayElement(['desktop','mobile','tablet'], (cityHash64(number + ${off}, 51) % 3) + 1)
      FROM numbers(${BATCH})
    `);
  }

  // 6. payment_events — 20 M (2 × 10 M)
  console.log("\nPhase 6 — payment_events (20 M rows)\n");
  for (let b = 0; b < 2; b++) {
    const off = b * BATCH;
    await exec(`payment_events batch ${b + 1}/2`, `
      INSERT INTO payment_events (event_time, order_id, user_id, amount, currency, payment_method, provider, status, failure_reason, country)
      SELECT
        now() - toIntervalSecond(cityHash64(number + ${off}, 60) % ${RANGE_90D}),
        toUInt32(cityHash64(number + ${off}, 61) % 5000000 + 1),
        toUInt32(cityHash64(number + ${off}, 62) % 50000 + 1),
        toDecimal64((cityHash64(number + ${off}, 63) % 100000 + 499) / 100.0, 2),
        'EUR',
        arrayElement(${PAYMENT_METHODS}, (cityHash64(number + ${off}, 64) % 11) + 1),
        arrayElement(['stripe','stripe','stripe','stripe','adyen','adyen','mollie','worldpay'], (cityHash64(number + ${off}, 65) % 8) + 1),
        arrayElement(${PAYMENT_STATUSES}, (cityHash64(number + ${off}, 66) % 20) + 1),
        arrayElement(${FAILURE_REASONS}, (cityHash64(number + ${off}, 67) % 26) + 1),
        arrayElement(${COUNTRIES_30}, (cityHash64(number + ${off}, 68) % 30) + 1)
      FROM numbers(${BATCH})
    `);
  }

  // 7. inventory_events — 5 M
  console.log("\nPhase 7 — inventory_events (5 M rows)\n");
  await exec("inventory_events (5M)", `
    INSERT INTO inventory_events (event_time, product_sku, product_name, category, change_type, quantity_change, quantity_after, warehouse)
    SELECT
      now() - toIntervalSecond(cityHash64(number, 70) % ${RANGE_90D}),
      concat(arrayElement(${CAT_PREFIXES}, (cityHash64(number, 71) % 10) + 1), '-', lpad(toString(cityHash64(number, 72) % 250 + 1), 4, '0')),
      concat(arrayElement(['Gadget','Furniture','Garment','Equipment','Cosmetic','Book','Snack','Toy','Accessory','Tool'], (cityHash64(number, 71) % 10) + 1), ' ', toString(cityHash64(number, 72) % 250 + 1)),
      arrayElement(${CATEGORIES}, (cityHash64(number, 71) % 10) + 1),
      arrayElement(['restock','sale','sale','sale','sale','adjustment','return'], (cityHash64(number, 73) % 7) + 1),
      toInt32(if(
        arrayElement(['restock','sale','sale','sale','sale','adjustment','return'], (cityHash64(number, 73) % 7) + 1) = 'sale',
        -(cityHash64(number, 74) % 10 + 1),
        cityHash64(number, 74) % 500 + 1
      )),
      toUInt32(cityHash64(number, 75) % 5000 + 10),
      arrayElement(${WAREHOUSES}, (cityHash64(number, 76) % 8) + 1)
    FROM numbers(5000000)
  `);

  // 8. customer_activity — 3 M
  console.log("\nPhase 8 — customer_activity (3 M rows)\n");
  await exec("customer_activity (3M)", `
    INSERT INTO customer_activity (date, customer_id, country, tier, page_views, cart_adds, checkouts, purchases, total_spent, sessions)
    SELECT
      today() - toIntervalDay(cityHash64(number, 80) % 90),
      toUInt32(cityHash64(number, 81) % 50000 + 1),
      arrayElement(${COUNTRIES_30}, (cityHash64(number, 82) % 30) + 1),
      arrayElement(${TIERS}, (cityHash64(number, 83) % 10) + 1),
      toUInt32(cityHash64(number, 84) % 50 + 1),
      toUInt32(cityHash64(number, 85) % 15),
      toUInt32(cityHash64(number, 86) % 5),
      toUInt32(cityHash64(number, 87) % 3),
      toDecimal64((cityHash64(number, 88) % 100000) / 100.0, 2),
      toUInt16(cityHash64(number, 89) % 8 + 1)
    FROM numbers(3000000)
  `);

  // 9. product_performance_hourly — 2 M
  console.log("\nPhase 9 — product_performance_hourly (2 M rows)\n");
  await exec("product_performance_hourly (2M)", `
    INSERT INTO product_performance_hourly (hour, product_sku, product_name, category, revenue, units_sold, page_views, add_to_cart, orders, conversion_rate)
    SELECT
      toStartOfHour(now() - toIntervalHour(cityHash64(number, 90) % 2160)),
      concat(arrayElement(${CAT_PREFIXES}, (cityHash64(number, 91) % 10) + 1), '-', lpad(toString(cityHash64(number, 92) % 250 + 1), 4, '0')),
      concat(arrayElement(['Gadget','Furniture','Garment','Equipment','Cosmetic','Book','Snack','Toy','Accessory','Tool'], (cityHash64(number, 91) % 10) + 1), ' ', toString(cityHash64(number, 92) % 250 + 1)),
      arrayElement(${CATEGORIES}, (cityHash64(number, 91) % 10) + 1),
      toDecimal64((cityHash64(number, 93) % 500000 + 100) / 100.0, 2),
      toUInt32(cityHash64(number, 94) % 200 + 1),
      toUInt32(cityHash64(number, 95) % 5000 + 10),
      toUInt32(cityHash64(number, 96) % 1000 + 1),
      toUInt32(cityHash64(number, 97) % 150 + 1),
      toFloat32((cityHash64(number, 98) % 1000) / 10000.0)
    FROM numbers(2000000)
  `);

  // 10. revenue_analytics — 500 K
  console.log("\nPhase 10 — revenue_analytics (500 K rows)\n");
  await exec("revenue_analytics (500K)", `
    INSERT INTO revenue_analytics (date, country, category, channel, device, revenue, orders, avg_order_value, unique_customers)
    SELECT
      today() - toIntervalDay(cityHash64(number, 100) % 90),
      arrayElement(${COUNTRIES_30}, (cityHash64(number, 101) % 30) + 1),
      arrayElement(${CATEGORIES}, (cityHash64(number, 102) % 10) + 1),
      arrayElement(['web','mobile','social','email','affiliate'], (cityHash64(number, 103) % 5) + 1),
      arrayElement(['desktop','mobile','tablet'], (cityHash64(number, 104) % 3) + 1),
      toDecimal64((cityHash64(number, 105) % 1000000 + 1000) / 100.0, 2),
      toUInt32(cityHash64(number, 106) % 2000 + 10),
      toDecimal64((cityHash64(number, 107) % 50000 + 1000) / 100.0, 2),
      toUInt32(cityHash64(number, 108) % 500 + 5)
    FROM numbers(500000)
  `);

  // 11. conversion_analytics — 200 K
  console.log("\nPhase 11 — conversion_analytics (200 K rows)\n");
  await exec("conversion_analytics (200K)", `
    INSERT INTO conversion_analytics (date, country, device, channel, page_views, add_to_cart, begin_checkout, purchase, conversion_rate)
    SELECT
      today() - toIntervalDay(cityHash64(number, 110) % 90),
      arrayElement(${COUNTRIES_30}, (cityHash64(number, 111) % 30) + 1),
      arrayElement(['desktop','mobile','tablet'], (cityHash64(number, 112) % 3) + 1),
      arrayElement(['web','mobile','social','email','affiliate'], (cityHash64(number, 113) % 5) + 1),
      toUInt32(cityHash64(number, 114) % 50000 + 500),
      toUInt32(cityHash64(number, 115) % 12000 + 100),
      toUInt32(cityHash64(number, 116) % 5000 + 50),
      toUInt32(cityHash64(number, 117) % 2000 + 10),
      toFloat32((cityHash64(number, 118) % 1000) / 10000.0)
    FROM numbers(200000)
  `);

  // ── Verify ──────────────────────────────────────────────────────────
  console.log("\n━━━ Verification ━━━\n");
  let totalRows = 0;
  for (const t of tables) {
    try {
      const res = await client.query({
        query: `SELECT count() AS c, uniq(country) AS countries FROM ${t}`,
        format: "JSONEachRow",
      });
      const rows = (await res.json()) as { c: string; countries: string }[];
      const count = parseInt(rows[0].c);
      totalRows += count;
      console.log(
        `  ${t.padEnd(30)} ${Number(count).toLocaleString().padStart(15)} rows   ${rows[0].countries} countries`,
      );
    } catch (err) {
      console.log(`  ${t.padEnd(30)} ERROR: ${(err as Error).message.slice(0, 80)}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n  ${"TOTAL".padEnd(30)} ${totalRows.toLocaleString().padStart(15)} rows`);
  console.log(`\n✓ Done in ${elapsed}s\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
