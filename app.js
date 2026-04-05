const LETTERS = ["A", "B", "C", "D", "E", "F"];
const TOKEN_KEY = "gabarito-token";
const USER_KEY = "gabarito-user";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: loadUser(),
  currentExamId: null,
  examTitle: "Prova Objetiva",
  subject: "Matematica",
  className: "Turma A",
  shift: "Manhã",
  questionCount: 10,
  choiceCount: 5,
  officialAnswers: [],
  studentAnswers: [],
  exams: [],
  submissions: [],
  stream: null,
  hasUnsavedSubmission: false
};

const els = {
  authScreen: document.getElementById("authScreen"),
  appScreen: document.getElementById("appScreen"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  registerName: document.getElementById("registerName"),
  registerEmail: document.getElementById("registerEmail"),
  registerPassword: document.getElementById("registerPassword"),
  authMessage: document.getElementById("authMessage"),
  welcomeText: document.getElementById("welcomeText"),
  refreshDataBtn: document.getElementById("refreshDataBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  examTitle: document.getElementById("examTitle"),
  subject: document.getElementById("subject"),
  className: document.getElementById("className"),
  shift: document.getElementById("shift"),
  questionCount: document.getElementById("questionCount"),
  choiceCount: document.getElementById("choiceCount"),
  buildAnswerKeyBtn: document.getElementById("buildAnswerKeyBtn"),
  saveExamBtn: document.getElementById("saveExamBtn"),
  newExamBtn: document.getElementById("newExamBtn"),
  printSheetBtn: document.getElementById("printSheetBtn"),
  appMessage: document.getElementById("appMessage"),
  answerKeyEditor: document.getElementById("answerKeyEditor"),
  statQuestions: document.getElementById("statQuestions"),
  statChoices: document.getElementById("statChoices"),
  statScore: document.getElementById("statScore"),
  examList: document.getElementById("examList"),
  sheetPreview: document.getElementById("sheetPreview"),
  studentName: document.getElementById("studentName"),
  studentClassName: document.getElementById("studentClassName"),
  studentShift: document.getElementById("studentShift"),
  studentSubject: document.getElementById("studentSubject"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  captureBtn: document.getElementById("captureBtn"),
  saveSubmissionBtn: document.getElementById("saveSubmissionBtn"),
  stopCameraBtn: document.getElementById("stopCameraBtn"),
  cameraFeed: document.getElementById("cameraFeed"),
  captureCanvas: document.getElementById("captureCanvas"),
  resultSummary: document.getElementById("resultSummary"),
  resultList: document.getElementById("resultList"),
  submissionList: document.getElementById("submissionList"),
  questionEditorTemplate: document.getElementById("questionEditorTemplate")
};

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function init() {
  createAnswerArray();
  bindEvents();
  syncInputsFromState();
  updateVisibleScreen();
  if (state.token) {
    bootstrapApp();
  }
}

function bindEvents() {
  els.showLoginBtn.addEventListener("click", () => setAuthMode("login"));
  els.showRegisterBtn.addEventListener("click", () => setAuthMode("register"));
  els.loginForm.addEventListener("submit", handleLogin);
  els.registerForm.addEventListener("submit", handleRegister);
  els.refreshDataBtn.addEventListener("click", bootstrapApp);
  els.logoutBtn.addEventListener("click", logout);

  els.examTitle.addEventListener("input", updateExamMetaFromInputs);
  els.subject.addEventListener("input", updateExamMetaFromInputs);
  els.className.addEventListener("input", updateExamMetaFromInputs);
  els.shift.addEventListener("change", updateExamMetaFromInputs);
  els.questionCount.addEventListener("change", rebuildStructure);
  els.choiceCount.addEventListener("change", rebuildStructure);
  els.buildAnswerKeyBtn.addEventListener("click", rebuildStructure);
  els.saveExamBtn.addEventListener("click", saveExam);
  els.newExamBtn.addEventListener("click", resetExamForm);
  els.printSheetBtn.addEventListener("click", () => window.print());

  els.startCameraBtn.addEventListener("click", startCamera);
  els.captureBtn.addEventListener("click", captureAndGrade);
  els.saveSubmissionBtn.addEventListener("click", saveSubmission);
  els.stopCameraBtn.addEventListener("click", stopCamera);
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  els.showLoginBtn.classList.toggle("active", isLogin);
  els.showRegisterBtn.classList.toggle("active", !isLogin);
  els.loginForm.classList.toggle("hidden", !isLogin);
  els.registerForm.classList.toggle("hidden", isLogin);
  setAuthMessage("");
}

function updateVisibleScreen() {
  const isAuthenticated = Boolean(state.token && state.user);
  els.authScreen.classList.toggle("hidden", isAuthenticated);
  els.appScreen.classList.toggle("hidden", !isAuthenticated);
  if (isAuthenticated) {
    els.welcomeText.textContent = `Professor(a): ${state.user.name} | ${state.user.email}`;
  }
}

function createAnswerArray() {
  state.officialAnswers = Array.from({ length: state.questionCount }, (_, index) => (
    state.officialAnswers[index] ?? 0
  ));
  state.studentAnswers = Array.from({ length: state.questionCount }, () => null);
}

function syncInputsFromState() {
  els.examTitle.value = state.examTitle;
  els.subject.value = state.subject;
  els.className.value = state.className;
  els.shift.value = state.shift;
  els.questionCount.value = String(state.questionCount);
  els.choiceCount.value = String(state.choiceCount);
  if (!els.studentClassName.value) {
    els.studentClassName.value = state.className;
  }
  if (!els.studentSubject.value) {
    els.studentSubject.value = state.subject;
  }
  els.studentShift.value = state.shift;
}

function updateExamMetaFromInputs() {
  state.examTitle = els.examTitle.value.trim() || "Prova Objetiva";
  state.subject = els.subject.value.trim() || "Matematica";
  state.className = els.className.value.trim() || "Turma A";
  state.shift = els.shift.value;

  if (!els.studentClassName.value.trim()) {
    els.studentClassName.value = state.className;
  }
  if (!els.studentSubject.value.trim()) {
    els.studentSubject.value = state.subject;
  }
  els.studentShift.value = state.shift;

  renderSheet();
}

function rebuildStructure() {
  state.questionCount = Math.min(50, Math.max(5, Number(els.questionCount.value) || 10));
  state.choiceCount = Math.min(5, Math.max(4, Number(els.choiceCount.value) || 5));
  state.officialAnswers = Array.from({ length: state.questionCount }, (_, index) => (
    state.officialAnswers[index] ?? 0
  ));
  state.studentAnswers = Array.from({ length: state.questionCount }, () => null);
  state.hasUnsavedSubmission = false;
  state.currentExamId = null;
  syncInputsFromState();
  render();
}

function render() {
  updateStats();
  renderAnswerEditor();
  renderSheet();
  renderResults();
  renderExamList();
  renderSubmissionList();
}

function updateStats() {
  const score = computeScore();
  els.statQuestions.textContent = String(state.questionCount);
  els.statChoices.textContent = String(state.choiceCount);
  els.statScore.textContent = String(score);
  els.saveSubmissionBtn.disabled = !state.currentExamId || !state.hasUnsavedSubmission;
}

function renderAnswerEditor() {
  els.answerKeyEditor.innerHTML = "";
  for (let questionIndex = 0; questionIndex < state.questionCount; questionIndex += 1) {
    const fragment = els.questionEditorTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".question-editor-card");
    const questionLabel = fragment.querySelector(".question-label");
    const questionStatus = fragment.querySelector(".question-status");
    const choicesRow = fragment.querySelector(".choices-row");

    questionLabel.textContent = `Questao ${questionIndex + 1}`;
    questionStatus.textContent = `Resposta oficial: ${LETTERS[state.officialAnswers[questionIndex]]}`;

    for (let choiceIndex = 0; choiceIndex < state.choiceCount; choiceIndex += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-chip";
      if (state.officialAnswers[questionIndex] === choiceIndex) {
        button.classList.add("selected");
      }
      button.textContent = LETTERS[choiceIndex];
      button.addEventListener("click", () => {
        state.officialAnswers[questionIndex] = choiceIndex;
        render();
      });
      choicesRow.appendChild(button);
    }

    els.answerKeyEditor.appendChild(card);
  }
}

function renderSheet() {
  const now = new Date();
  const paper = document.createElement("div");
  paper.className = "sheet-paper";
  paper.innerHTML = `
    <div class="alignment-markers">
      <span class="marker"></span>
      <span class="marker"></span>
      <span class="marker"></span>
      <span class="marker"></span>
    </div>
    <div class="paper-header">
      <div>
        <h3>${escapeHtml(state.examTitle)}</h3>
        <p class="paper-meta">Disciplina: ${escapeHtml(state.subject)}</p>
        <p class="paper-meta">Turma: ${escapeHtml(state.className)} | Turno: ${escapeHtml(state.shift)}</p>
        <p class="paper-meta">Aluno: ________________________________________</p>
      </div>
      <div>
        <p class="paper-meta">Questoes: ${state.questionCount}</p>
        <p class="paper-meta">Data: ${now.toLocaleDateString("pt-BR")}</p>
      </div>
    </div>
    <div class="paper-grid"></div>
  `;

  const grid = paper.querySelector(".paper-grid");
  for (let questionIndex = 0; questionIndex < state.questionCount; questionIndex += 1) {
    const row = document.createElement("div");
    row.className = "paper-row";

    const questionTag = document.createElement("strong");
    questionTag.textContent = `${questionIndex + 1}.`;

    const bubbleRow = document.createElement("div");
    bubbleRow.className = "bubble-row";

    for (let choiceIndex = 0; choiceIndex < state.choiceCount; choiceIndex += 1) {
      const bubble = document.createElement("span");
      bubble.className = "bubble";
      if (state.officialAnswers[questionIndex] === choiceIndex) {
        bubble.classList.add("correct");
      }
      if (state.studentAnswers[questionIndex] === choiceIndex) {
        bubble.classList.add("answer");
      }
      bubble.textContent = LETTERS[choiceIndex];
      bubbleRow.appendChild(bubble);
    }

    const legend = document.createElement("span");
    legend.className = "paper-meta";
    legend.textContent = `Oficial: ${LETTERS[state.officialAnswers[questionIndex]]}`;

    row.append(questionTag, bubbleRow, legend);
    grid.appendChild(row);
  }

  els.sheetPreview.innerHTML = "";
  els.sheetPreview.appendChild(paper);
}

function renderResults() {
  els.resultList.innerHTML = "";
  const score = computeScore();

  for (let index = 0; index < state.questionCount; index += 1) {
    const official = state.officialAnswers[index];
    const student = state.studentAnswers[index];
    const isCorrect = student !== null && student === official;

    const row = document.createElement("div");
    row.className = `result-item ${isCorrect ? "correct" : "incorrect"}`;
    row.innerHTML = `
      <strong>Q${index + 1}</strong>
      <span>Oficial: ${LETTERS[official]}</span>
      <span>Aluno: ${student === null ? "Nao lida" : LETTERS[student]}</span>
      <span class="pill ${isCorrect ? "success" : "danger"}">${isCorrect ? "Correta" : "Revisar"}</span>
    `;
    els.resultList.appendChild(row);
  }

  els.resultSummary.textContent = `Resultado atual: ${score}/${state.questionCount} acertos.`;
}

function renderExamList() {
  els.examList.innerHTML = "";
  if (!state.exams.length) {
    els.examList.innerHTML = '<p class="empty-state">Nenhum gabarito salvo ainda.</p>';
    return;
  }

  state.exams.forEach((exam) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `record-card ${state.currentExamId === exam.id ? "selected" : ""}`;
    item.innerHTML = `
      <strong>${escapeHtml(exam.title)}</strong>
      <span>${escapeHtml(exam.subject)}</span>
      <span>${escapeHtml(exam.className)} | ${escapeHtml(exam.shift)}</span>
      <span>${exam.questionCount} questoes</span>
    `;
    item.addEventListener("click", () => loadExamIntoForm(exam.id));
    els.examList.appendChild(item);
  });
}

function renderSubmissionList() {
  els.submissionList.innerHTML = "";
  if (!state.submissions.length) {
    els.submissionList.innerHTML = '<p class="empty-state">Nenhuma correcao salva ainda.</p>';
    return;
  }

  state.submissions.forEach((submission) => {
    const item = document.createElement("article");
    item.className = "record-card static";
    item.innerHTML = `
      <strong>${escapeHtml(submission.studentName)}</strong>
      <span>Nota: ${submission.score}/${submission.totalQuestions}</span>
      <span>${escapeHtml(submission.className)} | ${escapeHtml(submission.shift)}</span>
      <span>${escapeHtml(submission.subject)}</span>
      <span>${new Date(submission.createdAt).toLocaleString("pt-BR")}</span>
    `;
    els.submissionList.appendChild(item);
  });
}

async function bootstrapApp() {
  try {
    const me = await api("/api/me");
    state.user = me.user;
    localStorage.setItem(USER_KEY, JSON.stringify(state.user));
    updateVisibleScreen();
    await refreshRemoteData();
    render();
  } catch (error) {
    logout();
    setAuthMessage(error.message || "Sua sessao expirou.");
  }
}

async function refreshRemoteData() {
  const [examData, submissionData] = await Promise.all([
    api("/api/exams"),
    api("/api/submissions")
  ]);
  state.exams = examData.exams;
  state.submissions = submissionData.submissions;
}

async function handleLogin(event) {
  event.preventDefault();
  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: {
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value
      },
      auth: false
    });
    finishAuth(payload);
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  try {
    const payload = await api("/api/auth/register", {
      method: "POST",
      body: {
        name: els.registerName.value.trim(),
        email: els.registerEmail.value.trim(),
        password: els.registerPassword.value
      },
      auth: false
    });
    finishAuth(payload);
  } catch (error) {
    setAuthMessage(error.message);
  }
}

function finishAuth(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem(TOKEN_KEY, state.token);
  localStorage.setItem(USER_KEY, JSON.stringify(state.user));
  setAuthMessage("");
  updateVisibleScreen();
  bootstrapApp();
}

function logout() {
  stopCamera();
  state.token = "";
  state.user = null;
  state.exams = [];
  state.submissions = [];
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  updateVisibleScreen();
}

async function saveExam() {
  try {
    updateExamMetaFromInputs();
    const method = state.currentExamId ? "PUT" : "POST";
    const url = state.currentExamId ? `/api/exams/${state.currentExamId}` : "/api/exams";
    const payload = await api(url, {
      method,
      body: {
        title: state.examTitle,
        subject: state.subject,
        className: state.className,
        shift: state.shift,
        questionCount: state.questionCount,
        choiceCount: state.choiceCount,
        officialAnswers: state.officialAnswers
      }
    });

    state.currentExamId = payload.exam.id;
    els.studentClassName.value = payload.exam.className;
    els.studentShift.value = payload.exam.shift;
    els.studentSubject.value = payload.exam.subject;
    await refreshRemoteData();
    render();
    setAppMessage("Gabarito salvo online com sucesso.");
  } catch (error) {
    setAppMessage(error.message, true);
  }
}

async function loadExamIntoForm(examId) {
  try {
    const payload = await api(`/api/exams/${examId}`);
    const exam = payload.exam;
    state.currentExamId = exam.id;
    state.examTitle = exam.title;
    state.subject = exam.subject;
    state.className = exam.className;
    state.shift = exam.shift;
    state.questionCount = exam.questionCount;
    state.choiceCount = exam.choiceCount;
    state.officialAnswers = exam.officialAnswers;
    state.studentAnswers = Array.from({ length: state.questionCount }, () => null);
    state.hasUnsavedSubmission = false;

    syncInputsFromState();
    els.studentClassName.value = exam.className;
    els.studentShift.value = exam.shift;
    els.studentSubject.value = exam.subject;
    render();
    setAppMessage("Gabarito carregado.");
  } catch (error) {
    setAppMessage(error.message, true);
  }
}

function resetExamForm() {
  state.currentExamId = null;
  state.examTitle = "Prova Objetiva";
  state.subject = "Matematica";
  state.className = "Turma A";
  state.shift = "Manhã";
  state.questionCount = 10;
  state.choiceCount = 5;
  state.officialAnswers = Array.from({ length: state.questionCount }, () => 0);
  state.studentAnswers = Array.from({ length: state.questionCount }, () => null);
  state.hasUnsavedSubmission = false;

  els.studentName.value = "";
  els.studentClassName.value = state.className;
  els.studentShift.value = state.shift;
  els.studentSubject.value = state.subject;
  syncInputsFromState();
  render();
  setAppMessage("Novo gabarito pronto para cadastro.");
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setAppMessage("Seu navegador nao suporta acesso a camera.", true);
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });
    els.cameraFeed.srcObject = state.stream;
    els.captureBtn.disabled = false;
    els.stopCameraBtn.disabled = false;
    els.startCameraBtn.disabled = true;
  } catch (error) {
    setAppMessage("Nao foi possivel abrir a camera.", true);
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  els.cameraFeed.srcObject = null;
  els.captureBtn.disabled = true;
  els.stopCameraBtn.disabled = true;
  els.startCameraBtn.disabled = false;
}

function captureAndGrade() {
  if (!state.currentExamId) {
    setAppMessage("Salve o gabarito online antes de corrigir o aluno.", true);
    return;
  }

  const video = els.cameraFeed;
  if (!video.videoWidth || !video.videoHeight) {
    setAppMessage("A camera ainda nao esta pronta para captura.", true);
    return;
  }

  const canvas = els.captureCanvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  state.studentAnswers = detectMarkedAnswers(context, canvas.width, canvas.height);
  state.hasUnsavedSubmission = true;
  render();
}

async function saveSubmission() {
  if (!state.currentExamId) {
    setAppMessage("Nenhum gabarito foi salvo para vincular esta correcao.", true);
    return;
  }

  const studentName = els.studentName.value.trim();
  const className = els.studentClassName.value.trim();
  const shift = els.studentShift.value;
  const subject = els.studentSubject.value.trim();

  if (!studentName || !className || !shift || !subject) {
    setAppMessage("Preencha nome do aluno, turma, turno e disciplina.", true);
    return;
  }

  try {
    await api("/api/submissions", {
      method: "POST",
      body: {
        examId: state.currentExamId,
        studentName,
        className,
        shift,
        subject,
        studentAnswers: state.studentAnswers,
        score: computeScore(),
        totalQuestions: state.questionCount
      }
    });

    state.hasUnsavedSubmission = false;
    await refreshRemoteData();
    render();
    setAppMessage("Correcao salva online com sucesso.");
  } catch (error) {
    setAppMessage(error.message, true);
  }
}

function detectMarkedAnswers(context, width, height) {
  const grid = calculateGuideGrid(width, height, state.questionCount, state.choiceCount);
  return grid.map((choices) => {
    const darknessLevels = choices.map((area) => sampleDarkness(context, area));
    const darkest = Math.max(...darknessLevels);
    const average = darknessLevels.reduce((sum, value) => sum + value, 0) / darknessLevels.length;
    const selectedIndex = darknessLevels.indexOf(darkest);
    return darkest > average * 1.22 && darkest > 90 ? selectedIndex : null;
  });
}

function calculateGuideGrid(width, height, questionCount, choiceCount) {
  const guideWidth = width * 0.62;
  const guideHeight = guideWidth * 1.38;
  const startX = (width - guideWidth) / 2;
  const startY = (height - guideHeight) / 2;
  const topOffset = guideHeight * 0.18;
  const usableHeight = guideHeight * 0.72;
  const leftOffset = guideWidth * 0.17;
  const usableWidth = guideWidth * 0.58;
  const rowGap = usableHeight / questionCount;
  const colGap = usableWidth / choiceCount;
  const radius = Math.min(colGap, rowGap) * 0.28;

  return Array.from({ length: questionCount }, (_, rowIndex) => (
    Array.from({ length: choiceCount }, (_, colIndex) => ({
      cx: startX + leftOffset + (colIndex + 0.5) * colGap,
      cy: startY + topOffset + (rowIndex + 0.5) * rowGap,
      radius
    }))
  ));
}

function sampleDarkness(context, area) {
  const x = Math.max(0, Math.floor(area.cx - area.radius));
  const y = Math.max(0, Math.floor(area.cy - area.radius));
  const size = Math.max(2, Math.floor(area.radius * 2));
  const imageData = context.getImageData(x, y, size, size);
  const { data } = imageData;
  let totalDarkness = 0;
  let counted = 0;

  for (let pos = 0; pos < data.length; pos += 4) {
    const px = ((pos / 4) % size) - size / 2;
    const py = Math.floor((pos / 4) / size) - size / 2;
    if ((px * px) + (py * py) > (size / 2) * (size / 2)) {
      continue;
    }

    const brightness = (data[pos] + data[pos + 1] + data[pos + 2]) / 3;
    totalDarkness += 255 - brightness;
    counted += 1;
  }

  return counted ? totalDarkness / counted : 0;
}

function computeScore() {
  return state.studentAnswers.reduce((total, answer, index) => (
    total + (answer !== null && answer === state.officialAnswers[index] ? 1 : 0)
  ), 0);
}

function setAuthMessage(message, isError = false) {
  els.authMessage.textContent = message;
  els.authMessage.className = `message ${message ? "visible" : ""} ${isError ? "error" : "success"}`;
}

function setAppMessage(message, isError = false) {
  els.appMessage.textContent = message;
  els.appMessage.className = `message ${message ? "visible" : ""} ${isError ? "error" : "success"}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.auth === false ? {} : { Authorization: `Bearer ${state.token}` })
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Falha ao processar sua solicitacao.");
  }
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.addEventListener("beforeunload", stopCamera);
init();
