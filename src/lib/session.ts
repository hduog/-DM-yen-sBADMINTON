import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "clb_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 ngày

export type SessionPayload = {
  memberId: string;
  telegramId: number;
  fullName: string;
};

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET environment variable");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.memberId || !payload.telegramId) return null;
    return {
      memberId: payload.memberId as string,
      telegramId: payload.telegramId as number,
      fullName: payload.fullName as string,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
