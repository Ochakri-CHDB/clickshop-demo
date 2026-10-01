#!/bin/sh
# Creates the ClickShop schema and demo history on ClickHouse (OSS or Cloud).
set -eu

CH="clickhouse-client --host $CH_HOST --port $CH_PORT --user $CH_USER --password $CH_PASSWORD"
[ "$CH_SECURE" = "true" ] && CH="$CH --secure"

until $CH -q "SELECT 1" >/dev/null 2>&1; do echo "waiting for ClickHouse $CH_HOST"; sleep 5; done

render() {
  sed -e "s/{{DB}}/$CH_DB/g" -e "s/{{DAYS}}/$DATA_DAYS/g" \
      -e "s/{{PAGE_EVENTS}}/$DATA_PAGE_EVENTS/g" -e "s/{{FEEDBACK_ROWS}}/$DATA_FEEDBACK_ROWS/g" "$1"
}

if [ "${1:-schema}" = "schema" ]; then
  $CH -q "CREATE DATABASE IF NOT EXISTS $CH_DB"
  for d in ${CH_EXTRA_DBS:-}; do $CH -q "CREATE DATABASE IF NOT EXISTS $d"; done
  for f in 10-tables.sql 20-otel.sql 25-mvs-incremental.sql; do
    echo "applying $f"
    render /sql/$f | $CH --multiquery
  done
  echo "loading demo history (can take a few minutes)"
  render /sql/30-data.sql | $CH --multiquery --max_insert_threads 4
  $CH -q "SELECT table, sum(rows) FROM system.parts WHERE database = '$CH_DB' AND active GROUP BY table ORDER BY table FORMAT PrettyCompactMonoBlock"
  exit 0
fi

# "mvs": refreshable MVs read the CDC tables, so wait until they exist.
echo "waiting for CDC tables in $CH_DB (PeerDB or ClickPipes initial load)"
i=0
until [ "$($CH -q "SELECT count() FROM system.tables WHERE database = '$CH_DB' AND name IN ('public_customers','public_orders','public_order_items','public_payment_status_current','public_products')")" = "5" ]; do
  i=$((i + 1))
  if [ $((i % 12)) -eq 0 ]; then echo "still waiting for public_* tables ($((i * 5))s)"; fi
  sleep 5
done
render /sql/40-mvs.sql | $CH --multiquery
$CH -q "SYSTEM REFRESH VIEW $CH_DB.silver_customers_mv" || true
$CH -q "SYSTEM REFRESH VIEW $CH_DB.silver_products_mv" || true
$CH -q "SYSTEM REFRESH VIEW $CH_DB.silver_orders_mv" || true
$CH -q "SYSTEM REFRESH VIEW $CH_DB.silver_payments_mv" || true
echo "refreshable MVs created"
