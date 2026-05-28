export function normaliseGrantSourceEndpoint(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS source URLs are supported.");
  }
  url.hash = "";
  return url.toString();
}

export function grantSourceEndpointKey(value: string): string {
  const url = new URL(normaliseGrantSourceEndpoint(value));
  const hostname = url.hostname.toLowerCase();
  const isDefaultPort = (url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80");
  const port = url.port && !isDefaultPort ? `:${url.port}` : "";
  const pathname = url.pathname.replace(/\/+$/, "");
  const search = url.search || "";
  return `${hostname}${port}${pathname}${search}`.toLowerCase();
}
