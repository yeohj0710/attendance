import { requireAuth } from "@/lib/auth";
import { withApi } from "@/lib/http";
import {
  createLocalGreeting,
  createLocalGreetings,
  type GreetingContext,
  type GreetingEvent,
} from "@/lib/greeting";
import { createAiGreetings } from "@/lib/greeting-ai";
import { getOfficeWeather } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);

    const body = (await request.json().catch(() => ({}))) as {
      event?: GreetingEvent;
      context?: GreetingContext;
    };
    const event = normalizeEvent(body.event);
    const weather = await getOfficeWeather().catch(() => null);
    const context: GreetingContext = {
      ...(body.context ?? {}),
      employeeName: auth.employee.name,
      nowIso: new Date().toISOString(),
      weather,
    };
    // 켜져 있으면 LLM 이 그날 상황에 맞춰 새로 쓴다. 꺼져 있거나 실패하면 정해진 문장 목록에서 고른다.
    const aiMessages = await createAiGreetings(context, event, 6);
    const messages = aiMessages ?? createLocalGreetings(context, event, 6);
    const message = aiMessages?.[0] ?? createLocalGreeting(context, event);

    return Response.json({
      message,
      messages,
      source: aiMessages ? "ai" : "local",
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
