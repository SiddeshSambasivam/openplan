/** Writes unsaved edits, then quits. A save that fails has already said why,
 * and must not keep the app from quitting. */
export async function saveThenQuit(save: () => Promise<void>, quit: () => Promise<void>) {
  try {
    await save();
  } finally {
    await quit();
  }
}
