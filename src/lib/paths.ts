/** Shows a home-relative path the way a shell prompt would: `/home/me/repo` → `~/repo`. */
export function shortHomePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path
    .replace(/^\/(home|Users)\/[^/]+(?=\/|$)/, '~')
    .replace(/^\/root(?=\/|$)/, '~');
}
