"use client";

export type WorkspaceRole = "admin" | "manager" | "agent" | "viewer";

export function canManageDeals(role: WorkspaceRole): boolean {
  return role !== "viewer";
}

export function canManageTasks(role: WorkspaceRole): boolean {
  return role !== "viewer";
}
