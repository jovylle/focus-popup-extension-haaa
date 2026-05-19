document.getElementById("open").addEventListener("click", () => {
  chrome.windows.create({
    url: "https://messenger.com",
    type: "popup",
    width: 420,
    height: 800,
  });
});
