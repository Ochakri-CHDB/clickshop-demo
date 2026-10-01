const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "docs", "test-contracts");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const contracts = [
  {
    id: "SC-2026-0101",
    date: "January 15, 2026",
    buyer: { name: "Hans Mueller", email: "hans.mueller@siemens-digital.de", company: "Siemens Digital", country: "Germany", tier: "Enterprise", vip: true },
    items: [
      ["Industrial IoT Platform License", "Software", 1, 45000],
      ["24/7 Premium Support (12mo)", "Support", 1, 8500],
      ["On-site Deployment", "Services", 1, 12000],
    ],
    payment: { method: "Wire Transfer", status: "Paid", provider: "Deutsche Bank" },
    channel: "direct",
  },
  {
    id: "SC-2026-0102",
    date: "January 28, 2026",
    buyer: { name: "Sofia Rossi", email: "s.rossi@luxottica-group.it", company: "Luxottica Group", country: "Italy", tier: "Premium", vip: false },
    items: [
      ["Retail Analytics Suite", "Software", 1, 18500],
      ["Store Dashboard Module", "Software", 3, 2200],
      ["Staff Training (remote)", "Training", 2, 750],
    ],
    payment: { method: "Bank Transfer", status: "Paid", provider: "UniCredit" },
    channel: "partner",
  },
  {
    id: "SC-2026-0103",
    date: "February 5, 2026",
    buyer: { name: "Yuki Tanaka", email: "y.tanaka@rakuten-tech.jp", company: "Rakuten Technologies", country: "Japan", tier: "Enterprise", vip: true },
    items: [
      ["E-Commerce Intelligence Platform", "Software", 1, 62000],
      ["Real-time Fraud Detection Add-on", "Software", 1, 15000],
      ["API Integration Package", "Services", 1, 9800],
      ["Executive Training Workshop", "Training", 1, 3500],
    ],
    payment: { method: "Wire Transfer", status: "Paid", provider: "Mizuho Bank" },
    channel: "direct",
  },
  {
    id: "SC-2026-0104",
    date: "February 14, 2026",
    buyer: { name: "Emma Johnson", email: "emma.j@shopify-partners.ca", company: "Northern Commerce Inc.", country: "Canada", tier: "Standard", vip: false },
    items: [
      ["Starter Analytics Pack", "Software", 1, 4500],
      ["Basic Support (6mo)", "Support", 1, 1200],
    ],
    payment: { method: "Credit Card", status: "Paid", provider: "Stripe" },
    channel: "web",
  },
  {
    id: "SC-2026-0105",
    date: "February 22, 2026",
    buyer: { name: "Carlos Mendez", email: "c.mendez@mercadolibre-ops.ar", company: "MercadoLibre Operations", country: "Argentina", tier: "Premium", vip: false },
    items: [
      ["Marketplace Analytics Pro", "Software", 1, 22000],
      ["Seller Performance Module", "Software", 1, 7500],
      ["Data Migration (legacy system)", "Services", 1, 5000],
      ["Admin Training (on-site)", "Training", 4, 1100],
    ],
    payment: { method: "Wire Transfer", status: "Partial", provider: "Banco Macro" },
    channel: "direct",
  },
  {
    id: "SC-2026-0106",
    date: "March 1, 2026",
    buyer: { name: "Amira Benali", email: "a.benali@carrefour-mena.ae", company: "Carrefour MENA", country: "UAE", tier: "Enterprise", vip: true },
    items: [
      ["Supply Chain Intelligence Suite", "Software", 1, 38000],
      ["Inventory Optimization Module", "Software", 1, 14000],
      ["Multi-region Deployment", "Services", 3, 6000],
      ["Premium Support (24mo)", "Support", 1, 16000],
    ],
    payment: { method: "Wire Transfer", status: "Paid", provider: "Emirates NBD" },
    channel: "direct",
  },
  {
    id: "SC-2026-0107",
    date: "March 5, 2026",
    buyer: { name: "Liam O'Brien", email: "liam.obrien@primark-digital.ie", company: "Primark Digital", country: "Ireland", tier: "Standard", vip: false },
    items: [
      ["Customer Insights Dashboard", "Software", 1, 8900],
      ["POS Integration Connector", "Software", 1, 3200],
    ],
    payment: { method: "Credit Card", status: "Paid", provider: "PayPal" },
    channel: "web",
  },
  {
    id: "SC-2026-0108",
    date: "March 10, 2026",
    buyer: { name: "Chen Wei", email: "chen.wei@jd-logistics.cn", company: "JD Logistics International", country: "China", tier: "Enterprise", vip: true },
    items: [
      ["Logistics Intelligence Platform", "Software", 1, 85000],
      ["Route Optimization Engine", "Software", 1, 25000],
      ["Warehouse Analytics Module", "Software", 5, 4500],
      ["Dedicated Support Team (12mo)", "Support", 1, 30000],
      ["On-site Implementation", "Services", 2, 15000],
    ],
    payment: { method: "Wire Transfer", status: "Paid", provider: "Bank of China" },
    channel: "direct",
  },
  {
    id: "SC-2026-0109",
    date: "March 14, 2026",
    buyer: { name: "Ingrid Svensson", email: "i.svensson@hm-analytics.se", company: "H&M Analytics Division", country: "Sweden", tier: "Premium", vip: false },
    items: [
      ["Fashion Trend Predictor", "Software", 1, 19500],
      ["Seasonal Demand Forecasting", "Software", 1, 11000],
      ["API Access (12mo)", "Services", 1, 4800],
    ],
    payment: { method: "Bank Transfer", status: "Paid", provider: "Swedbank" },
    channel: "partner",
  },
  {
    id: "SC-2026-0110",
    date: "March 18, 2026",
    buyer: { name: "Priya Sharma", email: "p.sharma@flipkart-enterprise.in", company: "Flipkart Enterprise Solutions", country: "India", tier: "Enterprise", vip: true },
    items: [
      ["Full Commerce Intelligence Suite", "Software", 1, 42000],
      ["Payment Reconciliation Module", "Software", 1, 8500],
      ["Multi-language Support Pack", "Software", 1, 3000],
      ["Data Migration + ETL Setup", "Services", 1, 7500],
      ["Train-the-Trainer Program", "Training", 6, 900],
    ],
    payment: { method: "Wire Transfer", status: "Pending", provider: "HDFC Bank" },
    channel: "direct",
  },
];

contracts.forEach((c, idx) => {
  const doc = new PDFDocument({ margin: 50 });
  const filename = `contract-${String(idx + 1).padStart(2, "0")}.pdf`;
  doc.pipe(fs.createWriteStream(path.join(dir, filename)));

  const total = c.items.reduce((s, r) => s + r[2] * r[3], 0);

  doc.fontSize(18).font("Helvetica-Bold").text(`SALES CONTRACT — ${c.id}`, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").text(`Date: ${c.date}`, { align: "center" });
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);

  doc.fontSize(12).font("Helvetica-Bold").text("SELLER");
  doc.fontSize(10).font("Helvetica").text("ClickShop Intelligence SAS");
  doc.text("12 Rue de la Paix, 75002 Paris, France");
  doc.moveDown(0.6);

  doc.fontSize(12).font("Helvetica-Bold").text("BUYER");
  doc.fontSize(10).font("Helvetica");
  doc.text(`Full Name: ${c.buyer.name}`);
  doc.text(`Email: ${c.buyer.email}`);
  doc.text(`Company: ${c.buyer.company}`);
  doc.text(`Country: ${c.buyer.country}`);
  doc.text(`Customer Tier: ${c.buyer.tier}`);
  doc.text(`VIP Status: ${c.buyer.vip ? "Yes" : "No"}`);
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);

  doc.fontSize(12).font("Helvetica-Bold").text("ORDER DETAILS");
  doc.moveDown(0.4);

  const cols = [50, 280, 370, 420, 500];
  doc.fontSize(8).font("Helvetica-Bold");
  const hy = doc.y;
  ["Product", "Category", "Qty", "Unit Price (EUR)", "Total (EUR)"].forEach((h, i) => {
    doc.text(h, cols[i], hy, { lineBreak: false });
  });
  doc.moveDown(0.6);
  doc.font("Helvetica").fontSize(8);

  c.items.forEach((row) => {
    const y = doc.y;
    doc.text(String(row[0]), cols[0], y, { lineBreak: false, width: 220 });
    doc.text(String(row[1]), cols[1], y, { lineBreak: false });
    doc.text(String(row[2]), cols[2] + 8, y, { lineBreak: false });
    doc.text(Number(row[3]).toLocaleString("en-US", { minimumFractionDigits: 2 }), cols[3], y, { lineBreak: false });
    doc.text((row[2] * row[3]).toLocaleString("en-US", { minimumFractionDigits: 2 }), cols[4], y, { lineBreak: false });
    doc.moveDown(0.6);
  });

  doc.moveDown(0.3);
  doc.fontSize(12).font("Helvetica-Bold").text(
    `Order Total: ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })} EUR`,
    { align: "right" },
  );
  doc.moveDown(0.2);
  doc.fontSize(10).font("Helvetica");
  doc.text(`Status: Confirmed`);
  doc.text(`Sales Channel: ${c.channel}`);
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);

  doc.fontSize(12).font("Helvetica-Bold").text("PAYMENT TERMS");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica");
  doc.text(`Payment Method: ${c.payment.method}`);
  doc.text(`Payment Status: ${c.payment.status}`);
  doc.text(`Payment Provider: ${c.payment.provider}`);

  doc.end();
  console.log(`  ${filename} — ${c.buyer.name} (${c.buyer.country}) — ${total.toLocaleString()} EUR`);
});

console.log(`\n10 contracts generated in docs/test-contracts/`);
