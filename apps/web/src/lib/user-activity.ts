import { getClickHouseClient } from "@/lib/clickhouse";

let _tableCreated = false;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS user_activity (
  event_time DateTime DEFAULT now(),
  user_email String,
  user_name String,
  event_type Enum8('login' = 1, 'page_view' = 2, 'persona_switch' = 3, 'logout' = 4),
  page_path String DEFAULT '',
  persona String DEFAULT '',
  user_agent String DEFAULT '',
  session_id String DEFAULT ''
) ENGINE = MergeTree()
ORDER BY (event_time, user_email)
TTL event_time + INTERVAL 90 DAY
`;

export async function ensureActivityTable() {
  if (_tableCreated) return;
  try {
    const client = getClickHouseClient();
    await client.command({ query: CREATE_TABLE_SQL });
    _tableCreated = true;
  } catch (err) {
    console.error("[UserActivity] Failed to create table:", (err as Error).message);
  }
}

export interface ActivityEvent {
  user_email: string;
  user_name: string;
  event_type: "login" | "page_view" | "persona_switch" | "logout";
  page_path?: string;
  persona?: string;
  user_agent?: string;
  session_id?: string;
}

export async function trackActivity(event: ActivityEvent) {
  await ensureActivityTable();
  try {
    const client = getClickHouseClient();
    await client.insert({
      table: "user_activity",
      values: [
        {
          user_email: event.user_email,
          user_name: event.user_name,
          event_type: event.event_type,
          page_path: event.page_path ?? "",
          persona: event.persona ?? "",
          user_agent: event.user_agent ?? "",
          session_id: event.session_id ?? "",
        },
      ],
      format: "JSONEachRow",
    });
  } catch (err) {
    console.error("[UserActivity] Insert failed:", (err as Error).message);
  }
}
