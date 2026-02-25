import crypto from "crypto";

export function getPersonShortname(fullname: string) {
  const [surname, name, secondname] = fullname.split(" ");
  return `${surname} ${name[0]}.` + (secondname ? secondname[0] + "." : "");
}

export function formatBigInt(x: bigint | number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatSentence(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function md5(string: string) {
  const hash = crypto.createHash("md5");
  hash.update(string);
  return hash.digest("hex");
}
export type ReturnObj<T = void> =
  | ([T] extends [void]
      ? { ok: true; message?: string }
      : { ok: true; data: T; message?: string })
  | { ok: false; error: string; message?: string };
