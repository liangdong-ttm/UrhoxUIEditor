(function () {
  "use strict";
  var screen = document.getElementById("welcomeScreen");
  var editor = document.querySelector(".editor");
  var openButton = document.getElementById("welcomeOpenProject");
  var exampleButton = document.getElementById("welcomeExample");
  if (!screen || !editor) return;

  function showEditor() {
    screen.classList.add("hidden");
    editor.classList.remove("hidden");
  }
  function showWelcome() {
    screen.classList.remove("hidden");
    editor.classList.add("hidden");
  }

  openButton.addEventListener("click", function () {
    var trigger = document.getElementById("openProjectBtn");
    if (trigger) trigger.click();
  });
  exampleButton.addEventListener("click", showEditor);

  if (window.UrhoxConfig && window.UrhoxConfig.LOCAL_PREVIEW) showEditor();
  else showWelcome();
  window.UrhoxWelcome = { showEditor: showEditor, showWelcome: showWelcome };
})();
