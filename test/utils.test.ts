/** @jest-environment jsdom */
import { describe, expect, it, beforeEach } from "@jest/globals";
import {
  normalize,
  hashText,
  toKeywordList,
  getElementPostId,
  countDomListItems,
  getPostText,
  getPermalinkPostIdFromPath,
  isPrimaryPermalinkPost,
} from "../src/content/utils";

// ── normalize ─────────────────────────────────────────────────────────────────

describe("normalize", () => {
  it("collapses multiple spaces into one", () => {
    expect(normalize("hello   world")).toBe("hello world");
  });

  it("collapses tabs and newlines into spaces", () => {
    expect(normalize("hello\t\nworld")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalize("  hello  ")).toBe("hello");
  });

  it("lowercases the input", () => {
    expect(normalize("Hello World")).toBe("hello world");
  });

  it("returns empty string for empty input", () => {
    expect(normalize("")).toBe("");
  });

  it("handles a mix of whitespace, case, and multi-space", () => {
    expect(normalize("  FOO   BAR\nbaz  ")).toBe("foo bar baz");
  });
});

// ── hashText ──────────────────────────────────────────────────────────────────

describe("hashText", () => {
  it("returns the same hash for the same input (deterministic)", () => {
    const input = "hello world this is a test";
    expect(hashText(input)).toBe(hashText(input));
  });

  it("returns different hashes for different inputs", () => {
    expect(hashText("hello")).not.toBe(hashText("world"));
    expect(hashText("abc")).not.toBe(hashText("abcd"));
  });

  it("does not throw for an empty string, returns a string", () => {
    const result = hashText("");
    expect(typeof result).toBe("string");
  });

  it("returns a non-empty string for a long input", () => {
    const long = "a".repeat(10_000);
    const result = hashText(long);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a base-36 string (only alphanumeric chars)", () => {
    const hash = hashText("test input for hash");
    expect(/^[0-9a-z]+$/.test(hash)).toBe(true);
  });
});

// ── toKeywordList ─────────────────────────────────────────────────────────────

describe("toKeywordList", () => {
  it("returns lowercased strings from a string array", () => {
    expect(toKeywordList(["Hello", "World"])).toEqual(["hello", "world"]);
  });

  it("returns empty array for null", () => {
    expect(toKeywordList(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(toKeywordList(undefined)).toEqual([]);
  });

  it("returns empty array for a plain string", () => {
    expect(toKeywordList("hello")).toEqual([]);
  });

  it("returns empty array for a number", () => {
    expect(toKeywordList(42)).toEqual([]);
  });

  it("returns empty array for an empty array", () => {
    expect(toKeywordList([])).toEqual([]);
  });

  it("converts non-string array items to strings, then lowercases", () => {
    expect(toKeywordList([1, true, "FOO"])).toEqual(["1", "true", "foo"]);
  });
});

// ── DOM utilities ─────────────────────────────────────────────────────────────

describe("getElementPostId", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns t3_xxx from data-post-id attribute", () => {
    const el = document.createElement("div");
    el.dataset.postId = "t3_abc123";
    expect(getElementPostId(el)).toBe("t3_abc123");
  });

  it("returns t3_xxx from id attribute when it starts with t3_", () => {
    const el = document.createElement("div");
    el.setAttribute("id", "t3_xyz789");
    expect(getElementPostId(el)).toBe("t3_xyz789");
  });

  it("returns null when id does not start with t3_", () => {
    const el = document.createElement("div");
    el.setAttribute("id", "some-other-id");
    expect(getElementPostId(el)).toBeNull();
  });

  it("returns null when element has no relevant attributes", () => {
    const el = document.createElement("div");
    expect(getElementPostId(el)).toBeNull();
  });

  it("normalises the id to lowercase", () => {
    const el = document.createElement("div");
    el.dataset.postId = "T3_ABC";
    expect(getElementPostId(el)).toBe("t3_abc");
  });
});

describe("countDomListItems", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("counts li elements inside a ul", () => {
    const el = document.createElement("div");
    el.innerHTML = "<ul><li>a</li><li>b</li></ul>";
    expect(countDomListItems(el)).toBe(2);
  });

  it("counts li elements inside an ol", () => {
    const el = document.createElement("div");
    el.innerHTML = "<ol><li>x</li></ol>";
    expect(countDomListItems(el)).toBe(1);
  });

  it("counts across nested lists", () => {
    const el = document.createElement("div");
    el.innerHTML = "<ul><li>a<ul><li>nested</li></ul></li><li>b</li></ul>";
    expect(countDomListItems(el)).toBe(3);
  });

  it("returns 0 for an element with no lists", () => {
    const el = document.createElement("div");
    el.textContent = "no lists here";
    expect(countDomListItems(el)).toBe(0);
  });
});

describe("getPostText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns text content from the element", () => {
    const el = document.createElement("div");
    el.textContent = "This is the post body content";
    const { raw } = getPostText(el);
    expect(raw).toContain("This is the post body content");
  });

  it("includes h1 title text in the raw output", () => {
    const el = document.createElement("div");
    el.innerHTML = "<h1>My Post Title</h1><p>Body text here.</p>";
    const { raw } = getPostText(el);
    expect(raw).toContain("My Post Title");
  });

  it("normalized output is lowercase", () => {
    const el = document.createElement("div");
    el.textContent = "UPPER CASE TEXT";
    const { normalized } = getPostText(el);
    expect(normalized).toBe("upper case text");
  });

  it("returns empty strings for an empty element", () => {
    const el = document.createElement("div");
    const { raw, normalized } = getPostText(el);
    expect(raw).toBe("");
    expect(normalized).toBe("");
  });
});

describe("getPermalinkPostIdFromPath", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("returns null when path has no /comments/ segment", () => {
    window.history.pushState({}, "", "/r/programming/");
    expect(getPermalinkPostIdFromPath()).toBeNull();
  });

  it("returns t3_id when path contains /comments/id/", () => {
    window.history.pushState({}, "", "/r/test/comments/abc123/some-title/");
    expect(getPermalinkPostIdFromPath()).toBe("t3_abc123");
  });

  it("normalises the extracted id to lowercase with t3_ prefix", () => {
    window.history.pushState({}, "", "/r/test/comments/ABC123/title/");
    expect(getPermalinkPostIdFromPath()).toBe("t3_abc123");
  });
});

describe("isPrimaryPermalinkPost", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("returns false when current path is not a Reddit comments URL", () => {
    const el = document.createElement("div");
    el.dataset.postId = "t3_abc123";
    expect(isPrimaryPermalinkPost(el)).toBe(false);
  });

  it("returns true when path matches the element's post id", () => {
    window.history.pushState({}, "", "/r/test/comments/abc123/some-title/");
    const el = document.createElement("div");
    el.dataset.postId = "t3_abc123";
    expect(isPrimaryPermalinkPost(el)).toBe(true);
  });

  it("returns false when path matches but element has a different post id", () => {
    window.history.pushState({}, "", "/r/test/comments/abc123/title/");
    const el = document.createElement("div");
    el.dataset.postId = "t3_xyz999";
    expect(isPrimaryPermalinkPost(el)).toBe(false);
  });
});
