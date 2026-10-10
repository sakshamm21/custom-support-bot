import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { env } from "./env";

const COOKIE = "sb_admin";

function sign(value: string) {
  return createHmac("sha256", env.adminPassword()).update(value).digest("hex");
}

export function makeSessionToken(): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  return `${exp}.${sign(String(exp))}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkPassword(pw: string): boolean {
  const a = Buffer.from(pw);
  const b = Buffer.from(env.adminPassword());
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
