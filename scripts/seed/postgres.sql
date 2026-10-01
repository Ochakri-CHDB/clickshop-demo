-- ClickShop Intelligence — PostgreSQL Seed Data
-- Source-of-truth tables for transactional data

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL,
    tier VARCHAR(50) NOT NULL DEFAULT 'Standard',
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    inventory_available INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_amount NUMERIC(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    country VARCHAR(100),
    channel VARCHAR(50) DEFAULT 'web',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id),
    product_id INT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    total_price NUMERIC(10,2) NOT NULL
);

-- Payment status (current state)
CREATE TABLE IF NOT EXISTS payment_status_current (
    order_id INT PRIMARY KEY REFERENCES orders(id),
    status VARCHAR(50) NOT NULL,
    provider VARCHAR(50),
    failure_reason VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sales rep accounts
CREATE TABLE IF NOT EXISTS sales_rep_accounts (
    id SERIAL PRIMARY KEY,
    rep_name VARCHAR(255) NOT NULL,
    region VARCHAR(100) NOT NULL,
    customer_id INT REFERENCES customers(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VIP customer flags
CREATE TABLE IF NOT EXISTS vip_customer_flags (
    customer_id INT PRIMARY KEY REFERENCES customers(id),
    reason VARCHAR(255),
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed customers
INSERT INTO customers (email, full_name, country, tier, is_vip) VALUES
('hans.mueller@acmecorp.de', 'Hans Mueller', 'Germany', 'VIP', TRUE),
('sophie.martin@techforward.fr', 'Sophie Martin', 'France', 'VIP', TRUE),
('erik.nordstrom@nordicsupplies.se', 'Erik Nordstrom', 'Sweden', 'VIP', TRUE),
('james.wilson@eurostyle.co.uk', 'James Wilson', 'United Kingdom', 'Enterprise', FALSE),
('maria.garcia@iberiasolutions.es', 'Maria Garcia', 'Spain', 'VIP', TRUE),
('peter.schneider@alpineliving.ch', 'Peter Schneider', 'Switzerland', 'Enterprise', FALSE),
('joao.silva@portodigital.pt', 'Joao Silva', 'Portugal', 'Growth', FALSE),
('jan.devries@beneluxtrading.nl', 'Jan de Vries', 'Netherlands', 'VIP', TRUE),
('anna.kowalski@varsaw.pl', 'Anna Kowalski', 'Poland', 'Standard', FALSE),
('luca.rossi@milanotech.it', 'Luca Rossi', 'Italy', 'Enterprise', FALSE),
('emma.johnson@londonretail.uk', 'Emma Johnson', 'United Kingdom', 'VIP', TRUE),
('thomas.dupont@parismedia.fr', 'Thomas Dupont', 'France', 'Growth', FALSE),
('katarina.berg@stockholmstyle.se', 'Katarina Berg', 'Sweden', 'Standard', FALSE),
('miguel.fernandez@madridco.es', 'Miguel Fernandez', 'Spain', 'Growth', FALSE),
('clara.hoffmann@berlinstartup.de', 'Clara Hoffmann', 'Germany', 'Enterprise', FALSE)
ON CONFLICT (email) DO NOTHING;

-- Seed products
INSERT INTO products (sku, name, category, price, inventory_available) VALUES
('ELEC-001', 'Wireless Noise-Cancel Headphones', 'Electronics', 149.99, 850),
('ELEC-014', 'Smart TV 55"', 'Electronics', 599.99, 120),
('ELEC-042', 'Smart Watch Series X', 'Electronics', 199.99, 340),
('ELEC-023', 'Bluetooth Speaker Pro', 'Electronics', 79.99, 620),
('HOME-023', 'Ergonomic Office Chair', 'Home & Living', 199.99, 280),
('HOME-045', 'Standing Desk Bamboo', 'Home & Living', 349.99, 95),
('HOME-012', 'LED Desk Lamp', 'Home & Living', 49.99, 1200),
('FASH-001', 'Premium Wool Coat', 'Fashion', 289.99, 180),
('FASH-019', 'Leather Weekend Bag', 'Fashion', 159.99, 240),
('SPRT-007', 'Running Shoes Pro', 'Sports & Outdoor', 69.99, 920),
('SPRT-019', 'Premium Yoga Mat', 'Sports & Outdoor', 49.99, 1100),
('SPRT-032', 'Cycling Jersey Elite', 'Sports & Outdoor', 89.99, 380),
('BEAU-011', 'Organic Skincare Set', 'Beauty & Health', 99.99, 450),
('BEAU-025', 'Essential Oil Diffuser', 'Beauty & Health', 39.99, 680),
('BOOK-005', 'Bestseller Novel Bundle', 'Books & Media', 19.99, 2200)
ON CONFLICT (sku) DO NOTHING;

-- Seed orders (recent 7 days)
INSERT INTO orders (customer_id, status, total_amount, payment_method, country, channel, created_at)
SELECT
    c.id,
    (ARRAY['completed', 'completed', 'completed', 'completed', 'failed', 'pending'])[floor(random()*6)+1],
    round((random() * 500 + 20)::numeric, 2),
    (ARRAY['credit_card', 'credit_card', 'paypal', 'bank_transfer', 'apple_pay'])[floor(random()*5)+1],
    c.country,
    (ARRAY['web', 'mobile', 'web', 'web'])[floor(random()*4)+1],
    NOW() - (random() * INTERVAL '7 days')
FROM customers c
CROSS JOIN generate_series(1, 8) AS s
ON CONFLICT DO NOTHING;

-- Seed payment statuses
INSERT INTO payment_status_current (order_id, status, provider, failure_reason, updated_at)
SELECT
    o.id,
    CASE WHEN o.status = 'failed' THEN 'failed' ELSE 'success' END,
    'stripe',
    CASE WHEN o.status = 'failed' THEN (ARRAY['gateway_timeout', 'card_declined', 'insufficient_funds', '3ds_failure'])[floor(random()*4)+1] ELSE NULL END,
    o.created_at + INTERVAL '1 minute'
FROM orders o
ON CONFLICT (order_id) DO NOTHING;

-- Seed VIP flags
INSERT INTO vip_customer_flags (customer_id, reason, flagged_at)
SELECT id, 'High lifetime value', created_at
FROM customers WHERE is_vip = TRUE
ON CONFLICT (customer_id) DO NOTHING;

-- Seed sales rep accounts
INSERT INTO sales_rep_accounts (rep_name, region, customer_id)
SELECT
    (ARRAY['Alice Schmidt', 'Bob Laurent', 'Carlos Mendez', 'Diana Petrov'])[floor(random()*4)+1],
    c.country,
    c.id
FROM customers c WHERE c.tier IN ('VIP', 'Enterprise')
ON CONFLICT DO NOTHING;
