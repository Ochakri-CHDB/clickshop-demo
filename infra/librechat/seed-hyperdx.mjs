// Registers the HyperDX (ClickStack OSS) admin account so the demo user can
// log in with the demo credentials. HyperDX only allows the first
// registration; a 409/400 afterwards means the account already exists.
const api = (process.env.HYPERDX_API_URL || "").replace(/\/$/, "");
const email = process.env.HYPERDX_ADMIN_EMAIL;
const password = process.env.DEMO_PASSWORD;

if (!api || !email || !password) {
  console.log("[seed-hyperdx] HyperDX not configured, skipping");
  process.exit(0);
}

for (let i = 1; i <= 60; i++) {
  try {
    const res = await fetch(`${api}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) break;
  } catch {}
  console.log(`[seed-hyperdx] waiting for ${api} (${i})`);
  await new Promise((r) => setTimeout(r, 10000));
}

const res = await fetch(`${api}/register/password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, confirmPassword: password }),
});
const body = await res.text();
if (res.ok) console.log(`[seed-hyperdx] registered ${email}`);
else console.log(`[seed-hyperdx] register returned ${res.status}: ${body.slice(0, 200)}`);
