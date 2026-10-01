-- ClickShop transactional schema (source of the CDC mirror)
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
