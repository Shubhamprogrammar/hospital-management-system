import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usersService from "@/shared/services/users.service";
import { api } from "@/shared/services/api";

vi.mock("@/shared/services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  },
}));

const apiMock = vi.mocked(api);

describe("users.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listUsers calls GET /users with the pagination + filter params", () => {
    usersService.listUsers({ page: 2, limit: 20, search: "rahul", role: "DOCTOR" });

    expect(apiMock.list).toHaveBeenCalledWith("/users", { page: 2, limit: 20, search: "rahul", role: "DOCTOR" });
  });

  it("createUser POSTs to /users with the create payload", () => {
    usersService.createUser({ name: "Dr. Rao", email: "rao@hospital.com", password: "Secret@1", role: "DOCTOR", phone: "999" });

    expect(apiMock.post).toHaveBeenCalledWith("/users", {
      name: "Dr. Rao",
      email: "rao@hospital.com",
      password: "Secret@1",
      role: "DOCTOR",
      phone: "999",
    });
  });

  it("updateUser PATCHes /users/:id with a partial update", () => {
    usersService.updateUser("u1", { role: "NURSE", isActive: false });

    expect(apiMock.patch).toHaveBeenCalledWith("/users/u1", { role: "NURSE", isActive: false });
  });

  it("deactivateUser DELETEs /users/:id", () => {
    usersService.deactivateUser("u1");

    expect(apiMock.delete).toHaveBeenCalledWith("/users/u1");
  });

  it("getMe hits GET /users/me", () => {
    usersService.getMe();

    expect(apiMock.get).toHaveBeenCalledWith("/users/me");
  });

  it("listRoles hits GET /roles", () => {
    usersService.listRoles();

    expect(apiMock.list).toHaveBeenCalledWith("/roles");
  });

  it("listPermissions hits GET /roles/permissions", () => {
    usersService.listPermissions();

    expect(apiMock.get).toHaveBeenCalledWith("/roles/permissions");
  });
});
