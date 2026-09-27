import {
  isAdmin,
  normalizeEmail,
  type Identity,
} from "@/domains/Identity/model";

export function makeIdentity(
  input: { email: string; name?: string | null; provider: string },
  adminEmails: readonly string[],
): Identity | null {
  const email = normalizeEmail(input.email ?? "");
  if (!email) return null;
  return {
    email,
    name: input.name?.trim() || email,
    provider: input.provider,
    role: isAdmin(email, adminEmails) ? "admin" : "reviewer",
  };
}
