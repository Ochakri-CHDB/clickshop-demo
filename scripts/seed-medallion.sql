-- =====================================================================
-- ClickShop Medallion Architecture
-- Bronze (Raw) → Silver (Clean/Enriched) → Gold (Aggregated Insights)
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- STEP 0: Drop old pre-aggregated tables (replaced by gold layer)
-- ─────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS clickshop.product_performance_hourly;
DROP TABLE IF EXISTS clickshop.customer_activity;
DROP TABLE IF EXISTS clickshop.revenue_analytics;
DROP TABLE IF EXISTS clickshop.conversion_analytics;

-- ─────────────────────────────────────────────────────────────────────
-- BRONZE LAYER (already exists)
--   Raw PG mirrors (ClickPipes CDC): public_*
--   Raw event streams: page_events, cart_events, checkout_events,
--                      order_events, payment_events, inventory_events
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- SILVER LAYER: Refreshable MVs — deduplicated & enriched from Bronze
-- ─────────────────────────────────────────────────────────────────────

-- silver_customers: clean deduplicated customer dimension
DROP VIEW IF EXISTS clickshop.silver_customers_mv;
DROP TABLE IF EXISTS clickshop.silver_customers;

CREATE TABLE clickshop.silver_customers (
    id          Int32,
    email       String,
    full_name   String,
    country     String,
    tier        String,
    is_vip      Bool,
    created_at  DateTime64(6)
) ENGINE = MergeTree()
ORDER BY id;

CREATE MATERIALIZED VIEW clickshop.silver_customers_mv
REFRESH EVERY 30 SECOND
TO clickshop.silver_customers
AS SELECT
    id, email, full_name, country, tier, is_vip, created_at
FROM clickshop.public_customers FINAL
WHERE _peerdb_is_deleted = 0;


-- silver_products: clean deduplicated product dimension
DROP VIEW IF EXISTS clickshop.silver_products_mv;
DROP TABLE IF EXISTS clickshop.silver_products;

CREATE TABLE clickshop.silver_products (
    id                  Int32,
    sku                 String,
    name                String,
    category            String,
    price               Decimal(10, 2),
    inventory_available Int32,
    created_at          DateTime64(6)
) ENGINE = MergeTree()
ORDER BY id;

CREATE MATERIALIZED VIEW clickshop.silver_products_mv
REFRESH EVERY 30 SECOND
TO clickshop.silver_products
AS SELECT
    id, sku, name, category, price, inventory_available, created_at
FROM clickshop.public_products FINAL
WHERE _peerdb_is_deleted = 0;


-- silver_orders: orders enriched with customer + product info
DROP VIEW IF EXISTS clickshop.silver_orders_mv;
DROP TABLE IF EXISTS clickshop.silver_orders;

CREATE TABLE clickshop.silver_orders (
    order_id         Int32,
    customer_id      Int32,
    customer_name    String,
    customer_email   String,
    customer_country String,
    customer_tier    String,
    is_vip           Bool,
    status           String,
    total_amount     Decimal(10, 2),
    payment_method   String,
    country          String,
    channel          String,
    created_at       DateTime64(6),
    items_count      UInt64,
    items_revenue    Decimal(38, 2)
) ENGINE = MergeTree()
ORDER BY (order_id, created_at);

CREATE MATERIALIZED VIEW clickshop.silver_orders_mv
REFRESH EVERY 30 SECOND
TO clickshop.silver_orders
AS SELECT
    o.id AS order_id,
    o.customer_id,
    c.full_name AS customer_name,
    c.email AS customer_email,
    c.country AS customer_country,
    c.tier AS customer_tier,
    c.is_vip,
    o.status,
    o.total_amount,
    o.payment_method,
    o.country,
    o.channel,
    o.created_at,
    count(oi.id) AS items_count,
    sum(oi.total_price) AS items_revenue
FROM clickshop.public_orders AS o FINAL
LEFT JOIN clickshop.public_customers AS c FINAL ON c.id = o.customer_id AND c._peerdb_is_deleted = 0
LEFT JOIN clickshop.public_order_items AS oi FINAL ON oi.order_id = o.id AND oi._peerdb_is_deleted = 0
WHERE o._peerdb_is_deleted = 0
GROUP BY o.id, o.customer_id, c.full_name, c.email, c.country, c.tier, c.is_vip,
         o.status, o.total_amount, o.payment_method, o.country, o.channel, o.created_at;


-- silver_payments: payments enriched with order context
DROP VIEW IF EXISTS clickshop.silver_payments_mv;
DROP TABLE IF EXISTS clickshop.silver_payments;

CREATE TABLE clickshop.silver_payments (
    order_id        Int32,
    payment_status  String,
    provider        String,
    failure_reason  String,
    customer_id     Int32,
    order_amount    Decimal(10, 2),
    payment_method  String,
    order_country   String,
    order_channel   String,
    order_status    String,
    updated_at      DateTime64(6)
) ENGINE = MergeTree()
ORDER BY (order_id, updated_at);

CREATE MATERIALIZED VIEW clickshop.silver_payments_mv
REFRESH EVERY 30 SECOND
TO clickshop.silver_payments
AS SELECT
    p.order_id,
    p.status AS payment_status,
    p.provider,
    p.failure_reason,
    o.customer_id,
    o.total_amount AS order_amount,
    o.payment_method,
    o.country AS order_country,
    o.channel AS order_channel,
    o.status AS order_status,
    p.updated_at
FROM clickshop.public_payment_status_current AS p FINAL
JOIN clickshop.public_orders AS o FINAL ON o.id = p.order_id AND o._peerdb_is_deleted = 0
WHERE p._peerdb_is_deleted = 0;


-- ─────────────────────────────────────────────────────────────────────
-- GOLD LAYER: Aggregated insights — streaming MVs + refreshable MVs
-- ─────────────────────────────────────────────────────────────────────

-- gold_revenue_daily: streaming MV from order_events (real-time)
DROP VIEW IF EXISTS clickshop.gold_revenue_daily_mv;
DROP TABLE IF EXISTS clickshop.gold_revenue_daily;

CREATE TABLE clickshop.gold_revenue_daily (
    dt              Date,
    country         String,
    channel         String,
    category        String,
    orders          UInt64,
    revenue         Decimal(38, 2),
    units_sold      UInt64,
    unique_customers SimpleAggregateFunction(uniq, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY (dt, country, channel, category);

CREATE MATERIALIZED VIEW clickshop.gold_revenue_daily_mv
TO clickshop.gold_revenue_daily
AS SELECT
    toDate(event_time) AS dt,
    country,
    channel,
    category,
    count() AS orders,
    sum(total_amount) AS revenue,
    sum(quantity) AS units_sold,
    uniqState(customer_id) AS unique_customers
FROM clickshop.order_events
GROUP BY dt, country, channel, category;


-- gold_product_performance: streaming MV from order_events
DROP VIEW IF EXISTS clickshop.gold_product_performance_mv;
DROP TABLE IF EXISTS clickshop.gold_product_performance;

CREATE TABLE clickshop.gold_product_performance (
    dt            Date,
    product_sku   String,
    product_name  String,
    category      String,
    orders        UInt64,
    units_sold    UInt64,
    revenue       Decimal(38, 2)
) ENGINE = SummingMergeTree((orders, units_sold, revenue))
ORDER BY (dt, product_sku, category);

CREATE MATERIALIZED VIEW clickshop.gold_product_performance_mv
TO clickshop.gold_product_performance
AS SELECT
    toDate(event_time) AS dt,
    product_sku,
    product_name,
    category,
    count() AS orders,
    sum(quantity) AS units_sold,
    sum(total_amount) AS revenue
FROM clickshop.order_events
GROUP BY dt, product_sku, product_name, category;


-- gold_payment_health: streaming MV from payment_events
DROP VIEW IF EXISTS clickshop.gold_payment_health_mv;
DROP TABLE IF EXISTS clickshop.gold_payment_health;

CREATE TABLE clickshop.gold_payment_health (
    dt              Date,
    payment_method  String,
    provider        String,
    status          String,
    cnt             UInt64,
    total_amount    Decimal(38, 2)
) ENGINE = SummingMergeTree((cnt, total_amount))
ORDER BY (dt, payment_method, provider, status);

CREATE MATERIALIZED VIEW clickshop.gold_payment_health_mv
TO clickshop.gold_payment_health
AS SELECT
    toDate(event_time) AS dt,
    payment_method,
    provider,
    toString(status) AS status,
    count() AS cnt,
    sum(amount) AS total_amount
FROM clickshop.payment_events
GROUP BY dt, payment_method, provider, status;


-- gold_funnel_hourly: refreshable MV (cross-source funnel)
DROP VIEW IF EXISTS clickshop.gold_funnel_hourly_mv;
DROP TABLE IF EXISTS clickshop.gold_funnel_hourly;

CREATE TABLE clickshop.gold_funnel_hourly (
    dt             Date,
    hour           UInt8,
    country        String,
    device         String,
    page_views     UInt64,
    cart_adds      UInt64,
    checkouts      UInt64,
    purchases      UInt64,
    cart_rate      Float64,
    checkout_rate  Float64,
    purchase_rate  Float64
) ENGINE = MergeTree()
ORDER BY (dt, hour, country, device);

CREATE MATERIALIZED VIEW clickshop.gold_funnel_hourly_mv
REFRESH EVERY 1 MINUTE
TO clickshop.gold_funnel_hourly
AS
WITH
    (SELECT toDate(min(event_time)) FROM clickshop.page_events WHERE event_time >= today() - 7) AS start_dt
SELECT
    pv.dt, pv.hour, pv.country, pv.device,
    pv.cnt AS page_views,
    coalesce(ca.cnt, 0) AS cart_adds,
    coalesce(co.cnt, 0) AS checkouts,
    coalesce(pu.cnt, 0) AS purchases,
    if(pv.cnt > 0, coalesce(ca.cnt, 0) / pv.cnt, 0) AS cart_rate,
    if(coalesce(ca.cnt, 0) > 0, coalesce(co.cnt, 0) / ca.cnt, 0) AS checkout_rate,
    if(coalesce(co.cnt, 0) > 0, coalesce(pu.cnt, 0) / co.cnt, 0) AS purchase_rate
FROM (
    SELECT toDate(event_time) AS dt, toHour(event_time) AS hour,
           country, toString(device) AS device, count() AS cnt
    FROM clickshop.page_events
    WHERE event_time >= today() - 7
    GROUP BY dt, hour, country, device
) AS pv
LEFT JOIN (
    SELECT toDate(event_time) AS dt, toHour(event_time) AS hour,
           country, toString(device) AS device, count() AS cnt
    FROM clickshop.cart_events
    WHERE event_time >= today() - 7
    GROUP BY dt, hour, country, device
) AS ca USING (dt, hour, country, device)
LEFT JOIN (
    SELECT toDate(event_time) AS dt, toHour(event_time) AS hour,
           country, toString(device) AS device, count() AS cnt
    FROM clickshop.checkout_events
    WHERE event_time >= today() - 7
    GROUP BY dt, hour, country, device
) AS co USING (dt, hour, country, device)
LEFT JOIN (
    SELECT toDate(event_time) AS dt, toHour(event_time) AS hour,
           country, toString(device) AS device, count() AS cnt
    FROM clickshop.order_events
    WHERE event_time >= today() - 7
    GROUP BY dt, hour, country, device
) AS pu USING (dt, hour, country, device);


-- gold_customer_rfm: refreshable MV — RFM segmentation
DROP VIEW IF EXISTS clickshop.gold_customer_rfm_mv;
DROP TABLE IF EXISTS clickshop.gold_customer_rfm;

CREATE TABLE clickshop.gold_customer_rfm (
    customer_id      Int32,
    customer_name    String,
    customer_email   String,
    customer_tier    String,
    is_vip           Bool,
    country          String,
    total_orders     UInt64,
    total_revenue    Decimal(38, 2),
    avg_order_value  Decimal(38, 2),
    first_order      DateTime64(6),
    last_order       DateTime64(6),
    recency_days     UInt32,
    rfm_segment      String
) ENGINE = MergeTree()
ORDER BY (rfm_segment, customer_id);

CREATE MATERIALIZED VIEW clickshop.gold_customer_rfm_mv
REFRESH EVERY 5 MINUTE
TO clickshop.gold_customer_rfm
AS SELECT
    o.customer_id,
    o.customer_name,
    o.customer_email,
    o.customer_tier,
    o.is_vip,
    o.customer_country AS country,
    count() AS total_orders,
    sum(o.total_amount) AS total_revenue,
    avg(o.total_amount) AS avg_order_value,
    min(o.created_at) AS first_order,
    max(o.created_at) AS last_order,
    dateDiff('day', max(o.created_at), now64()) AS recency_days,
    multiIf(
        dateDiff('day', max(o.created_at), now64()) <= 7 AND sum(o.total_amount) > 500, 'champion',
        dateDiff('day', max(o.created_at), now64()) <= 7, 'active',
        dateDiff('day', max(o.created_at), now64()) <= 30 AND sum(o.total_amount) > 300, 'loyal',
        dateDiff('day', max(o.created_at), now64()) <= 30, 'warm',
        dateDiff('day', max(o.created_at), now64()) <= 90, 'cooling',
        'churned'
    ) AS rfm_segment
FROM clickshop.silver_orders AS o
WHERE o.status != 'cancelled'
GROUP BY o.customer_id, o.customer_name, o.customer_email, o.customer_tier, o.is_vip, o.customer_country;


-- gold_vip_dashboard: refreshable MV — VIP customer impact
DROP VIEW IF EXISTS clickshop.gold_vip_dashboard_mv;
DROP TABLE IF EXISTS clickshop.gold_vip_dashboard;

CREATE TABLE clickshop.gold_vip_dashboard (
    customer_id       Int32,
    customer_name     String,
    customer_email    String,
    tier              String,
    country           String,
    total_orders      UInt64,
    total_revenue     Decimal(38, 2),
    failed_payments   UInt64,
    last_order_at     DateTime64(6),
    last_failure_reason String,
    risk_level        String
) ENGINE = MergeTree()
ORDER BY (risk_level, customer_id);

CREATE MATERIALIZED VIEW clickshop.gold_vip_dashboard_mv
REFRESH EVERY 5 MINUTE
TO clickshop.gold_vip_dashboard
AS SELECT
    c.id AS customer_id,
    c.full_name AS customer_name,
    c.email AS customer_email,
    c.tier,
    c.country,
    count(o.order_id) AS total_orders,
    sum(o.total_amount) AS total_revenue,
    countIf(p.payment_status = 'failed') AS failed_payments,
    max(o.created_at) AS last_order_at,
    argMax(p.failure_reason, p.updated_at) AS last_failure_reason,
    multiIf(
        countIf(p.payment_status = 'failed') >= 3, 'critical',
        countIf(p.payment_status = 'failed') >= 1, 'at_risk',
        'healthy'
    ) AS risk_level
FROM clickshop.silver_customers AS c
LEFT JOIN clickshop.silver_orders AS o ON o.customer_id = c.id
LEFT JOIN clickshop.silver_payments AS p ON p.order_id = o.order_id
WHERE c.is_vip = 1
GROUP BY c.id, c.full_name, c.email, c.tier, c.country;


-- gold_daily_kpi: refreshable MV — daily summary
DROP VIEW IF EXISTS clickshop.gold_daily_kpi_mv;
DROP TABLE IF EXISTS clickshop.gold_daily_kpi;

CREATE TABLE clickshop.gold_daily_kpi (
    dt                Date,
    total_revenue     Decimal(38, 2),
    total_orders      UInt64,
    avg_order_value   Float64,
    unique_customers  UInt64,
    new_customers     UInt64,
    vip_revenue       Decimal(38, 2),
    failed_payments   UInt64,
    payment_failure_rate Float64,
    top_category      String,
    top_country       String
) ENGINE = ReplacingMergeTree()
ORDER BY dt;

CREATE MATERIALIZED VIEW clickshop.gold_daily_kpi_mv
REFRESH EVERY 1 MINUTE
TO clickshop.gold_daily_kpi
AS SELECT
    toDate(event_time) AS dt,
    sum(total_amount) AS total_revenue,
    count() AS total_orders,
    avg(total_amount) AS avg_order_value,
    uniq(customer_id) AS unique_customers,
    uniqIf(customer_id, toDate(event_time) = today()) AS new_customers,
    sumIf(total_amount, customer_id IN (
        SELECT id FROM clickshop.public_customers FINAL WHERE is_vip = 1 AND _peerdb_is_deleted = 0
    )) AS vip_revenue,
    (SELECT count() FROM clickshop.payment_events WHERE toDate(event_time) = dt AND status = 'failed') AS failed_payments,
    (SELECT countIf(status = 'failed') / greatest(count(), 1)
     FROM clickshop.payment_events WHERE toDate(event_time) = dt) AS payment_failure_rate,
    (SELECT category FROM clickshop.order_events WHERE toDate(event_time) = dt
     GROUP BY category ORDER BY sum(total_amount) DESC LIMIT 1) AS top_category,
    (SELECT country FROM clickshop.order_events WHERE toDate(event_time) = dt
     GROUP BY country ORDER BY sum(total_amount) DESC LIMIT 1) AS top_country
FROM clickshop.order_events
WHERE event_time >= today() - 30
GROUP BY dt;
