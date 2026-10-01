-- Demo history. Placeholders: {{CUSTOMERS}}, {{ORDERS}}, {{DAYS}}
-- Bulk ids stay below 1,000,000: the live traffic generator uses ids above.

INSERT INTO products (id, sku, name, category, price, inventory_available, created_at)
SELECT i, sku, name, cat, price, 100 + (random() * 4900)::int, NOW() - INTERVAL '400 days'
FROM unnest(
  ARRAY['SKU-1001','SKU-1002','SKU-1003','SKU-1004','SKU-1005','SKU-1006','SKU-2001','SKU-2002','SKU-2003','SKU-2004','SKU-3001','SKU-3002','SKU-3003','SKU-4001','SKU-4002','SKU-5001','SKU-5002','SKU-6001','SKU-6002','SKU-7001','SKU-7002','SKU-8001','SKU-8002'],
  ARRAY['MacBook Pro 14','iPhone 16 Pro','AirPods Pro','Samsung Galaxy S25','Sony WH-1000XM5','Logitech MX Master','Nike Air Max 90','Levis 501 Jeans','North Face Jacket','Adidas Ultraboost','Dyson V15 Detect','Nespresso Vertuo','IKEA Kallax Shelf','La Roche-Posay SPF50','Estée Lauder Serum','Yoga Mat Premium','Protein Whey 2kg','Organic Granola Box','Nespresso Capsules x50','Atomic Habits','Kindle Paperwhite','LEGO Technic Set','Nintendo Switch Game'],
  ARRAY['Electronics','Electronics','Electronics','Electronics','Electronics','Electronics','Clothing','Clothing','Clothing','Clothing','Home','Home','Home','Beauty','Beauty','Sports','Sports','Food','Food','Books','Books','Toys','Toys'],
  ARRAY[1999,1199,219,999,348,89,135,84,235,165,649,184,69,25,78,49,45,10,35,17,159,99,49]::numeric[]
) WITH ORDINALITY AS t(sku, name, cat, price, i)
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT max(id) FROM products));

INSERT INTO customers (id, email, full_name, country, tier, is_vip, created_at)
SELECT
  g,
  lower(f) || '.' || lower(replace(l, ' ', '')) || g || '@shop.io',
  f || ' ' || l,
  (ARRAY['US','US','US','DE','DE','FR','FR','UK','UK','ES','IT','NL','CA','JP','BR','AU','IN','MX','MA','PL'])[1 + floor(random() * 20)::int],
  tier,
  tier = 'platinum' OR (tier = 'gold' AND random() > 0.5),
  NOW() - random() * INTERVAL '365 days'
FROM (
  SELECT g,
    (ARRAY['Emma','Liam','Sophia','Noah','Olivia','Lucas','Amelia','Ethan','Mia','James','Charlotte','Alexander','Isabella','Benjamin','Ava','Daniel','Harper','Henri','Léa','Maximilian'])[1 + floor(random() * 20)::int] AS f,
    (ARRAY['Smith','Johnson','Müller','Dupont','García','Rossi','Silva','Tanaka','Patel','Wilson','Brown','Martin','Bernard','Schmidt','López','Ferrari','Santos','Andersen','Kowalski','El Amrani'])[1 + floor(random() * 20)::int] AS l,
    (ARRAY['bronze','bronze','bronze','bronze','silver','silver','silver','gold','gold','platinum'])[1 + floor(random() * 10)::int] AS tier
  FROM generate_series(1, {{CUSTOMERS}}) AS g
) s
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('customers', 'id'), greatest((SELECT max(id) FROM customers), 1));

INSERT INTO orders (id, customer_id, status, total_amount, payment_method, country, channel, created_at)
SELECT
  g,
  1 + floor(random() * {{CUSTOMERS}})::int,
  (ARRAY['completed','completed','completed','completed','completed','completed','shipped','shipped','pending','cancelled'])[1 + floor(random() * 10)::int],
  round((15 + random() * 1200)::numeric, 2),
  (ARRAY['credit_card','credit_card','paypal','apple_pay','bank_transfer'])[1 + floor(random() * 5)::int],
  (ARRAY['US','US','US','DE','DE','FR','FR','UK','UK','ES','IT','NL','CA','JP','BR','AU','IN','MX','MA','PL'])[1 + floor(random() * 20)::int],
  (ARRAY['web','web','web','mobile','mobile','marketplace','store'])[1 + floor(random() * 7)::int],
  NOW() - random() * ({{DAYS}} * INTERVAL '1 day')
FROM generate_series(1, {{ORDERS}}) AS g
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('orders', 'id'), greatest((SELECT max(id) FROM orders), 1));

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
SELECT id, order_id, product_id, qty, up, round(up * qty, 2)
FROM (
  SELECT
    g AS id,
    1 + ((g - 1) % {{ORDERS}}) AS order_id,
    1 + floor(random() * 23)::int AS product_id,
    1 + floor(random() * 3)::int AS qty,
    round((10 + random() * 900)::numeric, 2) AS up
  FROM generate_series(1, {{ORDERS}} * 2) AS g
) s
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('order_items', 'id'), greatest((SELECT max(id) FROM order_items), 1));

INSERT INTO payment_status_current (order_id, status, provider, failure_reason, updated_at)
SELECT
  o.id,
  st,
  (ARRAY['stripe','stripe','adyen','paypal','square'])[1 + floor(random() * 5)::int],
  CASE WHEN st = 'failed' THEN (ARRAY['insufficient_funds','card_declined','expired_card','fraud_suspected','network_error','3ds_failed'])[1 + floor(random() * 6)::int] ELSE '' END,
  o.created_at + INTERVAL '1 minute'
FROM (
  SELECT id, created_at, (ARRAY['success','success','success','success','success','success','success','success','pending','failed','failed','refunded'])[1 + floor(random() * 12)::int] AS st
  FROM orders WHERE id <= {{ORDERS}}
) o
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO vip_customer_flags (customer_id, reason, flagged_at)
SELECT id, 'High lifetime value', created_at FROM customers WHERE is_vip
ON CONFLICT (customer_id) DO NOTHING;

INSERT INTO sales_rep_accounts (rep_name, region, customer_id)
SELECT (ARRAY['Alice Schmidt','Bob Laurent','Carlos Mendez','Diana Petrov'])[1 + floor(random() * 4)::int], c.country, c.id
FROM customers c
WHERE c.tier IN ('gold', 'platinum') AND NOT EXISTS (SELECT 1 FROM sales_rep_accounts s WHERE s.customer_id = c.id);
