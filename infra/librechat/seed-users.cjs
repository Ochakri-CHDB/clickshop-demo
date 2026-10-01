// Creates (or resets) the ClickShop persona accounts in LibreChat's MongoDB.
// Run as a Helm Job with the LibreChat image: node /app/seed-users.cjs
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const uri = process.env.MONGO_URI;
const password = process.env.DEMO_PASSWORD;
const domain = process.env.DEMO_EMAIL_DOMAIN || "clickshop.io";

const USERS = [
  { name: "Admin", username: "admin" },
  { name: "CEO", username: "ceo" },
  { name: "Sales Manager", username: "sales" },
  { name: "Data Analyst", username: "data" },
  { name: "SRE", username: "sre" },
  { name: "AI Engineer", username: "ai-engineer" },
];

async function main() {
  if (!uri || !password) throw new Error("MONGO_URI and DEMO_PASSWORD are required");
  let client;
  for (let attempt = 1; ; attempt++) {
    try {
      client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 5000 });
      break;
    } catch (e) {
      if (attempt >= 30) throw e;
      console.log(`[seed-users] waiting for MongoDB (${e.message})`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const col = client.db().collection("users");
  const hash = await bcrypt.hash(password, 10);
  for (const u of USERS) {
    const email =
      u.username === "admin" && process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.toLowerCase() : `${u.username}@${domain}`;
    const res = await col.updateOne(
      { email },
      {
        $set: { password: hash, theme: "dark", emailVerified: true, updatedAt: new Date() },
        $setOnInsert: {
          provider: "local",
          email,
          name: u.name,
          username: u.username,
          avatar: null,
          role: u.username === "admin" ? "ADMIN" : "USER",
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    console.log(`[seed-users] ${res.upsertedCount ? "created" : "updated"} ${email}`);
  }
  await client.close();
}

main().catch((e) => {
  console.error("[seed-users] failed:", e.message);
  process.exit(1);
});
