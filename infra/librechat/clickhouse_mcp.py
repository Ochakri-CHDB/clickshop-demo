"""Lightweight ClickHouse MCP server for LibreChat — no chdb dependency."""

import os
import json
import clickhouse_connect
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("clickshop-clickhouse")

DEFAULT_DB = os.environ.get("CLICKHOUSE_DATABASE", "clickshop")

def get_client():
    return clickhouse_connect.get_client(
        host=os.environ.get("CLICKHOUSE_HOST", "localhost"),
        port=int(os.environ.get("CLICKHOUSE_PORT", "8443")),
        username=os.environ.get("CLICKHOUSE_USER", "default"),
        password=os.environ.get("CLICKHOUSE_PASSWORD", ""),
        database=DEFAULT_DB,
        secure=os.environ.get("CLICKHOUSE_SECURE", "true").lower() == "true",
        verify=os.environ.get("CLICKHOUSE_VERIFY", "true").lower() == "true",
        connect_timeout=int(os.environ.get("CLICKHOUSE_CONNECT_TIMEOUT", "30")),
        send_receive_timeout=int(os.environ.get("CLICKHOUSE_SEND_RECEIVE_TIMEOUT", "300")),
    )


@mcp.tool()
def list_databases() -> str:
    """List all available databases in the ClickHouse cluster."""
    client = get_client()
    result = client.query("SHOW DATABASES")
    databases = [row[0] for row in result.result_rows]
    return json.dumps(databases, indent=2)


@mcp.tool()
def list_tables(database: str = DEFAULT_DB) -> str:
    """List all tables in a given ClickHouse database.

    Args:
        database: The database name (defaults to the ClickShop database)
    """
    client = get_client()
    result = client.query(f"SHOW TABLES FROM {database}")
    tables = [row[0] for row in result.result_rows]
    return json.dumps(tables, indent=2)


@mcp.tool()
def describe_table(table: str, database: str = DEFAULT_DB) -> str:
    """Describe the schema (columns, types) of a ClickHouse table.

    Args:
        table: The table name
        database: The database name (defaults to the ClickShop database)
    """
    client = get_client()
    result = client.query(f"DESCRIBE TABLE {database}.{table}")
    columns = [
        {"name": row[0], "type": row[1], "default_type": row[2], "default_expression": row[3]}
        for row in result.result_rows
    ]
    return json.dumps(columns, indent=2)


@mcp.tool()
def run_query(query: str) -> str:
    """Execute a read-only SQL query on ClickHouse and return results as JSON.
    Only SELECT queries are allowed. Unqualified table names resolve to the ClickShop database.

    Args:
        query: The SQL SELECT query to execute
    """
    q = query.strip().upper()
    if not q.startswith("SELECT") and not q.startswith("WITH") and not q.startswith("SHOW") and not q.startswith("DESCRIBE"):
        return json.dumps({"error": "Only SELECT, WITH, SHOW, and DESCRIBE queries are allowed."})

    client = get_client()
    result = client.query(query, settings={"readonly": 2, "max_execution_time": 120})
    columns = result.column_names
    rows = []
    for row in result.result_rows[:1000]:
        rows.append({col: str(val) for col, val in zip(columns, row)})

    return json.dumps({
        "columns": columns,
        "row_count": len(rows),
        "total_rows": result.summary.get("read_rows", "unknown") if result.summary else "unknown",
        "rows": rows,
    }, indent=2, default=str)


if __name__ == "__main__":
    mcp.run(transport="stdio")
