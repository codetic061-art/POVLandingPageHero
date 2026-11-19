export type ClassValue = string | number | boolean | null | undefined | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  const push = (val: ClassValue): void => {
    if (!val && val !== 0) return;
    if (Array.isArray(val)) {
      for (const item of val) push(item);
      return;
    }
    if (typeof val === "string" || typeof val === "number") {
      const trimmed = String(val).trim();
      if (trimmed) classes.push(trimmed);
    }
  };

  for (const input of inputs) push(input);
  return classes.join(" ");
}
