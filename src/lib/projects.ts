/**
 * A project is a git remote, recorded as `<host>/<owner>/<repo>`. What people
 * call it is the owner and the repo; the host is how a tool finds it.
 * Anything that is not a host and a path is already a name, so it is left as
 * it is.
 */
export function projectName(project: string | null): string | null {
  if (!project) return null;
  const parts = project.split("/");
  if (parts.length === 3 && parts[0].includes(".")) {
    return `${parts[1]}/${parts[2]}`;
  }
  return project;
}
