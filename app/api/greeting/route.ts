import { requireAuth } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { createLocalGreeting, type GreetingEvent } from "@/lib/greeting";
import { createMixedGreetings, type MixedGreetingContext } from "@/lib/greeting-mix";
import { getOfficeWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);

    const body = (await request.json().catch(() => ({}))) as {
      event?: GreetingEvent;
      context?: MixedGreetingContext;
    };
    const event = normalizeEvent(body.event);
    const weather = await getOfficeWeather().catch(() => null);
    const context: MixedGreetingContext = {
      ...(body.context ?? {}),
      employeeName: auth.employee.name,
      nowIso: new Date().toISOString(),
      weather,
    };
    // 그날 정보를 여러 말투 틀에 끼워 넣어 후보를 넉넉히 만든다. 화면이 최근에 본 문장을 빼고 고른다.
    const messages = createMixedGreetings(context, event, 12);
    const message = messages[0] ?? createLocalGreeting(context, event);

    return Response.json({
      message,
      messages,
      source: "mix",
      weather,
    });
  });
}

function normalizeEvent(value: unknown): GreetingEvent {
  return value === "checkIn" ||
    value === "checkOut" ||
    value === "cancelCheckOut" ||
    value === "visit"
    ? value
    : "visit";
}
