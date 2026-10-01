/**
 * Seed the customer_feedback table used by the full-text search demo
 * (CEO + Sales workspaces → "Search customer feedback").
 *
 * Design: ONE table, the SAME feedback text duplicated into THREE columns,
 * each with a different indexing strategy so the comparison is fair
 * (same rows, same parts, same sort order):
 *   - feedback_text_fts   → experimental full-text index (TYPE text)
 *   - feedback_text_bloom → skip index tokenbf_v1 (token bloom filter)
 *   - feedback_text_plain → no secondary index (full scan)
 *
 * Data is generated fully server-side with INSERT ... SELECT over numbers()
 * plus constant arrays + rand(): no client-side row streaming.
 *
 * Usage:
 *   npx tsx scripts/seed-feedback-search.ts             # create table + seed (default 100M rows)
 *   ROWS=20000000 npx tsx scripts/seed-feedback-search.ts
 *   BATCH=5000000 npx tsx scripts/seed-feedback-search.ts
 *   DROP=1 npx tsx scripts/seed-feedback-search.ts       # drop + recreate first
 *
 * Env: CLICKHOUSE_HOST / PORT / USER / PASSWORD (same as the app, see .env).
 */
import { createClient } from "@clickhouse/client-web";

const TOTAL_ROWS = Number(process.env.ROWS ?? 100_000_000);
const BATCH_SIZE = Number(process.env.BATCH ?? 10_000_000);
const DB = "clickshop";
const TABLE = "customer_feedback";

const client = createClient({
  url: `https://${process.env.CLICKHOUSE_HOST}:${process.env.CLICKHOUSE_PORT ?? "8443"}`,
  username: process.env.CLICKHOUSE_USER ?? "default",
  password: process.env.CLICKHOUSE_PASSWORD ?? "",
  database: DB,
  request_timeout: 30 * 60 * 1000,
});

// ── Real products from public_products (SKU-*) ────────────────────────────
// Aligned arrays: sku / name / category / category index (1..8)
const SKUS = `['SKU-1001','SKU-1002','SKU-1003','SKU-1004','SKU-1005','SKU-1006','SKU-2001','SKU-2002','SKU-2003','SKU-2004','SKU-3001','SKU-3002','SKU-3003','SKU-4001','SKU-4002','SKU-5001','SKU-5002','SKU-6001','SKU-6002','SKU-7001','SKU-7002','SKU-8001','SKU-8002']`;
const NAMES = `['MacBook Pro 14','iPhone 16 Pro','AirPods Pro','Samsung Galaxy S25','Sony WH-1000XM5','Logitech MX Master','Nike Air Max 90','Levis 501 Jeans','North Face Jacket','Adidas Ultraboost','Dyson V15 Detect','Nespresso Vertuo','IKEA Kallax Shelf','La Roche-Posay SPF50','Estee Lauder Serum','Yoga Mat Premium','Protein Whey 2kg','Organic Granola Box','Nespresso Capsules x50','Atomic Habits','Kindle Paperwhite','LEGO Technic Set','Nintendo Switch Game']`;
const CATS = `['Electronics','Electronics','Electronics','Electronics','Electronics','Electronics','Clothing','Clothing','Clothing','Clothing','Home','Home','Home','Beauty','Beauty','Sports','Sports','Food','Food','Books','Books','Toys','Toys']`;
const CAT_IDX = `[1,1,1,1,1,1,2,2,2,2,3,3,3,4,4,5,5,6,6,7,7,8,8]`;
// Product indices grouped by category: comparisons stay within the same
// category so product tokens remain correlated with the sort key
// (category, product_sku); that correlation is what lets tokenbf_v1 skip granules.
const CAT_PRODUCTS = `[[1,2,3,4,5,6],[7,8,9,10],[11,12,13],[14,15],[16,17],[18,19],[20,21],[22,23]]`;

// ── Sentence fragments ─────────────────────────────────────────────────────
// {p} = purchased product, {o} = other product (comparison)
const OPEN_POS = `['Absolutely love my {p}.','Bought the {p} last month and I am really impressed.','The {p} exceeded my expectations in every way.','Very happy with this purchase, the {p} is fantastic.','Five stars for the {p}, no regrets at all.','This is my second {p} and it keeps getting better.','After two weeks of daily use the {p} still feels premium.','Honestly the {p} is the best purchase I made this year.','Great product overall, the {p} does exactly what it promises.','I was skeptical at first but the {p} won me over quickly.','Upgraded from an older model and the {p} is a huge step up.','Superb quality, my {p} arrived well packaged and works flawlessly.']`;
const OPEN_NEG = `['Really disappointed with the {p}.','I regret buying the {p}, it has been nothing but trouble.','The {p} stopped working properly after just a few days.','Expected much more from the {p} at this price point.','Sadly the {p} did not live up to the hype.','One star, my {p} arrived with visible defects.','This {p} is by far the worst purchase I made this year.','I want a refund, the {p} is simply not acceptable.','The {p} looked great online but the reality is different.','Two weeks in and my {p} already shows serious problems.','Customer beware, the {p} has major quality issues.','Returning the {p} tomorrow, completely unusable for me.']`;
const OPEN_NEU = `['The {p} is okay, nothing more.','Mixed feelings about the {p} after a month of use.','The {p} does the job but has a few quirks.','Decent product, though the {p} is not perfect.','The {p} is average, some things are good and some are not.','Not bad, not great, the {p} sits somewhere in the middle.','The {p} works as described but does not stand out.','Three stars for the {p}, it is a reasonable compromise.']`;

// Category-specific aspect sentences (index 1..8 matches CAT_IDX).
const ASP_POS = `[
['The battery life is outstanding and easily lasts a full day of heavy use.','The screen is bright, sharp and a pleasure to look at.','Charging is quick and the bluetooth pairing works instantly every time.','Performance is snappy, apps load fast and the device never overheats.','The sound quality and noise cancellation are simply superb.','The keyboard and trackpad feel precise and responsive.'],
['The fabric feels soft yet durable and the stitching is impeccable.','The fit is true to size and very comfortable for all day wear.','The color has not faded at all after several washes.','The material breathes well and keeps its shape perfectly.','Sizing chart was accurate and the cut is flattering.'],
['The suction power is incredible and the motor runs quietly.','Assembly took ten minutes and the instructions were crystal clear.','The build feels solid and it fits perfectly in our living room.','It brews a perfect cup every single morning without fail.','Maintenance is easy and the parts click together nicely.'],
['My skin feels noticeably smoother after two weeks of use.','The texture is light, absorbs quickly and the scent is subtle.','No irritation at all even on my sensitive skin.','A little goes a long way so the bottle lasts for months.'],
['The grip is excellent even during intense workout sessions.','The material is thick, durable and easy to clean after training.','It mixes easily with no clumps and tastes great after the gym.','Very good protein profile and it digests without any issues.'],
['Tastes fresh and the ingredients are clearly high quality.','The packaging keeps everything crunchy and the portions are generous.','Great flavor selection and the capsules produce a rich crema.','You can really taste the difference compared to supermarket brands.'],
['The print quality is excellent and the binding feels durable.','An engaging read with practical advice on every page.','The display is easy on the eyes even after hours of reading.','Page turns are instant and the backlight is perfect at night.'],
['The pieces snap together perfectly and the instructions are well designed.','Kept the kids entertained for an entire weekend.','The build quality is superb and every part fits precisely.','Great replay value and the difficulty curve is well balanced.']
]`;
const ASP_NEG = `[
['The battery drains ridiculously fast, barely three hours on a charge.','The screen developed dead pixels within the first week.','Charging is painfully slow and the bluetooth connection keeps dropping.','It overheats constantly and the fan noise is unbearable.','The sound is tinny and the noise cancellation barely works.','The firmware update bricked half of the features.'],
['The fabric started pilling after the second wash.','The stitching came apart at the seams within days.','Runs at least one size small, the fit is completely off.','The color faded badly and the material feels cheap.','The zipper broke after a week of normal use.'],
['The suction is weak and the motor makes a horrible grinding noise.','Assembly was a nightmare, holes did not align and screws were missing.','It leaks water all over the counter with every use.','The machine stopped heating properly after two weeks.','Parts feel flimsy and the plastic already cracked.'],
['It broke my skin out badly after just three uses.','The texture is greasy, sits on the skin and smells overpowering.','Caused redness and irritation, had to stop using it.','The pump broke and half the product is wasted.'],
['The surface tears easily and the grip is slippery when wet.','It has a strong chemical smell that will not go away.','Clumps horribly no matter how long you shake it.','Upset my stomach every single time, had to throw it away.'],
['Arrived stale and the taste is bland at best.','Half of the box was crushed and the portions are tiny.','The capsules jam the machine and the coffee tastes burnt.','Way too sweet and the ingredient list is disappointing.'],
['Pages started falling out after the first read.','The print is blurry and the margins are oddly cropped.','The screen froze constantly and the battery indicator is unreliable.','The backlight is uneven with visible shadows at the bottom.'],
['Several pieces were missing from the box.','The instructions are confusing and some parts do not fit at all.','It broke on the second day of normal play.','Cheap plastic that snapped almost immediately.']
]`;

const DELIV_POS = `['Delivery was fast, it arrived two days earlier than promised.','Shipping was quick and the tracking updates were accurate.','Arrived on time and the packaging was neat and secure.','The courier was friendly and delivery went smoothly.','Impressive logistics, ordered Monday and received it Wednesday.']`;
const DELIV_NEG = `['Delivery was late by more than a week with zero communication.','The package arrived damaged because the box was flimsy.','Shipping took forever and the tracking never updated.','The courier left it in the rain outside my door.','Late delivery ruined the birthday gift I had planned.','My order got lost and the replacement also arrived late.']`;
const PRICE_POS = `['Worth every euro, the price is fair for this level of quality.','Caught it on sale and it is excellent value for money.','Cheaper than the competition and better quality too.','Premium price but the quality justifies the cost completely.']`;
const PRICE_NEG = `['Way too expensive for what you actually get.','Overpriced compared to similar products from other brands.','The price dropped by thirty percent a week after I bought it, frustrating.','Not worth the money at all, save your cash.']`;
const SUPPORT_POS = `['Customer service was responsive and solved my issue within a day.','The support team sent a replacement immediately, no questions asked.','Warranty claim was handled quickly and professionally.','Support answered on the first call and were genuinely helpful.']`;
const SUPPORT_NEG = `['Customer service was useless and never replied to my emails.','The support hotline kept me on hold for over an hour.','Warranty claim was rejected on a ridiculous technicality.','The refund process is a maze designed to make you give up.','Support promised a callback that never happened.']`;
const COMPARE = `['I compared it with the {o} before buying and I think I made the right call.','My friend has the {o} and we keep debating which one is better.','Coming from the {o}, the difference is noticeable.','I almost bought the {o} instead, still wondering sometimes.','It replaced my old {o} which lasted five years.']`;
const CLOSE_POS = `['Highly recommended to anyone on the fence.','Would definitely buy again without hesitation.','Recommending it to all my friends and family.','If you are hesitating, just go for it.','Solid five stars from me.']`;
const CLOSE_NEG = `['I would not recommend this to anyone.','Avoid this product, learn from my mistake.','Never buying from this brand again.','Save yourself the trouble and look elsewhere.','Requesting a refund as we speak.']`;
const CLOSE_NEU = `['Might work better for someone with different needs.','It is fine if your expectations are moderate.','Will update my review after a few more months.','Take my rating with a grain of salt, your mileage may vary.']`;

// Occasional typos to keep the corpus realistic (about 4% of rows).
const TYPO_FROM = `['delivery','battery','definitely','received','quality']`;
const TYPO_TO = `['delivry','battary','definately','recieved','qualitiy']`;

const pick = (arr: string, seed: number) =>
  `arrayElement(${arr}, 1 + rand(${seed}) % length(${arr}))`;
const pickNested = (arr: string, idxExpr: string, seed: number) =>
  `arrayElement(arrayElement(${arr}, ${idxExpr}), 1 + rand(${seed}) % length(arrayElement(${arr}, ${idxExpr})))`;

function insertSql(offset: number, count: number): string {
  return `
INSERT INTO ${DB}.${TABLE}
  (feedback_id, customer_id, product_sku, product_name, category, rating,
   feedback_text_fts, feedback_text_bloom, feedback_text_plain, created_at)
SELECT
  feedback_id, customer_id, product_sku, product_name, category, rating,
  txt AS feedback_text_fts,
  txt AS feedback_text_bloom,
  txt AS feedback_text_plain,
  created_at
FROM
(
  SELECT
    number + 1 AS feedback_id,
    toUInt32(1 + rand(1) % 44000) AS customer_id,
    arrayElement(${SKUS}, pi) AS product_sku,
    arrayElement(${NAMES}, pi) AS product_name,
    arrayElement(${CATS}, pi) AS category,
    multiIf(s = 0, toUInt8(4 + rand(2) % 2), s = 1, toUInt8(1 + rand(3) % 2), toUInt8(3)) AS rating,
    now() - toIntervalSecond(rand(4) % 31536000) AS created_at,
    -- assemble the review from independent random fragments
    arrayStringConcat(arrayFilter(x -> x != '', [
      replaceOne(
        multiIf(s = 0, ${pick(OPEN_POS, 20)}, s = 1, ${pick(OPEN_NEG, 21)}, ${pick(OPEN_NEU, 22)}),
        '{p}', arrayElement(${NAMES}, pi)),
      if(s = 1 OR (s = 2 AND rand(23) % 2 = 0),
         ${pickNested(ASP_NEG, `arrayElement(${CAT_IDX}, pi)`, 24)},
         ${pickNested(ASP_POS, `arrayElement(${CAT_IDX}, pi)`, 25)}),
      if(rand(30) % 100 < 55, if(s = 1, ${pick(DELIV_NEG, 31)}, ${pick(DELIV_POS, 32)}), ''),
      if(rand(33) % 100 < 45, if(s = 1, ${pick(PRICE_NEG, 34)}, ${pick(PRICE_POS, 35)}), ''),
      if(rand(36) % 100 < 35, if(s = 1, ${pick(SUPPORT_NEG, 37)}, ${pick(SUPPORT_POS, 38)}), ''),
      if(rand(39) % 100 < 25,
         replaceOne(${pick(COMPARE, 40)}, '{o}',
           arrayElement(${NAMES},
             arrayElement(arrayElement(${CAT_PRODUCTS}, arrayElement(${CAT_IDX}, pi)),
               1 + rand(41) % length(arrayElement(${CAT_PRODUCTS}, arrayElement(${CAT_IDX}, pi)))))),
         ''),
      multiIf(s = 0, ${pick(CLOSE_POS, 42)}, s = 1, ${pick(CLOSE_NEG, 43)}, ${pick(CLOSE_NEU, 44)})
    ]), ' ') AS rawTxt,
    if(rand(50) % 100 < 4,
       replaceOne(rawTxt,
         arrayElement(${TYPO_FROM}, 1 + rand(51) % 5),
         arrayElement(${TYPO_TO}, 1 + rand(51) % 5)),
       rawTxt) AS txt
  FROM
  (
    SELECT
      number,
      toUInt32(1 + rand64(10) % 23) AS pi,
      multiIf(rand(11) % 100 < 45, 0, rand(11) % 100 < 80, 1, 2) AS s
    FROM numbers(${offset}, ${count})
  )
)`;
}

const DDL = `
CREATE TABLE IF NOT EXISTS ${DB}.${TABLE}
(
  feedback_id          UInt64,
  customer_id          UInt32,
  product_sku          LowCardinality(String),
  product_name         LowCardinality(String),
  category             LowCardinality(String),
  rating               UInt8,
  feedback_text_fts    String,
  feedback_text_bloom  String,
  feedback_text_plain  String,
  created_at           DateTime,
  INDEX idx_feedback_fts   feedback_text_fts   TYPE text(tokenizer = 'splitByNonAlpha'),
  INDEX idx_feedback_bloom feedback_text_bloom TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 1
)
ENGINE = MergeTree
ORDER BY (category, product_sku, created_at)`;

async function main() {
  if (!process.env.CLICKHOUSE_HOST) {
    console.error("CLICKHOUSE_HOST is required (source .env first)");
    process.exit(1);
  }

  if (process.env.DROP === "1") {
    console.log(`Dropping ${DB}.${TABLE}...`);
    await client.command({ query: `DROP TABLE IF EXISTS ${DB}.${TABLE}` });
  }

  console.log(`Creating ${DB}.${TABLE} (if not exists)...`);
  await client.command({
    query: DDL,
    clickhouse_settings: { allow_experimental_full_text_index: 1 },
  });

  const existing = await client.query({
    query: `SELECT count() AS c FROM ${DB}.${TABLE}`,
    format: "JSONEachRow",
  });
  const startCount = Number(((await existing.json()) as { c: string }[])[0].c);
  console.log(`Existing rows: ${startCount.toLocaleString()}`);

  let offset = startCount;
  while (offset < TOTAL_ROWS) {
    const count = Math.min(BATCH_SIZE, TOTAL_ROWS - offset);
    const t0 = Date.now();
    process.stdout.write(`Inserting rows ${offset.toLocaleString()} → ${(offset + count).toLocaleString()}... `);
    await client.command({
      query: insertSql(offset, count),
      clickhouse_settings: {
        max_execution_time: 1800,
        // keep insert memory bounded on an 8 GiB service
        max_insert_block_size: "1048576",
        max_threads: 4,
      },
    });
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    offset += count;
  }

  const stats = await client.query({
    query: `
      SELECT count() AS rows FROM ${DB}.${TABLE};`,
    format: "JSONEachRow",
  });
  console.log("Final row count:", ((await stats.json()) as unknown[])[0]);

  const parts = await client.query({
    query: `
      SELECT count() AS parts, sum(rows) AS rows,
             formatReadableSize(sum(bytes_on_disk)) AS on_disk,
             formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed
      FROM system.parts WHERE active AND database = '${DB}' AND table = '${TABLE}'`,
    format: "JSONEachRow",
  });
  console.log("Parts stats:", ((await parts.json()) as unknown[])[0]);
  await client.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
