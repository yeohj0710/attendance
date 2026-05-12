import { requireAuth } from "@/lib/auth";
import { withApi } from "@/lib/http";
import {
  createLocalGreeting,
  createLocalGreetings,
  type GreetingContext,
  type GreetingEvent,
} from "@/lib/greeting";
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
    const message = createLocalGreeting(context, event);
    const messages = createLocalGreetings(context, event, 6);

    return Response.json({
      message,
      messages,
      source: "local",
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
