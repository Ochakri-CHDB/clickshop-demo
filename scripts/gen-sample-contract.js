const PDFDocument = require("pdfkit");
const fs = require("fs");
const doc = new PDFDocument({ margin: 50 });
doc.pipe(fs.createWriteStream("docs/sample-contract.pdf"));

doc.fontSize(20).font("Helvetica-Bold").text("SALES CONTRACT — SC-2026-0042", { align: "center" });
doc.moveDown(0.5);
doc.fontSize(10).font("Helvetica").text("Date: March 18, 2026", { align: "center" });
doc.text("Contract Type: Enterprise Software License", { align: "center" });
doc.moveDown(1);
doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
doc.moveDown(0.5);

doc.fontSize(13).font("Helvetica-Bold").text("SELLER");
doc.fontSize(10).font("Helvetica").text("ClickShop Intelligence SAS");
doc.text("12 Rue de la Paix, 75002 Paris, France");
doc.text("VAT: FR 12 345 678 901");
doc.moveDown(0.8);

doc.fontSize(13).font("Helvetica-Bold").text("BUYER");
doc.fontSize(10).font("Helvetica");
doc.text("Full Name: Marie Dupont");
doc.text("Email: marie.dupont@acme-corp.eu");
doc.text("Company: ACME Corporation");
doc.text("Country: France");
doc.text("Customer Tier: Enterprise");
doc.text("VIP Status: Yes");
doc.moveDown(1);
doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
doc.moveDown(0.5);

doc.fontSize(13).font("Helvetica-Bold").text("ORDER DETAILS");
doc.moveDown(0.5);

const cols = [50, 250, 330, 380, 470];
doc.fontSize(9).font("Helvetica-Bold");
["Product", "Category", "Qty", "Unit Price (EUR)", "Total (EUR)"].forEach((h, i) => {
  doc.text(h, cols[i], doc.y - (i === 0 ? 0 : 11), { continued: false, lineBreak: false });
});
doc.moveDown(0.5);
doc.font("Helvetica").fontSize(9);

const items = [
  ["ClickShop Enterprise License", "Software", "1", "12,500.00", "12,500.00"],
  ["Premium Support Package (12mo)", "Support", "1", "3,200.00", "3,200.00"],
  ["Data Migration Service", "Services", "2", "1,800.00", "3,600.00"],
  ["Training Workshop (on-site)", "Training", "3", "950.00", "2,850.00"],
];
items.forEach((row) => {
  const y = doc.y;
  row.forEach((cell, i) => {
    doc.text(cell, cols[i], y, { lineBreak: false });
  });
  doc.moveDown(0.6);
});

doc.moveDown(0.5);
doc.fontSize(13).font("Helvetica-Bold").text("Order Total: 22,150.00 EUR", { align: "right" });
doc.moveDown(0.3);
doc.fontSize(10).font("Helvetica");
doc.text("Status: Confirmed");
doc.text("Sales Channel: Direct");
doc.text("Country: France");
doc.moveDown(1);
doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
doc.moveDown(0.5);

doc.fontSize(13).font("Helvetica-Bold").text("PAYMENT TERMS");
doc.moveDown(0.3);
doc.fontSize(10).font("Helvetica");
doc.text("Payment Method: Bank Transfer (Wire)");
doc.text("Payment Status: Paid");
doc.text("Payment Provider: BNP Paribas");
doc.text("Due Date: April 18, 2026");
doc.text("Payment Reference: PAY-2026-SC0042");

doc.end();
console.log("PDF created: docs/sample-contract.pdf");
