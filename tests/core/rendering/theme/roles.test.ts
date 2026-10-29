import { expect, test } from "bun:test";
import { ROLES, OLD_ROLES } from "../../../../src/core/rendering/theme/roles.ts";
import { ROLES as publicRoles, OLD_ROLES as publicAliases } from "../../../../src/core/rendering/theme/theme.ts";

test("theme role vocabulary keeps shared public bindings and resolvable compatibility aliases", () => {
  expect(publicRoles).toBe(ROLES);
  expect(publicAliases).toBe(OLD_ROLES);
  expect(OLD_ROLES.sidebar_vault).toBe("sidebar_root");
  expect(Object.values(OLD_ROLES).every((role) => ROLES.includes(role))).toBe(true);
});
