import type { KeyboardEvent } from "react";

export const vnd = (n: number | null | undefined) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0))) + "đ";

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/**
 * Enter = chuyển sang ô kế tiếp (các ô có thuộc tính data-nav) trong cùng container.
 * Gắn vào onKeyDown của <form> hoặc <div> bao quanh.
 */
export function enterNav(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = e.target as HTMLElement;
  if (t.tagName === "TEXTAREA" || t.tagName === "BUTTON") return;
  if (!t.hasAttribute("data-nav")) return;
  e.preventDefault();
  const all = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-nav]"));
  const next = all[all.indexOf(t) + 1];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }
}

/** Ctrl+Enter (hoặc Cmd+Enter trên Mac) = lưu */
export function isSaveCombo(e: { key: string; ctrlKey: boolean; metaKey: boolean }) {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}
