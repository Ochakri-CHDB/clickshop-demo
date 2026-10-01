import { NextResponse } from "next/server";
import { queryClickHouse } from "@/lib/clickhouse";
import { ensureActivityTable } from "@/lib/user-activity";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  await ensureActivityTable();

  try {
    const [
      totalUsers,
      activeUsers7d,
      activeUsersToday,
      totalPageViews,
      recentLogins,
      topPages,
      topUsers,
      dailyActivity,
    ] = await Promise.all([
      queryClickHouse<{ cnt: number }>(
        `SELECT uniq(user_email) AS cnt FROM user_activity WHERE event_type = 'login'`
      ),
      queryClickHouse<{ cnt: number }>(
        `SELECT uniq(user_email) AS cnt FROM user_activity WHERE event_type IN ('login','page_view') AND event_time >= now() - INTERVAL 7 DAY`
      ),
      queryClickHouse<{ cnt: number }>(
        `SELECT uniq(user_email) AS cnt FROM user_activity WHERE event_type IN ('login','page_view') AND event_time >= today()`
      ),
      queryClickHouse<{ cnt: number }>(
        `SELECT count() AS cnt FROM user_activity WHERE event_type = 'page_view'`
      ),
      queryClickHouse<{ user_email: string; user_name: string; event_time: string; page_path: string }>(
        `SELECT user_email, user_name, toString(event_time) AS event_time, page_path
         FROM user_activity
         WHERE event_type = 'login'
         ORDER BY event_time DESC
         LIMIT 20`
      ),
      queryClickHouse<{ page_path: string; views: number }>(
        `SELECT page_path, count() AS views
         FROM user_activity
         WHERE event_type = 'page_view' AND page_path != ''
         GROUP BY page_path
         ORDER BY views DESC
         LIMIT 15`
      ),
      queryClickHouse<{ user_email: string; user_name: string; visits: number; last_seen: string }>(
        `SELECT user_email, any(user_name) AS user_name, count() AS visits, toString(max(event_time)) AS last_seen
         FROM user_activity
         GROUP BY user_email
         ORDER BY visits DESC
         LIMIT 20`
      ),
      queryClickHouse<{ day: string; logins: number; page_views: number }>(
        `SELECT toDate(event_time) AS day,
                countIf(event_type = 'login') AS logins,
                countIf(event_type = 'page_view') AS page_views
         FROM user_activity
         WHERE event_time >= now() - INTERVAL 30 DAY
         GROUP BY day
         ORDER BY day`
      ),
    ]);

    return NextResponse.json({
      kpis: {
        totalUsers: Number(totalUsers[0]?.cnt ?? 0),
        activeUsers7d: Number(activeUsers7d[0]?.cnt ?? 0),
        activeUsersToday: Number(activeUsersToday[0]?.cnt ?? 0),
        totalPageViews: Number(totalPageViews[0]?.cnt ?? 0),
      },
      recentLogins,
      topPages,
      topUsers,
      dailyActivity,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
