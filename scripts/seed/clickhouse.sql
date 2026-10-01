-- ClickShop Intelligence — ClickHouse Seed Data
-- Analytical tables for event-driven and aggregated data

-- Page events
CREATE TABLE IF NOT EXISTS page_events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime DEFAULT now(),
    session_id String,
    user_id UInt32,
    page_url String,
    page_type Enum8('home' = 1, 'category' = 2, 'product' = 3, 'cart' = 4, 'checkout' = 5, 'confirmation' = 6),
    device Enum8('desktop' = 1, 'mobile' = 2, 'tablet' = 3),
    country String,
    referrer String DEFAULT ''
) ENGINE = MergeTree()
ORDER BY (event_time, session_id);

-- Cart events
CREATE TABLE IF NOT EXISTS cart_events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime DEFAULT now(),
    session_id String,
    user_id UInt32,
    product_sku String,
    product_name String,
    category String,
    action Enum8('add' = 1, 'remove' = 2, 'update_qty' = 3),
    quantity UInt16,
    unit_price Decimal(10,2),
    country String,
    device Enum8('desktop' = 1, 'mobile' = 2, 'tablet' = 3)
) ENGINE = MergeTree()
ORDER BY (event_time, session_id);

-- Checkout events
CREATE TABLE IF NOT EXISTS checkout_events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime DEFAULT now(),
    session_id String,
    user_id UInt32,
    event_type Enum8('page_view' = 1, 'begin_checkout' = 2, 'add_payment' = 3, 'purchase' = 4, 'abandon' = 5),
    cart_value Decimal(10,2),
    items_count UInt16,
    country String,
    device Enum8('desktop' = 1, 'mobile' = 2, 'tablet' = 3),
    payment_method String DEFAULT ''
) ENGINE = MergeTree()
ORDER BY (event_time, session_id);

-- Payment events
CREATE TABLE IF NOT EXISTS payment_events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime DEFAULT now(),
    order_id UInt32,
    user_id UInt32,
    amount Decimal(10,2),
    currency String DEFAULT 'EUR',
    payment_method String,
    provider String DEFAULT 'stripe',
    status Enum8('pending' = 1, 'success' = 2, 'failed' = 3, 'refunded' = 4),
    failure_reason String DEFAULT '',
    country String
) ENGINE = MergeTree()
ORDER BY (event_time, order_id);

-- Order events (denormalized for analytics)
CREATE TABLE IF NOT EXISTS order_events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime DEFAULT now(),
    order_id UInt32,
    customer_id UInt32,
    product_sku String,
    product_name String,
    category String,
    quantity UInt16,
    unit_price Decimal(10,2),
    total_amount Decimal(10,2),
    payment_method String,
    status String,
    country String,
    channel String DEFAULT 'web',
    device String DEFAULT 'desktop'
) ENGINE = MergeTree()
ORDER BY (event_time, order_id);

-- Inventory events
CREATE TABLE IF NOT EXISTS inventory_events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime DEFAULT now(),
    product_sku String,
    product_name String,
    category String,
    change_type Enum8('restock' = 1, 'sale' = 2, 'adjustment' = 3, 'return' = 4),
    quantity_change Int32,
    quantity_after UInt32,
    warehouse String DEFAULT 'EU-Central'
) ENGINE = MergeTree()
ORDER BY (event_time, product_sku);

-- Product performance (hourly materialized view candidate)
CREATE TABLE IF NOT EXISTS product_performance_hourly (
    hour DateTime,
    product_sku String,
    product_name String,
    category String,
    revenue Decimal(12,2),
    units_sold UInt32,
    page_views UInt32,
    add_to_cart UInt32,
    orders UInt32,
    conversion_rate Float32
) ENGINE = MergeTree()
ORDER BY (hour, product_sku);

-- Customer activity summary
CREATE TABLE IF NOT EXISTS customer_activity (
    date Date,
    customer_id UInt32,
    country String,
    tier String,
    page_views UInt32,
    cart_adds UInt32,
    checkouts UInt32,
    purchases UInt32,
    total_spent Decimal(10,2),
    sessions UInt16
) ENGINE = MergeTree()
ORDER BY (date, customer_id);

-- Revenue analytics (daily)
CREATE TABLE IF NOT EXISTS revenue_analytics (
    date Date,
    country String,
    category String,
    channel String,
    device String,
    revenue Decimal(12,2),
    orders UInt32,
    avg_order_value Decimal(10,2),
    unique_customers UInt32
) ENGINE = MergeTree()
ORDER BY (date, country, category);

-- Conversion analytics
CREATE TABLE IF NOT EXISTS conversion_analytics (
    date Date,
    country String,
    device String,
    channel String,
    page_views UInt32,
    add_to_cart UInt32,
    begin_checkout UInt32,
    purchase UInt32,
    conversion_rate Float32
) ENGINE = MergeTree()
ORDER BY (date, country, device);

-- ─── Seed data ─────────────────────────────────────────────────────────

-- Seed order_events (7 days of data)
INSERT INTO order_events (event_time, order_id, customer_id, product_sku, product_name, category, quantity, unit_price, total_amount, payment_method, status, country, channel, device)
SELECT
    now() - toIntervalSecond(rand() % 604800),
    rand() % 10000 + 1,
    rand() % 15 + 1,
    ['ELEC-001','ELEC-014','ELEC-042','HOME-023','HOME-045','FASH-001','SPRT-007','SPRT-019','BEAU-011','BOOK-005'][rand() % 10 + 1],
    ['Wireless Headphones','Smart TV 55"','Smart Watch','Office Chair','Standing Desk','Wool Coat','Running Shoes','Yoga Mat','Skincare Set','Novel Bundle'][rand() % 10 + 1],
    ['Electronics','Electronics','Electronics','Home & Living','Home & Living','Fashion','Sports & Outdoor','Sports & Outdoor','Beauty & Health','Books & Media'][rand() % 10 + 1],
    rand() % 3 + 1,
    [149.99, 599.99, 199.99, 199.99, 349.99, 289.99, 69.99, 49.99, 99.99, 19.99][rand() % 10 + 1],
    [149.99, 599.99, 199.99, 199.99, 349.99, 289.99, 69.99, 49.99, 99.99, 19.99][rand() % 10 + 1] * (rand() % 3 + 1),
    ['credit_card','credit_card','paypal','bank_transfer','apple_pay'][rand() % 5 + 1],
    ['completed','completed','completed','completed','failed','pending'][rand() % 6 + 1],
    ['Germany','France','United Kingdom','Spain','Italy','Netherlands','Sweden','Poland'][rand() % 8 + 1],
    ['web','mobile','web'][rand() % 3 + 1],
    ['desktop','mobile','tablet'][rand() % 3 + 1]
FROM numbers(5000);

-- Seed payment_events
INSERT INTO payment_events (event_time, order_id, user_id, amount, payment_method, status, failure_reason, country)
SELECT
    now() - toIntervalSecond(rand() % 604800),
    rand() % 10000 + 1,
    rand() % 15 + 1,
    [49.99, 99.99, 149.99, 199.99, 299.99, 399.99, 599.99][rand() % 7 + 1],
    ['credit_card','credit_card','paypal','bank_transfer','apple_pay'][rand() % 5 + 1],
    multiIf(rand() % 20 < 17, 'success', rand() % 20 < 19, 'failed', 'pending'),
    if(rand() % 20 >= 17 AND rand() % 20 < 19,
       ['gateway_timeout','card_declined','insufficient_funds','3ds_failure','fraud_check'][rand() % 5 + 1], ''),
    ['Germany','France','United Kingdom','Spain','Italy','Netherlands','Sweden','Poland'][rand() % 8 + 1]
FROM numbers(6000);

-- Seed checkout_events
INSERT INTO checkout_events (event_time, session_id, user_id, event_type, cart_value, items_count, country, device, payment_method)
SELECT
    now() - toIntervalSecond(rand() % 604800),
    concat('sess-', toString(rand() % 20000)),
    rand() % 15 + 1,
    ['page_view','page_view','page_view','begin_checkout','begin_checkout','add_payment','purchase','abandon'][rand() % 8 + 1],
    [29.99, 79.99, 149.99, 249.99, 399.99][rand() % 5 + 1],
    rand() % 5 + 1,
    ['Germany','France','United Kingdom','Spain','Italy','Netherlands','Sweden','Poland'][rand() % 8 + 1],
    ['desktop','mobile','tablet'][rand() % 3 + 1],
    ['credit_card','paypal','apple_pay','bank_transfer'][rand() % 4 + 1]
FROM numbers(30000);

-- Seed page_events
INSERT INTO page_events (event_time, session_id, user_id, page_type, device, country)
SELECT
    now() - toIntervalSecond(rand() % 604800),
    concat('sess-', toString(rand() % 20000)),
    rand() % 15 + 1,
    ['home','category','product','product','cart','checkout'][rand() % 6 + 1],
    ['desktop','mobile','tablet'][rand() % 3 + 1],
    ['Germany','France','United Kingdom','Spain','Italy','Netherlands','Sweden','Poland'][rand() % 8 + 1]
FROM numbers(50000);

-- Seed revenue_analytics
INSERT INTO revenue_analytics (date, country, category, channel, device, revenue, orders, avg_order_value, unique_customers)
SELECT
    today() - toIntervalDay(number % 7),
    ['Germany','France','United Kingdom','Spain','Italy','Netherlands','Sweden','Poland'][rand() % 8 + 1],
    ['Electronics','Home & Living','Fashion','Sports & Outdoor','Beauty & Health','Books & Media'][rand() % 6 + 1],
    ['web','mobile'][rand() % 2 + 1],
    ['desktop','mobile','tablet'][rand() % 3 + 1],
    round(rand() % 50000 + 5000, 2),
    rand() % 200 + 20,
    round(rand() % 300 + 30, 2),
    rand() % 100 + 10
FROM numbers(200);

-- Seed conversion_analytics
INSERT INTO conversion_analytics (date, country, device, channel, page_views, add_to_cart, begin_checkout, purchase, conversion_rate)
SELECT
    today() - toIntervalDay(number % 7),
    ['Germany','France','United Kingdom','Spain','Italy','Netherlands','Sweden','Poland'][rand() % 8 + 1],
    ['desktop','mobile','tablet'][rand() % 3 + 1],
    ['web','mobile'][rand() % 2 + 1],
    rand() % 5000 + 1000,
    rand() % 1500 + 200,
    rand() % 800 + 100,
    rand() % 300 + 30,
    round((rand() % 500 + 100) / 10000.0, 4)
FROM numbers(100);
