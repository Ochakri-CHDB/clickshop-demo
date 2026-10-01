#!/usr/bin/env python3
"""Execute SQL statements from seed-medallion.sql via the app API."""
import json, re, urllib.request, sys

API = "http://localhost:4242/api/sql/execute"

sql = open("scripts/seed-medallion.sql").read()
sql = re.sub(r"--[^\n]*", "", sql)
stmts = [s.strip() for s in sql.split(";") if len(s.strip()) > 5]

print(f"Executing {len(stmts)} statements...\n")

for i, stmt in enumerate(stmts):
    preview = " ".join(stmt.split())[:75]
    sys.stdout.write(f"[{i+1:02d}/{len(stmts)}] {preview}... ")
    sys.stdout.flush()
    try:
        body = json.dumps({"query": stmt, "database": "clickhouse"}).encode()
        req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=120)
        data = json.loads(resp.read())
        if "error" in data:
            print(f"ERROR: {str(data['error'])[:180]}")
        else:
            print("OK")
    except Exception as e:
        print(f"FAIL: {str(e)[:180]}")

print("\n=== Medallion tables ===")
body = json.dumps({
    "query": "SELECT name, engine FROM system.tables WHERE database='clickshop' AND (name LIKE 'silver_%' OR name LIKE 'gold_%') ORDER BY name",
    "database": "clickhouse",
}).encode()
req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=30)
for r in json.loads(resp.read()).get("rows", []):
    print(f"  {r['name']:40s} {r['engine']}")
