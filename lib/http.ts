export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function badRequest(message: string): never {
  throw new ApiError(400, message);
}

export function unauthorized(message = "로그인이 필요합니다."): never {
  throw new ApiError(401, message);
}

export function forbidden(message = "접근 권한이 없습니다."): never {
  throw new ApiError(403, message);
}

export function conflict(message: string): never {
  throw new ApiError(409, message);
}

export async function withApi(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error(error);
    return Response.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
