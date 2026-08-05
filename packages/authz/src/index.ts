import type { OrganizationRole, TenantContext, WorkspaceRole } from "@profit-pilot/contracts";

export const permissions = [
  "organization:manage",
  "workspace:manage",
  "members:manage",
  "connections:manage",
  "opportunities:read",
  "content:read",
  "content:create",
  "content:edit",
  "content:approve",
  "content:publish",
  "analytics:read",
  "billing:manage",
  "audit:read",
] as const;

export type Permission = (typeof permissions)[number];

type AuthorizationContext = Pick<TenantContext, "organizationRole" | "workspaceRole">;

const organizationRolePermissions: Readonly<Record<OrganizationRole, ReadonlySet<Permission>>> = {
  owner: new Set(permissions),
  organization_admin: new Set([
    "organization:manage",
    "workspace:manage",
    "members:manage",
    "connections:manage",
    "opportunities:read",
    "content:read",
    "content:create",
    "content:edit",
    "content:approve",
    "content:publish",
    "analytics:read",
    "audit:read",
  ]),
  billing_admin: new Set(["billing:manage"]),
  member: new Set(),
};

const workspaceRolePermissions: Readonly<Record<WorkspaceRole, ReadonlySet<Permission>>> = {
  workspace_admin: new Set([
    "workspace:manage",
    "members:manage",
    "connections:manage",
    "opportunities:read",
    "content:read",
    "content:create",
    "content:edit",
    "content:approve",
    "content:publish",
    "analytics:read",
    "audit:read",
  ]),
  strategist: new Set([
    "opportunities:read",
    "content:read",
    "content:create",
    "content:edit",
    "analytics:read",
  ]),
  editor: new Set([
    "opportunities:read",
    "content:read",
    "content:create",
    "content:edit",
    "content:approve",
    "content:publish",
    "analytics:read",
  ]),
  contributor: new Set(["opportunities:read", "content:read", "content:create", "content:edit"]),
  analyst: new Set(["opportunities:read", "content:read", "analytics:read"]),
  client_approver: new Set([
    "opportunities:read",
    "content:read",
    "content:approve",
    "analytics:read",
  ]),
  viewer: new Set(["opportunities:read", "content:read", "analytics:read"]),
};

export function can(context: AuthorizationContext, permission: Permission): boolean {
  return (
    organizationRolePermissions[context.organizationRole].has(permission) ||
    (context.workspaceRole
      ? workspaceRolePermissions[context.workspaceRole].has(permission)
      : false)
  );
}

export function assertCan(context: AuthorizationContext, permission: Permission): void {
  if (!can(context, permission)) {
    throw new AuthorizationError(context, permission);
  }
}

export class AuthorizationError extends Error {
  readonly code = "forbidden";

  constructor(
    readonly context: AuthorizationContext,
    readonly permission: Permission,
    detail?: string,
  ) {
    const roles = [context.organizationRole, context.workspaceRole].filter(Boolean).join(", ");
    super(detail ?? `Roles ${roles} do not grant ${permission}`);
    this.name = "AuthorizationError";
  }
}
