const OFFICE_NETWORK_MESSAGE =
  "회사 네트워크에 연결된 상태에서만 체크할 수 있습니다.";

type ParsedIp = {
  version: 4 | 6;
  value: bigint;
};

export function getOfficeNetworkMessage() {
  return OFFICE_NETWORK_MESSAGE;
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  const raw = forwardedFor?.split(",")[0] ?? vercelForwardedFor ?? realIp;

  if (!raw && process.env.NODE_ENV !== "production") {
    return "127.0.0.1";
  }

  return raw ? cleanIp(raw) : null;
}

export function isOfficeIp(ip: string | null) {
  if (!ip) {
    return false;
  }

  const allowed = (process.env.ALLOWED_OFFICE_IPS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowed.length === 0) {
    return false;
  }

  const parsedIp = parseIp(cleanIp(ip));
  if (!parsedIp) {
    return false;
  }

  return allowed.some((rule) => matchesRule(parsedIp, rule));
}

function cleanIp(raw: string) {
  let ip = raw.trim();

  if (ip.startsWith("[") && ip.includes("]")) {
    return ip.slice(1, ip.indexOf("]"));
  }

  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(":"));
  }

  return ip.toLowerCase();
}

function matchesRule(ip: ParsedIp, rule: string) {
  const [networkRaw, prefixRaw] = rule.split("/");
  const network = parseIp(cleanIp(networkRaw));
  if (!network || network.version !== ip.version) {
    return false;
  }

  if (!prefixRaw) {
    return network.value === ip.value;
  }

  const totalBits = ip.version === 4 ? 32 : 128;
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > totalBits) {
    return false;
  }

  if (prefix === 0) {
    return true;
  }

  const shift = BigInt(totalBits - prefix);
  return network.value >> shift === ip.value >> shift;
}

function parseIp(ip: string): ParsedIp | null {
  const mappedPrefix = "::ffff:";
  if (ip.startsWith(mappedPrefix) && ip.slice(mappedPrefix.length).includes(".")) {
    return parseIpv4(ip.slice(mappedPrefix.length));
  }

  if (ip.includes(".")) {
    return parseIpv4(ip);
  }

  if (ip.includes(":")) {
    return parseIpv6(ip);
  }

  return null;
}

function parseIpv4(ip: string): ParsedIp | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let value = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }

    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }

    value = (value << 8n) + BigInt(octet);
  }

  return { version: 4, value };
}

function parseIpv6(ip: string): ParsedIp | null {
  const zoneIndex = ip.indexOf("%");
  const withoutZone = zoneIndex >= 0 ? ip.slice(0, zoneIndex) : ip;
  const parts = withoutZone.split("::");

  if (parts.length > 2) {
    return null;
  }

  const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const right = parts[1] ? parts[1].split(":").filter(Boolean) : [];

  if (right.at(-1)?.includes(".")) {
    const embedded = parseIpv4(right[right.length - 1]);
    if (!embedded) {
      return null;
    }

    right.splice(
      right.length - 1,
      1,
      Number((embedded.value >> 16n) & 0xffffn).toString(16),
      Number(embedded.value & 0xffffn).toString(16),
    );
  }

  const missing = parts.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 0) {
    return null;
  }

  const groups =
    parts.length === 2
      ? [...left, ...Array<string>(missing).fill("0"), ...right]
      : left;

  if (groups.length !== 8) {
    return null;
  }

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) {
      return null;
    }

    value = (value << 16n) + BigInt(Number.parseInt(group, 16));
  }

  return { version: 6, value };
}
