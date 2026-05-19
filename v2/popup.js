document.getElementById("open").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "toggle-messenger" });
  window.close();
});
