"use client";

/** Authentication crosses a trust boundary: use a fresh document to discard the previous account's client state. */
export function navigateFresh(path: "/" | "/login") {
  window.location.assign(new URL(path, window.location.origin).href);
}
