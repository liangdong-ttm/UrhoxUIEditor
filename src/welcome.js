(function () {
  "use strict";
  var screen = document.getElementById("welcomeScreen");
  var editor = document.querySelector(".editor");
  var openButton = document.getElementById("welcomeOpenProject");
  var exampleButton = document.getElementById("welcomeExample");
  if (!screen || !editor) return;
  var editorReady = false;
  var pendingAction = "";

  function revealEditor() {
    screen.classList.add("hidden");
    editor.classList.remove("hidden");
    var fit = function () {
      if (window.UrhoxView && window.UrhoxView.fit) window.UrhoxView.fit();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fit);
    else setTimeout(fit, 0);
  }
  function showEditor() {
    if (!editorReady) {
      pendingAction = "example";
      return false;
    }
    revealEditor();
    return true;
  }
  function showWelcome() {
    screen.classList.remove("hidden");
    editor.classList.add("hidden");
  }
  function markReady(options) {
    options = options || {};
    editorReady = true;
    if (openButton) openButton.disabled = false;
    if (exampleButton) exampleButton.disabled = options.exampleReady === false;
    var action = pendingAction;
    pendingAction = "";
    if (action === "open") {
      var trigger = document.getElementById("openProjectBtn");
      if (trigger) trigger.click();
    } else if (action === "example" && options.exampleReady !== false) {
      revealEditor();
    }
  }

  openButton.addEventListener("click", function () {
    if (!editorReady) {
      pendingAction = "open";
      return;
    }
    var trigger = document.getElementById("openProjectBtn");
    if (trigger) trigger.click();
  });
  exampleButton.addEventListener("click", showEditor);
  openButton.disabled = true;
  exampleButton.disabled = true;

  if (window.UrhoxConfig && window.UrhoxConfig.LOCAL_PREVIEW) showEditor();
  else showWelcome();
  window.UrhoxWelcome = {
    showEditor: showEditor,
    showWelcome: showWelcome,
    ready: markReady,
    isReady: function () { return editorReady; },
  };
})();
