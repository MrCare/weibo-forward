import { randomBytes, randomUUID } from "node:crypto";

export function generateId(): string {
  return randomUUID();
}

export function generateApiKey(): string {
  return `wf_${randomBytes(24).toString("hex")}`;
}
