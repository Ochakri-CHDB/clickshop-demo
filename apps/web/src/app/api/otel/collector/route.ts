import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The collector runs as a Kubernetes workload and is always on; start/stop
// only drives the synthetic signal loop in the browser.
export async function GET() {
  return NextResponse.json({ status: "running", managedBy: "kubernetes" });
}

export async function POST() {
  return NextResponse.json({ status: "running", managedBy: "kubernetes" });
}
