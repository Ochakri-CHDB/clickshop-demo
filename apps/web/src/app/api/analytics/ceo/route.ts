import { NextRequest, NextResponse } from "next/server";
import { queryClickHouse } from "@/lib/clickhouse";
import { rangeToFilter, adaptiveTrendGroup, buildEqualityFilters } from "@/lib/range-filter";
import * as mock from "@/lib/mock-data";
import { withApiSpan } from "@/lib/api-telemetry";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const COUNTRY_MAP: Record<string, { code: string; name: string }> = {
  US: { code: "US", name: "United States" }, DE: { code: "DE", name: "Germany" },
  FR: { code: "FR", name: "France" }, UK: { code: "GB", name: "United Kingdom" },
  GB: { code: "GB", name: "United Kingdom" }, JP: { code: "JP", name: "Japan" },
  BR: { code: "BR", name: "Brazil" }, CA: { code: "CA", name: "Canada" },
  AU: { code: "AU", name: "Australia" }, IN: { code: "IN", name: "India" },
  MX: { code: "MX", name: "Mexico" }, MA: { code: "MA", name: "Morocco" },
  ES: { code: "ES", name: "Spain" },
  IT: { code: "IT", name: "Italy" }, NL: { code: "NL", name: "Netherlands" },
  PL: { code: "PL", name: "Poland" }, SE: { code: "SE", name: "Sweden" },
  BE: { code: "BE", name: "Belgium" }, AT: { code: "AT", name: "Austria" },
  CH: { code: "CH", name: "Switzerland" }, PT: { code: "PT", name: "Portugal" },
  IE: { code: "IE", name: "Ireland" }, DK: { code: "DK", name: "Denmark" },
  NO: { code: "NO", name: "Norway" }, FI: { code: "FI", name: "Finland" },
  CZ: { code: "CZ", name: "Czech Republic" }, RO: { code: "RO", name: "Romania" },
  GR: { code: "GR", name: "Greece" }, HU: { code: "HU", name: "Hungary" },
};

function buildExtraWhere(params: URLSearchParams, alias = ""): string {
  return buildEqualityFilters(params, { country: "country", category: "category" }, alias);
}

export async function GET(req: NextRequest) {
  return withApiSpan("/api/analytics/ceo", req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const t0 = Date.now();
  try {
    const range = req.nextUrl.searchParams.get("range") ?? "7d";
    const { kpiWhere, trendWhere } = rangeToFilter(range);
    const extra = buildExtraWhere(req.nextUrl.searchParams);

    const testResult = await queryClickHouse("SELECT 1 AS ok");
    if (!testResult.length) throw new Error("ClickHouse not available");

    const spanRows = await queryClickHouse<{ span_minutes: number }>(`
      SELECT dateDiff('minute', min(event_time), max(event_time)) AS span_minutes
      FROM order_events WHERE ${trendWhere}${extra}
    `);
    const spanMinutes = Number(spanRows[0]?.span_minutes ?? 0);
    const trendGroup = adaptiveTrendGroup(spanMinutes);

    const [
      kpiRows, prevKpiRows, revenueRows, conversionRows, regionRows,
      categoryRows, paymentRows, hourlyRows, customerRows, vipImpactedRows,
      heatmapRows, ordersPerDayRows, channelRows, allTimeOrdersRows,
    ] = await Promise.all([
      queryClickHouse(`SELECT sum(total_amount) AS totalRevenue, count() AS totalOrders, round(avg(total_amount), 2) AS avgOrderValue FROM order_events WHERE ${kpiWhere}${extra}`),
      queryClickHouse((() => {
        const e = extra;
        switch (range) {
          case "1h": return `SELECT sum(total_amount) AS totalRevenue, count() AS totalOrders FROM order_events WHERE event_time >= now() - INTERVAL 2 HOUR AND event_time < now() - INTERVAL 1 HOUR${e}`;
          case "6h": return `SELECT sum(total_amount) AS totalRevenue, count() AS totalOrders FROM order_events WHERE event_time >= now() - INTERVAL 12 HOUR AND event_time < now() - INTERVAL 6 HOUR${e}`;
          case "1d": return `SELECT sum(total_amount) AS totalRevenue, count() AS totalOrders FROM order_events WHERE event_time >= now() - INTERVAL 2 DAY AND event_time < now() - INTERVAL 1 DAY${e}`;
          case "7d": return `SELECT sum(total_amount) AS totalRevenue, count() AS totalOrders FROM order_events WHERE event_time >= now() - INTERVAL 14 DAY AND event_time < now() - INTERVAL 7 DAY${e}`;
          case "30d": return `SELECT sum(total_amount) AS totalRevenue, count() AS totalOrders FROM order_events WHERE event_time >= now() - INTERVAL 60 DAY AND event_time < now() - INTERVAL 30 DAY${e}`;
          default: return `SELECT sum(total_amount) AS totalRevenue, count() AS totalOrders FROM order_events WHERE event_time >= yesterday() AND event_time < today()${e}`;
        }
      })()),
      queryClickHouse(`SELECT ${trendGroup} AS date, sum(total_amount) AS revenue, count() AS orders FROM order_events WHERE ${trendWhere}${extra} GROUP BY date ORDER BY date`),
      queryClickHouse(`SELECT ${trendGroup} AS date, round(countIf(event_type = 'purchase') / greatest(countIf(event_type = 'page_view'), 1) * 100, 2) AS rate FROM checkout_events WHERE ${trendWhere} GROUP BY date ORDER BY date`),
      queryClickHouse(`SELECT o.country AS region, sum(o.total_amount) AS revenue, count() AS orders, uniq(o.customer_id) AS uniqueCustomers FROM order_events o WHERE ${kpiWhere.replace(/event_time/g, "o.event_time")}${extra.replace(/country/g, "o.country").replace(/category/g, "o.category")} GROUP BY o.country ORDER BY revenue DESC LIMIT 15`),
      queryClickHouse(`SELECT category, sum(total_amount) AS revenue, count() AS orders, round(sum(total_amount) / greatest((SELECT sum(total_amount) FROM order_events WHERE ${kpiWhere}${extra}), 1) * 100, 1) AS share FROM order_events WHERE ${kpiWhere}${extra} GROUP BY category ORDER BY revenue DESC`),
      queryClickHouse(`SELECT ${trendGroup} AS date, countIf(status = 'success') AS success, countIf(status = 'failed') AS failed FROM payment_events WHERE ${trendWhere} GROUP BY date ORDER BY date`),
      queryClickHouse(`SELECT toHour(event_time) AS hour, count() AS orders, round(sum(total_amount), 2) AS revenue FROM order_events WHERE event_time >= today()${extra} GROUP BY hour ORDER BY hour`),
      queryClickHouse(`SELECT count() AS activeCustomers FROM public_customers FINAL WHERE _peerdb_is_deleted = 0`),
      queryClickHouse(`SELECT count() AS cnt FROM public_vip_customer_flags AS v FINAL INNER JOIN public_orders AS o FINAL ON v.customer_id = o.customer_id AND o._peerdb_is_deleted = 0 INNER JOIN public_payment_status_current AS p FINAL ON o.id = p.order_id AND p._peerdb_is_deleted = 0 WHERE v._peerdb_is_deleted = 0 AND p.status != 'success'`),
      queryClickHouse(`SELECT toDayOfWeek(event_time) AS dow, toHour(event_time) AS hour, count() AS orders FROM order_events${extra ? ' WHERE 1=1'+extra : ''} GROUP BY dow, hour ORDER BY dow, hour`),
      queryClickHouse(`SELECT toDate(event_time) AS day, count() AS orders, round(sum(total_amount), 2) AS revenue FROM order_events WHERE event_time >= today() - INTERVAL 7 DAY${extra} GROUP BY day ORDER BY day`),
      queryClickHouse(`SELECT channel, count() AS orders, sum(total_amount) AS revenue FROM order_events WHERE ${kpiWhere}${extra} GROUP BY channel ORDER BY revenue DESC`),
      queryClickHouse(`SELECT count() AS totalOrders, sum(total_amount) AS totalRevenue FROM order_events${extra ? ' WHERE 1=1'+extra : ''}`),
    ]);

    const kpiRaw = kpiRows[0] as Record<string, unknown> | undefined;
    const prevRaw = prevKpiRows[0] as Record<string, unknown> | undefined;
    const failedToday = paymentRows.length ? Number((paymentRows[paymentRows.length - 1] as Record<string, unknown>).failed ?? 0) : 0;

    const todayRev = Number(kpiRaw?.totalRevenue ?? 0);
    const todayOrd = Number(kpiRaw?.totalOrders ?? 0);
    const prevRev = Number(prevRaw?.totalRevenue ?? 0);
    const prevOrd = Number(prevRaw?.totalOrders ?? 0);

    const kpi = {
      totalRevenue: todayRev,
      totalOrders: todayOrd,
      conversionRate: conversionRows.length ? Number((conversionRows[conversionRows.length - 1] as Record<string, unknown>).rate ?? 0) : 0,
      avgOrderValue: Number(kpiRaw?.avgOrderValue ?? 0),
      failedPayments: failedToday,
      activeCustomers: Number((customerRows[0] as Record<string, unknown>)?.activeCustomers ?? 0),
      vipCustomersImpacted: Number((vipImpactedRows[0] as Record<string, unknown>)?.cnt ?? 0),
      topCategory: categoryRows.length ? String((categoryRows[0] as Record<string, unknown>).category ?? "N/A") : "N/A",
    };

    const changes = {
      revenue: prevRev > 0 ? +((todayRev - prevRev) / prevRev * 100).toFixed(1) : 0,
      orders: prevOrd > 0 ? +((todayOrd - prevOrd) / prevOrd * 100).toFixed(1) : 0,
    };

    const hourly = hourlyRows.map((r: Record<string, unknown>) => ({
      hour: `${String(r.hour).padStart(2, "0")}:00`, orders: Number(r.orders), revenue: Number(r.revenue),
    }));

    const DAYS_MAP = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const heatmap = heatmapRows.map((r: Record<string, unknown>) => ({
      day: DAYS_MAP[Number(r.dow)] ?? "Mon", hour: Number(r.hour), value: Number(r.orders),
    }));

    const geoData = regionRows.map((r: Record<string, unknown>) => {
      const country = String(r.region);
      const mapped = COUNTRY_MAP[country];
      return { code: mapped?.code ?? country, name: mapped?.name ?? country, revenue: Number(r.revenue), orders: Number(r.orders) };
    });

    const categoryDonut = categoryRows.map((r: Record<string, unknown>) => ({ name: String(r.category), value: Number(r.revenue) }));
    const ordersPerDay = ordersPerDayRows.map((r: Record<string, unknown>) => ({ day: String(r.day), orders: Number(r.orders), revenue: Number(r.revenue) }));

    const allTimeRaw = allTimeOrdersRows[0] as Record<string, unknown> | undefined;
    const channels = channelRows.map((r: Record<string, unknown>) => ({ name: String(r.channel), value: Number(r.revenue) }));

    return NextResponse.json({
      kpi, changes,
      revenue: revenueRows.length ? revenueRows : mock.revenueTrend,
      conversion: conversionRows.length ? conversionRows : mock.conversionTrend,
      regions: regionRows.length ? regionRows : mock.topRegions,
      categories: categoryRows.length ? categoryRows : mock.topCategories,
      payments: paymentRows.length ? paymentRows : mock.paymentTrend,
      hourly, heatmap, geoData, categoryDonut, ordersPerDay,
      todayOrders: todayOrd,
      allTimeOrders: Number(allTimeRaw?.totalOrders ?? 0),
      allTimeRevenue: Number(allTimeRaw?.totalRevenue ?? 0),
      channels,
      queryTimeMs: Date.now() - t0,
    });
  } catch {
    return NextResponse.json({
      kpi: mock.kpiData, changes: { revenue: 0, orders: 0 },
      revenue: mock.revenueTrend, conversion: mock.conversionTrend,
      regions: mock.topRegions, categories: mock.topCategories,
      payments: mock.paymentTrend,
      hourly: [], heatmap: [], geoData: [], categoryDonut: [], ordersPerDay: [],
      todayOrders: 0, allTimeOrders: 0, allTimeRevenue: 0, channels: [],
      queryTimeMs: Date.now() - t0,
    });
  }
}
