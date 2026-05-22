import { DEFAULT_FORWARD_ACCOUNT_ID } from "./core/constants.js";
import { PlaywrightWeiboClient } from "./core/playwright-weibo-client.js";
import { storageStatePath } from "./paths.js";

/** @deprecated 使用 storageStatePath("default") */
export const STORAGE_STATE_PATH = storageStatePath(DEFAULT_FORWARD_ACCOUNT_ID);

export async function loginAndSaveState(
  forwardAccountId = DEFAULT_FORWARD_ACCOUNT_ID,
): Promise<void> {
  const client = new PlaywrightWeiboClient(forwardAccountId);
  await client.loginInteractive();
}
