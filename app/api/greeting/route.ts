import { requireAuth } from "@/lib/auth";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { withApi } from "@/lib/http";
import {
  createLocalGreeting,
  createLocalGreetings,
  type GreetingContext,
  type GreetingEvent,
  type GreetingWeather,
} from "@/lib/greeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

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

async function getOfficeWeather(): Promise<GreetingWeather | null> {
  const latitude = process.env.GREETING_WEATHER_LAT ?? "37.5452";
  const longitude = process.env.GREETING_WEATHER_LON ?? "127.0860";
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m",
  );
  url.searchParams.set("timezone", "Asia/Seoul");

  const response = await fetchWithTimeout(url.toString(), { cache: "no-store" }, 1800);
  if (!response.ok) return null;
  const data = (await response.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      precipitation?: number;
      rain?: number;
      snowfall?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
  };
  const current = data.current;
  if (!current) return null;

  return {
    label: getWeatherLabel(current.weather_code, current),
    temperature: current.temperature_2m ?? null,
    apparentTemperature: current.apparent_temperature ?? null,
    precipitation: current.precipitation ?? null,
    windSpeed: current.wind_speed_10m ?? null,
  };
}

function getWeatherLabel(
  code: number | undefined,
  current: {
    apparent_temperature?: number;
    precipitation?: number;
    rain?: number;
    snowfall?: number;
    wind_speed_10m?: number;
  },
) {
  const weatherCode = code ?? -1;
  if ((current.snowfall ?? 0) > 0 || [71, 73, 75, 77, 85, 86].includes(weatherCode)) return "snow";
  if (
    (current.rain ?? 0) > 0 ||
    (current.precipitation ?? 0) > 0 ||
    [
      51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
    ].includes(weatherCode)
  ) {
    return "rain";
  }
  if ([45, 48].includes(weatherCode)) return "fog";
  if ((current.wind_speed_10m ?? 0) >= 22) return "windy";
  if ((current.apparent_temperature ?? 0) >= 28) return "hot";
  if ((current.apparent_temperature ?? 99) <= 0) return "cold";
  if ([0, 1].includes(weatherCode)) return "clear";
  return "cloudy";
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
}
