// Context switching/naming lives in the explicit disclosure in Victoria.
async function openContextTools(page) {
  const details = page.locator(".chat-panel .chat-context-tools").first();
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
}
module.exports = { openContextTools };
