#!/bin/bash
# Execute medallion DDL via the app's SQL API
set -e

API="http://localhost:4242/api/sql/execute"
SQL_FILE="scripts/seed-medallion.sql"

# Split by semicolon and execute each statement
i=0
while IFS= read -r stmt; do
  # Remove comments and trim
  stmt=$(echo "$stmt" | sed 's/--.*$//' | tr '\n' ' ' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
  
  # Skip empty statements
  [ ${#stmt} -lt 5 ] && continue
  
  i=$((i + 1))
  preview=$(echo "$stmt" | head -c 80)
  printf "[%02d] %s... " "$i" "$preview"
  
  result=$(curl -s "$API" -X POST -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$stmt" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),\"database\":\"clickhouse\"}")
  
  if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'error' not in d else 1)" 2>/dev/null; then
    echo "OK"
  else
    err=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','unknown')[:200])" 2>/dev/null || echo "$result")
    echo "ERROR: $err"
  fi
done < <(python3 -c "
import re
sql = open('$SQL_FILE').read()
# Remove comments
sql = re.sub(r'--[^\n]*', '', sql)
# Split by semicolon
for stmt in sql.split(';'):
    s = stmt.strip()
    if len(s) > 5:
        print(s)
        print(';;;DELIMITER;;;')
" | awk 'BEGIN{s=""} /^;;;DELIMITER;;;$/{if(s!="")print s; s=""} !/^;;;DELIMITER;;;$/{s=s" "$0}')

echo ""
echo "=== Medallion tables ==="
curl -s "$API" -X POST -H "Content-Type: application/json" \
  -d '{"query":"SELECT name, engine FROM system.tables WHERE database = '\''clickshop'\'' AND (name LIKE '\''silver_%'\'' OR name LIKE '\''gold_%'\'') ORDER BY name","database":"clickhouse"}' \
  | python3 -c "import sys,json; [print(f'  {r[\"name\"]:40s} {r[\"engine\"]}') for r in json.load(sys.stdin).get('rows',[])]"
