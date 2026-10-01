import { NextResponse } from "next/server";
import { trackActivity, type ActivityEvent } from "@/lib/user-activity";
import { getSessionEmail } from "@/lib/api-guard";

export async function POST(request: Request) {
  // Activity is always attributed to the signed-in user, never to a body field.
  const sessionEmail = await getSessionEmail();
  if (!sessionEmail) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<ActivityEvent>;
    body.user_email = sessionEmail;
    body.user_name = String(body.user_name ?? "").slice(0, 120);
    body.page_path = String(body.page_path ?? "").slice(0, 500);

    if (!body.event_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const valid: ActivityEvent["event_type"][] = ["login", "page_view", "persona_switch", "logout"];
    if (!valid.includes(body.event_type as ActivityEvent["event_type"])) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }

    await trackActivity({
      user_email: body.user_email,
      user_name: body.user_name ?? "",
      event_type: body.event_type as ActivityEvent["event_type"],
      page_path: body.page_path,
      persona: body.persona,
      user_agent: request.headers.get("user-agent") ?? "",
      session_id: body.session_id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
