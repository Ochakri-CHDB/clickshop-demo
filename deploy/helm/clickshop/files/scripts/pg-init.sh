#!/bin/sh
# Creates the transactional schema and history in Postgres (CDC source).
set -eu

until psql "$POSTGRES_URL" -c "SELECT 1" >/dev/null 2>&1; do echo "waiting for Postgres"; sleep 5; done

psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -q -f /sql/10-schema.sql
if [ "$(psql "$POSTGRES_URL" -tAc "SELECT count(*) FROM orders")" = "0" ]; then
  echo "loading Postgres history"
  sed -e "s/{{CUSTOMERS}}/$DATA_CUSTOMERS/g" -e "s/{{ORDERS}}/$DATA_ORDERS/g" -e "s/{{DAYS}}/$DATA_DAYS/g" /sql/20-data.sql \
    | psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -q
fi
psql "$POSTGRES_URL" -c "SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM order_items) AS items"
