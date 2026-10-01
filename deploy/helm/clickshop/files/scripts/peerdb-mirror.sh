#!/bin/sh
# Creates the Postgres and ClickHouse peers and the CDC mirror in PeerDB
# through the peerdb-server SQL interface (Postgres wire protocol, port 9900).
set -eu

PEERDB="psql -h peerdb-server -p 9900 -U peerdb -v ON_ERROR_STOP=1"
export PGPASSWORD="$PEERDB_PASSWORD"

CATALOG="psql $PEERDB_CATALOG_URL -tA"
until $PEERDB -c "SELECT 1" >/dev/null 2>&1; do echo "waiting for peerdb-server"; sleep 5; done

peer_exists() { $CATALOG -c "SELECT name FROM peers" 2>/dev/null | grep -qx "$1"; }
peer_exists clickshop_pg || $PEERDB -c "CREATE PEER clickshop_pg FROM POSTGRES WITH (host = '$PG_HOST', port = $PG_PORT, user = '$PG_USER', password = '$PG_PASSWORD', database = '$PG_DB')"
peer_exists clickshop_ch || $PEERDB -c "CREATE PEER clickshop_ch FROM CLICKHOUSE WITH (host = '$CH_HOST', port = $CH_NATIVE_PORT, user = '$CH_USER', password = '$CH_PASSWORD', database = '$CH_DB', disable_tls = $CH_DISABLE_TLS)"

if $CATALOG -c "SELECT name FROM flows" 2>/dev/null | grep -qx clickshop_cdc; then
  echo "mirror already exists"
else
  $PEERDB -c "CREATE MIRROR clickshop_cdc FROM clickshop_pg TO clickshop_ch WITH TABLE MAPPING (
      public.customers:public_customers,
      public.products:public_products,
      public.orders:public_orders,
      public.order_items:public_order_items,
      public.payment_status_current:public_payment_status_current,
      public.sales_rep_accounts:public_sales_rep_accounts,
      public.vip_customer_flags:public_vip_customer_flags
    ) WITH (do_initial_copy = true, max_batch_size = 100000, sync_interval = 10)"
fi
echo "mirror clickshop_cdc ready"
