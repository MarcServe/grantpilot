import type { Page } from "playwright";
import type { FormFieldInfo } from "./browser.js";

function mergeFieldKey(field: FormFieldInfo): string {
  return `${field.type}:${field.label}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export function mergeOfficeFormsFields(fields: FormFieldInfo[], officeFields: FormFieldInfo[]): FormFieldInfo[] {
  const seen = new Set(fields.map(mergeFieldKey));
  const merged = [...fields];
  for (const field of officeFields) {
    const key = mergeFieldKey(field);
    if (!seen.has(key)) {
      merged.push(field);
      seen.add(key);
    }
  }
  return merged;
}

export async function extractOfficeFormsFields(page: Page): Promise<FormFieldInfo[]> {
  if (!/forms\.office\.com|forms\.microsoft\.com/i.test(page.url())) return [];

  return page.evaluate(() => {
    function clean(text: string | null | undefined): string {
      return (text ?? "").replace(/\s+/g, " ").trim();
    }

    function selectorFor(el: Element): string {
      const html = el as HTMLElement;
      const role = html.getAttribute("role");
      const ariaLabel = html.getAttribute("aria-label");
      if (role && ariaLabel) return `[role="${CSS.escape(role)}"][aria-label="${CSS.escape(ariaLabel)}"]`;
      if (html.id) return `#${CSS.escape(html.id)}`;
      const tag = html.tagName.toLowerCase();
      const parent = html.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((child) => child.tagName === html.tagName);
      const index = Math.max(1, siblings.indexOf(html) + 1);
      return `${tag}:nth-of-type(${index})`;
    }

    function questionFor(el: Element): string {
      const candidates: string[] = [];
      let cur: Element | null = el;
      for (let depth = 0; cur && depth < 6; depth++) {
        const text = clean(cur.textContent);
        if (text && text.length <= 400) candidates.push(text);
        cur = cur.parentElement;
      }
      const withQuestion = candidates.find((text) => /\?/.test(text));
      const chosen = withQuestion ?? candidates[candidates.length - 1] ?? "";
      return clean(chosen.replace(/\b(Yes|No|Next|Back|Submit|Required)\b/gi, " ")).slice(0, 240) || "Office Forms question";
    }

    const fields: Array<FormFieldInfo> = [];
    const radios = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]'))
      .filter((el) => el.offsetParent != null);
    if (radios.length > 0) {
      const label = questionFor(radios[0]);
      fields.push({
        name: `office_radio_${fields.length + 1}`,
        id: null,
        selector: '[role="radio"]',
        type: "radio_group",
        label,
        placeholder: "",
        required: /required/i.test(document.body?.innerText ?? ""),
        options: radios.map((el) => ({
          label: clean(el.getAttribute("aria-label") || el.textContent) || "Option",
          value: clean(el.getAttribute("aria-label") || el.textContent) || "Option",
          selector: selectorFor(el),
          checked: el.getAttribute("aria-checked") === "true",
        })),
      });
    }

    const checkboxes = Array.from(document.querySelectorAll<HTMLElement>('[role="checkbox"]'))
      .filter((el) => el.offsetParent != null);
    if (checkboxes.length > 0) {
      const label = questionFor(checkboxes[0]);
      fields.push({
        name: `office_checkbox_${fields.length + 1}`,
        id: null,
        selector: '[role="checkbox"]',
        type: "checkbox_group",
        label,
        placeholder: "",
        required: /required/i.test(document.body?.innerText ?? ""),
        options: checkboxes.map((el) => ({
          label: clean(el.getAttribute("aria-label") || el.textContent) || "Option",
          value: clean(el.getAttribute("aria-label") || el.textContent) || "Option",
          selector: selectorFor(el),
          checked: el.getAttribute("aria-checked") === "true",
        })),
      });
    }

    Array.from(document.querySelectorAll<HTMLElement>('[role="textbox"], textarea, input[type="text"], input[type="email"], input[type="tel"], input[type="number"]'))
      .filter((el) => el.offsetParent != null)
      .forEach((el, index) => {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        fields.push({
          name: input.name || el.id || `office_text_${index + 1}`,
          id: el.id || null,
          selector: selectorFor(el),
          type: el.getAttribute("role") === "textbox" ? "text" : (input.type || el.tagName.toLowerCase()),
          label: clean(el.getAttribute("aria-label")) || questionFor(el),
          placeholder: clean(input.placeholder),
          required: el.getAttribute("aria-required") === "true" || input.required,
        });
      });

    return fields;
  });
}
