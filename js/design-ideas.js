// Design Idea Generator: sends the student's problem to the server,
// which asks the AI for ideas, then shows them as cards.

(function () {
  var PROBLEM_MIN = 20;

  var form = document.getElementById("idea-form");
  var problemInput = document.getElementById("problem");
  var constraintsInput = document.getElementById("constraints");
  var countInput = document.getElementById("count");
  var problemCount = document.getElementById("problem-count");
  var generateButton = document.getElementById("generate");
  var statusBox = document.getElementById("status");
  var errorBox = document.getElementById("error");
  var results = document.getElementById("results");
  var ideaList = document.getElementById("idea-list");
  var againButton = document.getElementById("again");
  var copyButton = document.getElementById("copy");
  var downloadButton = document.getElementById("download");

  // The input and ideas from the last successful request,
  // used by "Generate again", "Copy all" and "Download".
  var lastRequest = null;
  var lastIdeas = [];
  var busy = false;

  function updateCount() {
    problemCount.textContent = problemInput.value.length + " / 1000";
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.hidden = true;
  }

  function setBusy(isBusy) {
    busy = isBusy;
    generateButton.disabled = isBusy;
    againButton.disabled = isBusy;
    generateButton.textContent = isBusy ? "Generating…" : "Generate ideas";
    statusBox.textContent = isBusy ? "Generating ideas… (this can take up to a minute)" : "";
  }

  // Builds an element with plain text only. AI text is never inserted
  // as HTML, so it can't change or break the page.
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function list(items) {
    var ul = el("ul");
    (items || []).forEach(function (item) {
      ul.appendChild(el("li", null, item));
    });
    return ul;
  }

  function renderIdeas(ideas) {
    ideaList.textContent = "";
    ideas.forEach(function (idea) {
      var card = el("li", "idea-card");
      card.appendChild(el("h3", null, idea.title));
      card.appendChild(el("p", null, idea.how_it_works));

      card.appendChild(el("h4", null, "Strengths"));
      card.appendChild(list(idea.strengths));
      card.appendChild(el("h4", null, "Weaknesses"));
      card.appendChild(list(idea.weaknesses));

      card.appendChild(el("h4", null, "Question to explore next"));
      card.appendChild(el("p", null, idea.next_question));
      ideaList.appendChild(card);
    });
    results.hidden = false;
  }

  function ideasAsText() {
    var lines = ["DESIGN IDEAS", "", "Problem statement:", lastRequest.problem, ""];
    if (lastRequest.constraints) {
      lines.push("Constraints:", lastRequest.constraints, "");
    }
    lastIdeas.forEach(function (idea, i) {
      lines.push((i + 1) + ". " + idea.title, "", idea.how_it_works, "", "Strengths:");
      (idea.strengths || []).forEach(function (s) { lines.push("  - " + s); });
      lines.push("", "Weaknesses:");
      (idea.weaknesses || []).forEach(function (w) { lines.push("  - " + w); });
      lines.push("", "Question to explore next:", idea.next_question, "", "");
    });
    lines.push("Ideas are AI-generated starting points — check and improve them.");
    return lines.join("\n");
  }

  function requestIdeas(request) {
    if (busy) return;
    clearError();
    setBusy(true);

    fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    })
      .then(function (response) {
        return response.json().then(
          function (data) { return { ok: response.ok, data: data }; },
          function () { return { ok: false, data: {} }; }
        );
      })
      .then(function (result) {
        if (!result.ok || !result.data.ideas) {
          showError(result.data.error || "Something went wrong. Please try again.");
          return;
        }
        lastRequest = request;
        lastIdeas = result.data.ideas;
        renderIdeas(lastIdeas);
        document.getElementById("results-heading").focus({ preventScroll: true });
        results.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function () {
        showError("Couldn't reach the server. Check your connection, or make sure the server is running (npm start).");
      })
      .then(function () {
        setBusy(false);
      });
  }

  problemInput.addEventListener("input", updateCount);
  updateCount();

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var problem = problemInput.value.trim();
    if (problem.length < PROBLEM_MIN) {
      showError("Please describe the problem in at least " + PROBLEM_MIN + " characters.");
      problemInput.focus();
      return;
    }
    requestIdeas({
      problem: problem,
      constraints: constraintsInput.value.trim(),
      count: Number(countInput.value),
    });
  });

  againButton.addEventListener("click", function () {
    if (lastRequest) requestIdeas(lastRequest);
  });

  copyButton.addEventListener("click", function () {
    var text = ideasAsText();
    function done(ok) {
      statusBox.textContent = ok ? "Ideas copied to the clipboard." : "Couldn't copy. Try Download instead.";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      done(false);
    }
  });

  downloadButton.addEventListener("click", function () {
    var blob = new Blob([ideasAsText()], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "design-ideas.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
})();
