-- Demo history generated server-side. Each INSERT only runs on an empty
-- table, so re-running the init job is safe.
-- Placeholders: {{DB}}, {{DAYS}}, {{PAGE_EVENTS}}, {{FEEDBACK_ROWS}}

INSERT INTO {{DB}}.page_events (event_id, event_time, session_id, user_id, page_url, page_type, device, country, referrer)
SELECT
  generateUUIDv4(),
  now() - toIntervalSecond(rand(1) % ({{DAYS}} * 86400)),
  concat('s-', toString(rand(2) % 5000000)),
  1 + rand(3) % 20000,
  ['/', '/products', '/category/electronics', '/category/clothing', '/product/iphone-16', '/product/airpods-pro', '/cart', '/checkout', '/account', '/deals'][1 + rand(4) % 10],
  ['home', 'category', 'product', 'product', 'cart', 'checkout', 'home', 'category', 'product', 'confirmation'][1 + rand(5) % 10],
  ['mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'tablet'][1 + rand(6) % 6],
  ['US', 'US', 'US', 'DE', 'DE', 'FR', 'FR', 'UK', 'UK', 'ES', 'IT', 'NL', 'CA', 'JP', 'BR', 'AU', 'IN', 'MX', 'MA', 'PL'][1 + rand(7) % 20],
  ['google.com', 'google.com', 'direct', 'direct', 'facebook.com', 'email', 'instagram.com', 'tiktok.com'][1 + rand(8) % 8]
FROM numbers({{PAGE_EVENTS}})
WHERE (SELECT count() FROM {{DB}}.page_events) < 10000;

INSERT INTO {{DB}}.cart_events (event_id, event_time, session_id, user_id, product_sku, product_name, category, action, quantity, unit_price, country, device)
WITH
  ['SKU-1001','SKU-1002','SKU-1003','SKU-1004','SKU-1005','SKU-1006','SKU-2001','SKU-2002','SKU-2003','SKU-2004','SKU-3001','SKU-3002','SKU-3003','SKU-4001','SKU-4002','SKU-5001','SKU-5002','SKU-6001','SKU-6002','SKU-7001','SKU-7002','SKU-8001','SKU-8002'] AS skus,
  ['MacBook Pro 14','iPhone 16 Pro','AirPods Pro','Samsung Galaxy S25','Sony WH-1000XM5','Logitech MX Master','Nike Air Max 90','Levis 501 Jeans','North Face Jacket','Adidas Ultraboost','Dyson V15 Detect','Nespresso Vertuo','IKEA Kallax Shelf','La Roche-Posay SPF50','Estée Lauder Serum','Yoga Mat Premium','Protein Whey 2kg','Organic Granola Box','Nespresso Capsules x50','Atomic Habits','Kindle Paperwhite','LEGO Technic Set','Nintendo Switch Game'] AS names,
  ['Electronics','Electronics','Electronics','Electronics','Electronics','Electronics','Clothing','Clothing','Clothing','Clothing','Home','Home','Home','Beauty','Beauty','Sports','Sports','Food','Food','Books','Books','Toys','Toys'] AS cats,
  [1999, 1199, 219, 999, 348, 89, 135, 84, 235, 165, 649, 184, 69, 25, 78, 49, 45, 10, 35, 17, 159, 99, 49] AS prices,
  1 + rand(1) % 23 AS i
SELECT
  generateUUIDv4(),
  now() - toIntervalSecond(rand(2) % ({{DAYS}} * 86400)),
  concat('s-', toString(rand(3) % 5000000)),
  1 + rand(4) % 20000,
  skus[i], names[i], cats[i],
  ['add', 'add', 'add', 'add', 'remove', 'update_qty'][1 + rand(5) % 6],
  1 + rand(6) % 3,
  toDecimal64(prices[i] * (0.85 + (rand(7) % 30) / 100), 2),
  ['US', 'US', 'US', 'DE', 'DE', 'FR', 'FR', 'UK', 'UK', 'ES', 'IT', 'NL', 'CA', 'JP', 'BR', 'AU', 'IN', 'MX', 'MA', 'PL'][1 + rand(8) % 20],
  ['mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'tablet'][1 + rand(9) % 6]
FROM numbers(intDiv({{PAGE_EVENTS}}, 4))
WHERE (SELECT count() FROM {{DB}}.cart_events) < 10000;

INSERT INTO {{DB}}.checkout_events (event_id, event_time, session_id, user_id, event_type, cart_value, items_count, country, device, payment_method)
SELECT
  generateUUIDv4(),
  now() - toIntervalSecond(rand(1) % ({{DAYS}} * 86400)),
  concat('s-', toString(rand(2) % 5000000)),
  1 + rand(3) % 20000,
  ['page_view', 'page_view', 'page_view', 'begin_checkout', 'begin_checkout', 'add_payment', 'add_payment', 'purchase', 'purchase', 'abandon'][1 + rand(4) % 10],
  toDecimal64(20 + (rand(5) % 150000) / 100, 2),
  1 + rand(6) % 5,
  ['US', 'US', 'US', 'DE', 'DE', 'FR', 'FR', 'UK', 'UK', 'ES', 'IT', 'NL', 'CA', 'JP', 'BR', 'AU', 'IN', 'MX', 'MA', 'PL'][1 + rand(7) % 20],
  ['mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'tablet'][1 + rand(8) % 6],
  ['credit_card', 'credit_card', 'paypal', 'apple_pay', 'bank_transfer'][1 + rand(9) % 5]
FROM numbers(intDiv({{PAGE_EVENTS}}, 8))
WHERE (SELECT count() FROM {{DB}}.checkout_events) < 10000;

INSERT INTO {{DB}}.order_events (event_id, event_time, order_id, customer_id, product_sku, product_name, category, quantity, unit_price, total_amount, payment_method, status, country, channel, device)
WITH
  ['SKU-1001','SKU-1002','SKU-1003','SKU-1004','SKU-1005','SKU-1006','SKU-2001','SKU-2002','SKU-2003','SKU-2004','SKU-3001','SKU-3002','SKU-3003','SKU-4001','SKU-4002','SKU-5001','SKU-5002','SKU-6001','SKU-6002','SKU-7001','SKU-7002','SKU-8001','SKU-8002'] AS skus,
  ['MacBook Pro 14','iPhone 16 Pro','AirPods Pro','Samsung Galaxy S25','Sony WH-1000XM5','Logitech MX Master','Nike Air Max 90','Levis 501 Jeans','North Face Jacket','Adidas Ultraboost','Dyson V15 Detect','Nespresso Vertuo','IKEA Kallax Shelf','La Roche-Posay SPF50','Estée Lauder Serum','Yoga Mat Premium','Protein Whey 2kg','Organic Granola Box','Nespresso Capsules x50','Atomic Habits','Kindle Paperwhite','LEGO Technic Set','Nintendo Switch Game'] AS names,
  ['Electronics','Electronics','Electronics','Electronics','Electronics','Electronics','Clothing','Clothing','Clothing','Clothing','Home','Home','Home','Beauty','Beauty','Sports','Sports','Food','Food','Books','Books','Toys','Toys'] AS cats,
  [1999, 1199, 219, 999, 348, 89, 135, 84, 235, 165, 649, 184, 69, 25, 78, 49, 45, 10, 35, 17, 159, 99, 49] AS prices,
  1 + rand(1) % 23 AS i,
  1 + rand(2) % 3 AS qty,
  toDecimal64(prices[i] * (0.85 + (rand(3) % 30) / 100), 2) AS up
SELECT
  generateUUIDv4(),
  now() - toIntervalSecond(rand(4) % ({{DAYS}} * 86400)),
  1000000 + number,
  1 + rand(5) % 20000,
  skus[i], names[i], cats[i],
  qty, up, up * qty,
  ['credit_card', 'credit_card', 'paypal', 'apple_pay', 'bank_transfer'][1 + rand(6) % 5],
  ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'shipped', 'shipped', 'pending', 'cancelled'][1 + rand(7) % 10],
  ['US', 'US', 'US', 'DE', 'DE', 'FR', 'FR', 'UK', 'UK', 'ES', 'IT', 'NL', 'CA', 'JP', 'BR', 'AU', 'IN', 'MX', 'MA', 'PL'][1 + rand(8) % 20],
  ['web', 'web', 'web', 'mobile', 'mobile', 'marketplace', 'store'][1 + rand(9) % 7],
  ['mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'tablet'][1 + rand(10) % 6]
FROM numbers(intDiv({{PAGE_EVENTS}}, 20))
WHERE (SELECT count() FROM {{DB}}.order_events) < 10000;

INSERT INTO {{DB}}.payment_events (event_id, event_time, order_id, user_id, amount, currency, payment_method, provider, status, failure_reason, country)
WITH ['success', 'success', 'success', 'success', 'success', 'success', 'success', 'success', 'pending', 'failed', 'failed', 'refunded'][1 + rand(1) % 12] AS st
SELECT
  generateUUIDv4(),
  now() - toIntervalSecond(rand(2) % ({{DAYS}} * 86400)),
  1000000 + rand(3) % intDiv({{PAGE_EVENTS}}, 20),
  1 + rand(4) % 20000,
  toDecimal64(10 + (rand(5) % 200000) / 100, 2),
  'EUR',
  ['credit_card', 'credit_card', 'paypal', 'apple_pay', 'bank_transfer'][1 + rand(6) % 5],
  ['stripe', 'stripe', 'adyen', 'paypal', 'square'][1 + rand(7) % 5],
  st,
  if(st = 'failed', ['insufficient_funds', 'card_declined', 'expired_card', 'fraud_suspected', 'network_error', '3ds_failed'][1 + rand(8) % 6], ''),
  ['US', 'US', 'US', 'DE', 'DE', 'FR', 'FR', 'UK', 'UK', 'ES', 'IT', 'NL', 'CA', 'JP', 'BR', 'AU', 'IN', 'MX', 'MA', 'PL'][1 + rand(9) % 20]
FROM numbers(intDiv({{PAGE_EVENTS}}, 20))
WHERE (SELECT count() FROM {{DB}}.payment_events) < 10000;

INSERT INTO {{DB}}.inventory_events (event_id, event_time, product_sku, product_name, category, change_type, quantity_change, quantity_after, warehouse)
WITH
  ['SKU-1001','SKU-1002','SKU-1003','SKU-1004','SKU-1005','SKU-1006','SKU-2001','SKU-2002','SKU-2003','SKU-2004','SKU-3001','SKU-3002','SKU-3003','SKU-4001','SKU-4002','SKU-5001','SKU-5002','SKU-6001','SKU-6002','SKU-7001','SKU-7002','SKU-8001','SKU-8002'] AS skus,
  ['MacBook Pro 14','iPhone 16 Pro','AirPods Pro','Samsung Galaxy S25','Sony WH-1000XM5','Logitech MX Master','Nike Air Max 90','Levis 501 Jeans','North Face Jacket','Adidas Ultraboost','Dyson V15 Detect','Nespresso Vertuo','IKEA Kallax Shelf','La Roche-Posay SPF50','Estée Lauder Serum','Yoga Mat Premium','Protein Whey 2kg','Organic Granola Box','Nespresso Capsules x50','Atomic Habits','Kindle Paperwhite','LEGO Technic Set','Nintendo Switch Game'] AS names,
  ['Electronics','Electronics','Electronics','Electronics','Electronics','Electronics','Clothing','Clothing','Clothing','Clothing','Home','Home','Home','Beauty','Beauty','Sports','Sports','Food','Food','Books','Books','Toys','Toys'] AS cats,
  1 + rand(1) % 23 AS i,
  ['sale', 'sale', 'restock', 'return', 'adjustment'][1 + rand(2) % 5] AS ct
SELECT
  generateUUIDv4(),
  now() - toIntervalSecond(rand(3) % ({{DAYS}} * 86400)),
  skus[i], names[i], cats[i], ct,
  multiIf(ct = 'sale', -toInt32(1 + rand(4) % 3), ct = 'restock', toInt32(50 + rand(4) % 200), ct = 'return', 1, toInt32(rand(4) % 11) - 5),
  100 + rand(5) % 4900,
  ['EU-Central', 'EU-Central', 'US-East', 'US-West', 'APAC'][1 + rand(6) % 5]
FROM numbers(intDiv({{PAGE_EVENTS}}, 40))
WHERE (SELECT count() FROM {{DB}}.inventory_events) < 10000;

INSERT INTO {{DB}}.customer_feedback (feedback_id, customer_id, product_sku, product_name, category, rating, feedback_text_fts, feedback_text_bloom, feedback_text_plain, created_at)
WITH
  ['SKU-1001','SKU-1002','SKU-1003','SKU-1004','SKU-1005','SKU-1006','SKU-2001','SKU-2002','SKU-2003','SKU-2004','SKU-3001','SKU-3002','SKU-3003','SKU-4001','SKU-4002','SKU-5001','SKU-5002','SKU-6001','SKU-6002','SKU-7001','SKU-7002','SKU-8001','SKU-8002'] AS skus,
  ['MacBook Pro 14','iPhone 16 Pro','AirPods Pro','Samsung Galaxy S25','Sony WH-1000XM5','Logitech MX Master','Nike Air Max 90','Levis 501 Jeans','North Face Jacket','Adidas Ultraboost','Dyson V15 Detect','Nespresso Vertuo','IKEA Kallax Shelf','La Roche-Posay SPF50','Estée Lauder Serum','Yoga Mat Premium','Protein Whey 2kg','Organic Granola Box','Nespresso Capsules x50','Atomic Habits','Kindle Paperwhite','LEGO Technic Set','Nintendo Switch Game'] AS names,
  ['Electronics','Electronics','Electronics','Electronics','Electronics','Electronics','Clothing','Clothing','Clothing','Clothing','Home','Home','Home','Beauty','Beauty','Sports','Sports','Food','Food','Books','Books','Toys','Toys'] AS cats,
  1 + rand(1) % 23 AS i,
  1 + rand(2) % 5 AS r,
  concat(
    if(r >= 4,
      ['Excellent', 'Great', 'Really happy with the', 'Love my new', 'Fantastic'][1 + rand(3) % 5],
      ['Disappointed with the', 'Problem with my', 'Not satisfied with the', 'Returned the', 'Frustrated by the'][1 + rand(3) % 5]),
    ' ', names[i], '. ',
    if(r >= 4,
      ['Fast delivery and perfect packaging.', 'Battery life is impressive.', 'Quality exceeds the price.', 'Customer support was helpful.', 'Arrived earlier than expected.', 'Would recommend to friends.'][1 + rand(4) % 6],
      ['Delivery was late by a week.', 'The battery drains too fast.', 'Arrived broken, asked for a refund.', 'Payment failed twice at checkout.', 'Wrong size, exchange took too long.', 'Support never answered my email.', 'Package damaged during shipping.', 'Screen stopped working after a month.'][1 + rand(4) % 8]),
    ' ',
    ['Ordered via the mobile app.', 'Bought during the promo weekend.', 'Second purchase this year.', 'Gift for my family.', 'Used it daily since.', ''][1 + rand(5) % 6]
  ) AS txt
SELECT
  number + 1,
  1 + rand(6) % 20000,
  skus[i], names[i], cats[i], r,
  txt, txt, txt,
  now() - toIntervalSecond(rand(7) % (365 * 86400))
FROM numbers({{FEEDBACK_ROWS}})
WHERE (SELECT count() FROM {{DB}}.customer_feedback) < 10000;
