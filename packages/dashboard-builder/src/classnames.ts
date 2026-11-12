export function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
