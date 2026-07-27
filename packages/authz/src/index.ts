import type { Role } from "@profit-pilot/contracts";

export const permissions = [
  "organization:manage",
  "workspace:manage",
  "members:manage",
  "connections:manage",
  "opportunities:read",
  "content:create",
  "content:edit",
  "content:approve",
  "content:publish",
  "analytics:read",
  "billing:manage",
  "audit:read",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(permissions),
  admin: new Set([
    "organization:manage",
    "workspace:manage",
    "members:manage",
    "connections:manage",
    "opportunities:read",
    "content:create",
    "content:edit",
    "content:approve",
    "content:publish",
    "analytics:read",
    "audit:read",
  ]),
  editor: new Set([
    "opportunities:read",
    "content:create",
    "content:edit",
    "content:approve",
    "content:publish",
    "analytics:read",
  ]),
  analyst: new Set(["opportunities:read", "analytics:read"]),
  client_approver: new Set(["opportunities:read", "content:approve", "analytics:read"]),
  viewer: new Set(["opportunities:read", "analytics:read"]),
};

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new AuthorizationError(role, permission);
  }
}

export class AuthorizationError extends Error {
  readonly code = "forbidden";

  constructor(
    readonly role: Role,
    readonly permission: Permission,
    detail?: string,
  ) {
    super(detail ?? `Role ${role} does not grant ${permission}`);
    this.name = "AuthorizationError";
  }
}
