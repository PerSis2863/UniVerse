import { describe, expect, it } from "vitest";
import { cleanSlug, cleanCustomDomain, cleanBrandColor, extractHostSlug, scopeWhere } from "./tenant";
import type { SessionUser } from "@/lib/server-auth";

describe("cleanSlug", () => {
  it("normalizes and accepts valid school slugs", () => {
    expect(cleanSlug("riverside")).toBe("riverside");
    expect(cleanSlug("Riverside-University")).toBe("riverside-university");
    expect(cleanSlug("mit-2026")).toBe("mit-2026");
  });

  it("rejects reserved system slugs", () => {
    expect(() => cleanSlug("admin")).toThrow(/reserved/);
    expect(() => cleanSlug("api")).toThrow(/reserved/);
    expect(() => cleanSlug("login")).toThrow(/reserved/);
  });

  it("rejects invalid lengths or characters", () => {
    expect(() => cleanSlug("ab")).toThrow(/between 3 and 32/);
    expect(() => cleanSlug("a".repeat(35))).toThrow(/between 3 and 32/);
    expect(() => cleanSlug("-school")).toThrow(/lowercase letters/);
    expect(() => cleanSlug("school-")).toThrow(/lowercase letters/);
    expect(() => cleanSlug("school_name")).toThrow(/lowercase letters/);
    expect(() => cleanSlug("")).toThrow(/required/);
  });
});

describe("cleanCustomDomain", () => {
  it("cleans and accepts valid custom domains", () => {
    expect(cleanCustomDomain("portal.riverside.edu")).toBe("portal.riverside.edu");
    expect(cleanCustomDomain("https://learn.oxford.ac.uk/path")).toBe("learn.oxford.ac.uk");
  });

  it("handles empty or null values", () => {
    expect(cleanCustomDomain(null)).toBeNull();
    expect(cleanCustomDomain("")).toBeNull();
  });

  it("rejects invalid domains", () => {
    expect(() => cleanCustomDomain("invalid domain with spaces")).toThrow(/valid domain/);
  });
});

describe("cleanBrandColor", () => {
  it("accepts valid hex colors", () => {
    expect(cleanBrandColor("#2a2927")).toBe("#2a2927");
    expect(cleanBrandColor("#E11D48")).toBe("#e11d48");
    expect(cleanBrandColor("#fff")).toBe("#fff");
  });

  it("handles null or empty values", () => {
    expect(cleanBrandColor(null)).toBeNull();
    expect(cleanBrandColor("")).toBeNull();
  });

  it("rejects invalid colors", () => {
    expect(() => cleanBrandColor("blue")).toThrow(/valid hex/);
    expect(() => cleanBrandColor("#12345")).toThrow(/valid hex/);
    expect(() => cleanBrandColor("#1234567")).toThrow(/valid hex/);
  });
});

describe("extractHostSlug", () => {
  it("extracts school slug from universeimpact.com subdomain", () => {
    expect(extractHostSlug("riverside.universeimpact.com")).toBe("riverside");
    expect(extractHostSlug("oxford-law.universeimpact.com:443")).toBe("oxford-law");
  });

  it("extracts school slug from localhost subdomain during local testing", () => {
    expect(extractHostSlug("stanford.localhost:3100")).toBe("stanford");
  });

  it("returns null for apex, www, or reserved addresses", () => {
    expect(extractHostSlug("universeimpact.com")).toBeNull();
    expect(extractHostSlug("www.universeimpact.com")).toBeNull();
    expect(extractHostSlug("localhost:3100")).toBeNull();
    expect(extractHostSlug("127.0.0.1:8787")).toBeNull();
    expect(extractHostSlug("admin.universeimpact.com")).toBeNull();
    expect(extractHostSlug("api.universeimpact.com")).toBeNull();
    expect(extractHostSlug(null)).toBeNull();
  });
});

describe("scopeWhere", () => {
  it("scopes queries to the user organizationId", () => {
    const user: SessionUser = { id: "u1", name: "Admin", email: "admin@riverside.edu", role: "ADMIN", organizationId: "org-123", owner: false };
    expect(scopeWhere(user)).toEqual({ organizationId: "org-123" });
  });

  it("exempts global platform owners from organization scoping", () => {
    const owner: SessionUser = { id: "u-owner", name: "Owner", email: "owner@riverside.edu", role: "ADMIN", organizationId: "org-123", owner: true };
    expect(scopeWhere(owner)).toEqual({});
  });

  it("returns empty scope for unscoped users", () => {
    const user: SessionUser = { id: "u2", name: "Student", email: "student@riverside.edu", role: "STUDENT", organizationId: null, owner: false };
    expect(scopeWhere(user)).toEqual({});
  });
});
