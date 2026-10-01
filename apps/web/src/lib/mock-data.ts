/* Realistic demo data used when live database connections are unavailable. */

export const kpiData = {
  totalRevenue: 1_284_320,
  totalOrders: 8_742,
  conversionRate: 3.42,
  avgOrderValue: 146.92,
  failedPayments: 312,
  activeCustomers: 5_218,
  vipCustomersImpacted: 23,
  topCategory: "Electronics",
};

export const revenueTrend = [
  { date: "Mar 12", revenue: 198_400, orders: 1320 },
  { date: "Mar 13", revenue: 205_100, orders: 1380 },
  { date: "Mar 14", revenue: 192_700, orders: 1290 },
  { date: "Mar 15", revenue: 211_500, orders: 1420 },
  { date: "Mar 16", revenue: 187_300, orders: 1250 },
  { date: "Mar 17", revenue: 172_800, orders: 1140 },
  { date: "Mar 18", revenue: 116_520, orders: 942 },
];

export const conversionTrend = [
  { date: "Mar 12", rate: 3.8 },
  { date: "Mar 13", rate: 3.9 },
  { date: "Mar 14", rate: 3.6 },
  { date: "Mar 15", rate: 4.0 },
  { date: "Mar 16", rate: 3.5 },
  { date: "Mar 17", rate: 3.2 },
  { date: "Mar 18", rate: 2.8 },
];

export const topRegions = [
  { region: "Germany", revenue: 312_400, orders: 2140, change: -2.1 },
  { region: "France", revenue: 245_800, orders: 1680, change: -5.3 },
  { region: "United Kingdom", revenue: 198_600, orders: 1340, change: 1.2 },
  { region: "Spain", revenue: 156_200, orders: 1020, change: -8.7 },
  { region: "Italy", revenue: 142_300, orders: 960, change: -3.4 },
  { region: "Netherlands", revenue: 98_700, orders: 680, change: 2.8 },
  { region: "Sweden", revenue: 72_400, orders: 510, change: -1.6 },
  { region: "Poland", revenue: 57_920, orders: 412, change: -4.2 },
];

export const topCategories = [
  { category: "Electronics", revenue: 412_300, orders: 2840, share: 32.1 },
  { category: "Home & Living", revenue: 278_600, orders: 1920, share: 21.7 },
  { category: "Fashion", revenue: 234_100, orders: 1640, share: 18.2 },
  { category: "Sports & Outdoor", revenue: 178_400, orders: 1180, share: 13.9 },
  { category: "Beauty & Health", revenue: 112_500, orders: 780, share: 8.8 },
  { category: "Books & Media", revenue: 68_420, orders: 382, share: 5.3 },
];

export const paymentTrend = [
  { date: "Mar 12", success: 1280, failed: 40 },
  { date: "Mar 13", success: 1340, failed: 40 },
  { date: "Mar 14", success: 1240, failed: 50 },
  { date: "Mar 15", success: 1370, failed: 50 },
  { date: "Mar 16", success: 1200, failed: 50 },
  { date: "Mar 17", success: 1080, failed: 60 },
  { date: "Mar 18", success: 870, failed: 72 },
];

export const topProducts = [
  { name: "Wireless Noise-Cancel Headphones", sku: "ELEC-001", revenue: 89_400, units: 596 },
  { name: 'Smart TV 55"', sku: "ELEC-014", revenue: 67_200, units: 112 },
  { name: "Ergonomic Office Chair", sku: "HOME-023", revenue: 54_800, units: 274 },
  { name: "Running Shoes Pro", sku: "SPRT-007", revenue: 42_100, units: 601 },
  { name: "Organic Skincare Set", sku: "BEAU-011", revenue: 38_600, units: 386 },
  { name: "Premium Yoga Mat", sku: "SPRT-019", revenue: 28_400, units: 568 },
  { name: "Bestseller Novel Bundle", sku: "BOOK-005", revenue: 18_200, units: 910 },
  { name: "Smart Watch Series X", sku: "ELEC-042", revenue: 76_300, units: 381 },
];

export const topCustomers = [
  { name: "Acme Corp GmbH", country: "Germany", tier: "VIP", totalSpent: 42_800, orders: 34 },
  { name: "TechForward SAS", country: "France", tier: "VIP", totalSpent: 38_200, orders: 28 },
  { name: "Nordic Supplies AB", country: "Sweden", tier: "VIP", totalSpent: 31_400, orders: 22 },
  { name: "EuroStyle Ltd", country: "UK", tier: "Enterprise", totalSpent: 28_700, orders: 19 },
  { name: "Iberia Solutions SL", country: "Spain", tier: "VIP", totalSpent: 24_100, orders: 16 },
  { name: "Alpine Living AG", country: "Switzerland", tier: "Enterprise", totalSpent: 21_600, orders: 14 },
  { name: "Porto Digital Lda", country: "Portugal", tier: "Growth", totalSpent: 18_300, orders: 12 },
  { name: "Benelux Trading BV", country: "Netherlands", tier: "VIP", totalSpent: 16_800, orders: 11 },
];

export const orderFailures = [
  { reason: "Payment gateway timeout", count: 124, impact: 18_200 },
  { reason: "Card declined", count: 89, impact: 12_400 },
  { reason: "Insufficient funds", count: 52, impact: 7_800 },
  { reason: "3D Secure failure", count: 31, impact: 4_600 },
  { reason: "Fraud check rejected", count: 16, impact: 2_100 },
];

export const cartDropoff = [
  { step: "Page View", count: 28_400 },
  { step: "Add to Cart", count: 8_520 },
  { step: "Begin Checkout", count: 4_260 },
  { step: "Payment Info", count: 3_195 },
  { step: "Order Placed", count: 942 },
];
