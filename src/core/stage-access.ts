/** Native distribution verification is optional and never delays ordinary learning indefinitely. */
export async function resolveTestStageAccess(check?: () => Promise<unknown>, timeoutMs = 2000): Promise<boolean> {
  if (!check) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(check).then(value => value === true, () => false),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
